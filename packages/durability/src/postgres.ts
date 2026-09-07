import type {CommandResult} from '../../contracts/src/index.js';
import type {DurableCommandStore} from './index.js';

export interface PgQueryResult<T=Record<string,unknown>>{readonly rows:readonly T[];readonly rowCount:number;}
export interface PgClient {query<T=Record<string,unknown>>(sql:string,params?:readonly unknown[]):Promise<PgQueryResult<T>>;release?():void;}
export interface PgPool {connect():Promise<PgClient>;}

type Row={idempotency_key:string;command_id:string;state:'IN_FLIGHT'|'COMMITTED';owner_token:string;lease_until:string;result_json:CommandResult|null};
const iso=(d:Date)=>d.toISOString();

export class PostgresDurableCommandStore implements DurableCommandStore {
 constructor(private readonly pool:PgPool,private readonly ownerToken:string,private readonly leaseMs=30_000,private readonly now:()=>Date=()=>new Date()){
  if(!ownerToken.trim()) throw new Error('DURABLE_OWNER_TOKEN_REQUIRED');
  if(!Number.isInteger(leaseMs)||leaseMs<=0) throw new Error('DURABLE_LEASE_INVALID');
 }
 private async tx<T>(fn:(c:PgClient)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const out=await fn(c);await c.query('COMMIT');return out;}catch(error){try{await c.query('ROLLBACK');}catch{}throw error;}finally{c.release?.();}}
 async claim(key:string,commandId:string):Promise<'CLAIMED'|'IN_FLIGHT'|CommandResult>{
  if(!key.trim()||!commandId.trim()) throw new Error('DURABLE_COMMAND_IDENTITY_REQUIRED');
  return this.tx(async c=>{const now=this.now(),leaseUntil=new Date(now.getTime()+this.leaseMs);await c.query(`INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,created_at,updated_at) VALUES($1,$2,'IN_FLIGHT',$3,$4,$5,$5) ON CONFLICT (idempotency_key) DO NOTHING`,[key,commandId,this.ownerToken,iso(leaseUntil),iso(now)]);const found=await c.query<Row>('SELECT idempotency_key,command_id,state,owner_token,lease_until,result_json FROM durable_command_execution WHERE idempotency_key=$1 FOR UPDATE',[key]);const row=found.rows[0];if(!row)throw new Error('DURABLE_CLAIM_LOST');if(row.command_id!==commandId)throw new Error('IDEMPOTENCY_KEY_COMMAND_CONFLICT');if(row.state==='COMMITTED'){if(!row.result_json)throw new Error('DURABLE_COMMITTED_RESULT_MISSING');return Object.freeze({...row.result_json,eventIds:[...row.result_json.eventIds],replayed:true});}if(row.owner_token===this.ownerToken)return 'CLAIMED';if(Date.parse(row.lease_until)>now.getTime())return 'IN_FLIGHT';const takeover=await c.query(`UPDATE durable_command_execution SET owner_token=$2,lease_until=$3,updated_at=$4 WHERE idempotency_key=$1 AND state='IN_FLIGHT' AND lease_until<=$4`,[key,this.ownerToken,iso(leaseUntil),iso(now)]);return takeover.rowCount===1?'CLAIMED':'IN_FLIGHT';});
 }
 async commit(key:string,commandId:string,result:CommandResult):Promise<CommandResult>{return this.tx(async c=>{const now=iso(this.now());const updated=await c.query<Row>(`UPDATE durable_command_execution SET state='COMMITTED',result_json=$4,updated_at=$5 WHERE idempotency_key=$1 AND command_id=$2 AND state='IN_FLIGHT' AND owner_token=$3 RETURNING idempotency_key,command_id,state,owner_token,lease_until,result_json`,[key,commandId,this.ownerToken,result,now]);if(updated.rowCount===1){const row=updated.rows[0];if(!row?.result_json)throw new Error('DURABLE_COMMITTED_RESULT_MISSING');return row.result_json;}const found=await c.query<Row>('SELECT idempotency_key,command_id,state,owner_token,lease_until,result_json FROM durable_command_execution WHERE idempotency_key=$1 FOR UPDATE',[key]);const row=found.rows[0];if(!row||row.command_id!==commandId)throw new Error('DURABLE_CLAIM_REQUIRED');if(row.state==='COMMITTED'&&row.result_json)return row.result_json;throw new Error('DURABLE_CLAIM_NOT_OWNED');});}
 async abandon(key:string,commandId:string):Promise<void>{await this.tx(async c=>{await c.query(`DELETE FROM durable_command_execution WHERE idempotency_key=$1 AND command_id=$2 AND state='IN_FLIGHT' AND owner_token=$3`,[key,commandId,this.ownerToken]);});}
}

