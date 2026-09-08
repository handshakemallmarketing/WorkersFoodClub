import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresDurableCommandStore} from '../../dist/packages/durability/src/postgres.js';

class MemoryPgDb {
 constructor(){this.rows=new Map();}
 pool(){return {connect:async()=>({query:async(sql,params=[])=>this.query(sql,params),release(){}})}};
 async query(sql,params){
  const q=sql.replace(/\s+/g,' ').trim();
  if(q.startsWith('BEGIN')||q==='COMMIT'||q==='ROLLBACK') return {rows:[],rowCount:0};
  if(q.startsWith('INSERT INTO durable_command_execution')){
   const [key,commandId,owner,lease,now]=params;
   if(!this.rows.has(key)) this.rows.set(key,{idempotency_key:key,command_id:commandId,state:'IN_FLIGHT',owner_token:owner,lease_until:lease,fence_generation:1,result_json:null,created_at:now,updated_at:now});
   return {rows:[],rowCount:0};
  }
  if(q.startsWith('SELECT idempotency_key')){
   const row=this.rows.get(params[0]); return {rows:row?[structuredClone(row)]:[],rowCount:row?1:0};
  }
  if(q.startsWith('UPDATE durable_command_execution SET owner_token=')){
   const [key,owner,lease,now]=params; const row=this.rows.get(key);
   if(row&&row.state==='IN_FLIGHT'&&Date.parse(row.lease_until)<=Date.parse(now)){
    row.owner_token=owner;row.lease_until=lease;row.fence_generation=(row.fence_generation??1)+1;row.updated_at=now;
    return {rows:[structuredClone(row)],rowCount:1};
   }
   return {rows:[],rowCount:0};
  }
  if(q.startsWith("UPDATE durable_command_execution SET state='COMMITTED'")){
   const [key,commandId,owner,fence,result,now]=params; const row=this.rows.get(key);
   if(row&&row.command_id===commandId&&row.state==='IN_FLIGHT'&&row.owner_token===owner&&row.fence_generation===fence){row.state='COMMITTED';row.result_json=structuredClone(result);row.updated_at=now;return {rows:[structuredClone(row)],rowCount:1};}
   return {rows:[],rowCount:0};
  }
  if(q.startsWith('DELETE FROM durable_command_execution')){
   const [key,commandId,owner,fence]=params; const row=this.rows.get(key);
   if(row&&row.command_id===commandId&&row.state==='IN_FLIGHT'&&row.owner_token===owner&&row.fence_generation===fence){this.rows.delete(key);return {rows:[],rowCount:1};}
   return {rows:[],rowCount:0};
  }
  throw new Error(`UNSUPPORTED_SQL:${q}`);
 }
}

const result={status:'ACCEPTED',eventIds:['event:purchase'],replayed:false};
const at=iso=>()=>new Date(iso);

test('INV-027 PostgreSQL adapter gives one active lease owner and replays committed result',async()=>{
 const db=new MemoryPgDb();
 const a=new PostgresDurableCommandStore(db.pool(),'worker:a',30000,at('2026-09-07T14:00:00Z'));
 const b=new PostgresDurableCommandStore(db.pool(),'worker:b',30000,at('2026-09-07T14:00:10Z'));
 assert.equal(await a.claim('idem:1','cmd:1'),'CLAIMED');
 assert.equal(await b.claim('idem:1','cmd:1'),'IN_FLIGHT');
 assert.deepEqual(await a.commit('idem:1','cmd:1',result),result);
 const replay=await b.claim('idem:1','cmd:1');
 assert.equal(replay.status,'ACCEPTED');assert.equal(replay.replayed,true);assert.deepEqual(replay.eventIds,['event:purchase']);
});

test('crashed worker lease expires and a new worker can take ownership',async()=>{
 const db=new MemoryPgDb();
 const crashed=new PostgresDurableCommandStore(db.pool(),'worker:crashed',30000,at('2026-09-07T14:00:00Z'));
 assert.equal(await crashed.claim('idem:crash','cmd:crash'),'CLAIMED');
 const early=new PostgresDurableCommandStore(db.pool(),'worker:recovery',30000,at('2026-09-07T14:00:20Z'));
 assert.equal(await early.claim('idem:crash','cmd:crash'),'IN_FLIGHT');
 const recovered=new PostgresDurableCommandStore(db.pool(),'worker:recovery',30000,at('2026-09-07T14:00:31Z'));
 assert.equal(await recovered.claim('idem:crash','cmd:crash'),'CLAIMED');
 await assert.rejects(()=>crashed.commit('idem:crash','cmd:crash',result),/DURABLE_FENCE_NOT_OWNED/);
 assert.deepEqual(await recovered.commit('idem:crash','cmd:crash',result),result);
});

test('idempotency key cannot be rebound to another command after durable claim',async()=>{
 const db=new MemoryPgDb();const a=new PostgresDurableCommandStore(db.pool(),'worker:a',30000,at('2026-09-07T14:00:00Z'));
 await a.claim('idem:identity','cmd:a');
 await assert.rejects(()=>a.claim('idem:identity','cmd:b'),/IDEMPOTENCY_KEY_COMMAND_CONFLICT/);
});

test('only current lease owner can abandon durable in-flight execution',async()=>{
 const db=new MemoryPgDb();const a=new PostgresDurableCommandStore(db.pool(),'worker:a',30000,at('2026-09-07T14:00:00Z'));const b=new PostgresDurableCommandStore(db.pool(),'worker:b',30000,at('2026-09-07T14:00:01Z'));
 await a.claim('idem:abandon','cmd:abandon');await b.abandon('idem:abandon','cmd:abandon');assert.equal(await b.claim('idem:abandon','cmd:abandon'),'IN_FLIGHT');
 await a.abandon('idem:abandon','cmd:abandon');assert.equal(await b.claim('idem:abandon','cmd:abandon'),'CLAIMED');
});