export interface PendingCanonicalEvent{readonly eventId:string;readonly eventType:string;readonly payload:unknown;readonly occurredAt:string;}
export interface DurableDomainCommit{readonly idempotencyKey:string;readonly commandId:string;readonly ownerToken:string;readonly aggregateId:string;readonly expectedVersion:number;readonly events:readonly PendingCanonicalEvent[];readonly result:CommandResult;}

/** Canonical events, aggregate version and command result are committed atomically. */
export class PostgresDomainCommitter{
 constructor(private readonly pool:PgPool,private readonly now:()=>Date=()=>new Date()){}
 async commit(input:DurableDomainCommit):Promise<CommandResult>{
  if(!input.idempotencyKey.trim()||!input.commandId.trim()||!input.ownerToken.trim()||!input.aggregateId.trim())throw new Error('DURABLE_DOMAIN_IDENTITY_REQUIRED');
  if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<0)throw new Error('EXPECTED_VERSION_INVALID');
  const c=await this.pool.connect();try{await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   const claim=await c.query<Row>('SELECT idempotency_key,command_id,state,owner_token,lease_until,result_json FROM durable_command_execution WHERE idempotency_key=$1 FOR UPDATE',[input.idempotencyKey]);const owned=claim.rows[0];if(!owned||owned.command_id!==input.commandId)throw new Error('DURABLE_CLAIM_REQUIRED');if(owned.state==='COMMITTED'){if(!owned.result_json)throw new Error('DURABLE_COMMITTED_RESULT_MISSING');await c.query('COMMIT');return Object.freeze({...owned.result_json,eventIds:[...owned.result_json.eventIds],replayed:true});}if(owned.owner_token!==input.ownerToken)throw new Error('DURABLE_CLAIM_NOT_OWNED');
   await c.query('INSERT INTO aggregate_version(aggregate_id,version) VALUES($1,0) ON CONFLICT DO NOTHING',[input.aggregateId]);const current=await c.query<{version:string|number}>('SELECT version FROM aggregate_version WHERE aggregate_id=$1 FOR UPDATE',[input.aggregateId]);let version=Number(current.rows[0]?.version??0);if(version!==input.expectedVersion)throw new Error('EXPECTED_VERSION_CONFLICT');
   for(const event of input.events){if(!event.eventId.trim()||!event.eventType.trim()||Number.isNaN(Date.parse(event.occurredAt)))throw new Error('CANONICAL_EVENT_INVALID');version++;await c.query('INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6)',[event.eventId,input.aggregateId,version,event.eventType,event.payload,event.occurredAt]);}
   await c.query('UPDATE aggregate_version SET version=$2 WHERE aggregate_id=$1',[input.aggregateId,version]);const committed=Object.freeze({...input.result,eventIds:[...input.result.eventIds],replayed:false});const updated=await c.query(`UPDATE durable_command_execution SET state='COMMITTED',result_json=$4,updated_at=$5 WHERE idempotency_key=$1 AND command_id=$2 AND state='IN_FLIGHT' AND owner_token=$3`,[input.idempotencyKey,input.commandId,input.ownerToken,committed,iso(this.now())]);if(updated.rowCount!==1)throw new Error('DURABLE_CLAIM_NOT_OWNED');await c.query('COMMIT');return committed;
  }catch(error){try{await c.query('ROLLBACK');}catch{}throw error;}finally{c.release?.();}
 }
}
