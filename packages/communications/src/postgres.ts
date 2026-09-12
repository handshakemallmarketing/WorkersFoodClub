import type {PgPool} from '../../durability/src/postgres.js';
import type {CommunicationRecord,CommunicationChannel,MemberCommunicationPreferences} from './index.js';

export interface PersistedCommunicationPreferences extends MemberCommunicationPreferences {
  readonly consentVersion:number;
  readonly consentUpdatedAt:string;
}

type PreferenceRow={member_id:string;transactional_channels:string[];promotional_opt_in:boolean;promotional_channels:string[];suppressed_channels:string[];consent_version:string|number;consent_updated_at:string|Date};
type CommunicationRow={id:string;event_id:string;member_id:string;subject_id:string;event_type:CommunicationRecord['eventType'];communication_class:CommunicationRecord['class'];template_id:string;template_version:string|number;channel:CommunicationRecord['channel'];rendered_subject:string;rendered_body:string;status:CommunicationRecord['status'];queued_at:string|Date;sent_at:string|Date|null;delivered_at:string|Date|null;failed_at:string|Date|null;provider_message_id:string|null;retry_count:string|number;failure_reason:string|null};

const iso=(v:string|Date)=>v instanceof Date?v.toISOString():new Date(v).toISOString();
const validChannels=(v:readonly string[]):readonly CommunicationChannel[]=>v.map(x=>{if(!['IN_APP','EMAIL','SMS','WHATSAPP'].includes(x))throw new Error('COMMUNICATION_CHANNEL_INVALID');return x as CommunicationChannel;});
const rowToRecord=(r:CommunicationRow):CommunicationRecord=>Object.freeze({id:r.id,eventId:r.event_id,memberId:r.member_id,subjectId:r.subject_id,eventType:r.event_type,class:r.communication_class,templateId:r.template_id,templateVersion:Number(r.template_version),channel:r.channel,renderedSubject:r.rendered_subject,renderedBody:r.rendered_body,status:r.status,queuedAt:iso(r.queued_at),retryCount:Number(r.retry_count),...(r.sent_at?{sentAt:iso(r.sent_at)}:{}),...(r.delivered_at?{deliveredAt:iso(r.delivered_at)}:{}),...(r.failed_at?{failedAt:iso(r.failed_at)}:{}),...(r.provider_message_id?{providerMessageId:r.provider_message_id}:{}),...(r.failure_reason?{failureReason:r.failure_reason}:{})});

export class PostgresCommunicationRepository {
  constructor(private readonly pool:PgPool,private readonly now:()=>Date=()=>new Date()){}

  async savePreferences(input:PersistedCommunicationPreferences):Promise<PersistedCommunicationPreferences>{
    if(!input.memberId.trim()||!Number.isInteger(input.consentVersion)||input.consentVersion<=0||Number.isNaN(Date.parse(input.consentUpdatedAt)))throw new Error('COMMUNICATION_PREFERENCES_INVALID');
    const c=await this.pool.connect();try{await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const current=await c.query<PreferenceRow>('SELECT * FROM member_communication_preferences WHERE member_id=$1 FOR UPDATE',[input.memberId]);
      const prior=current.rows[0];if(prior&&Number(prior.consent_version)>=input.consentVersion)throw new Error('COMMUNICATION_CONSENT_VERSION_NOT_ADVANCING');
      await c.query(`INSERT INTO member_communication_consent_event(member_id,consent_version,promotional_opt_in,transactional_channels,promotional_channels,suppressed_channels,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,[input.memberId,input.consentVersion,input.promotionalOptIn,[...input.transactionalChannels],[...input.promotionalChannels],[...(input.suppressedChannels??[])],input.consentUpdatedAt]);
      await c.query(`INSERT INTO member_communication_preferences(member_id,transactional_channels,promotional_opt_in,promotional_channels,suppressed_channels,consent_version,consent_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(member_id) DO UPDATE SET transactional_channels=EXCLUDED.transactional_channels,promotional_opt_in=EXCLUDED.promotional_opt_in,promotional_channels=EXCLUDED.promotional_channels,suppressed_channels=EXCLUDED.suppressed_channels,consent_version=EXCLUDED.consent_version,consent_updated_at=EXCLUDED.consent_updated_at`,[input.memberId,[...input.transactionalChannels],input.promotionalOptIn,[...input.promotionalChannels],[...(input.suppressedChannels??[])],input.consentVersion,input.consentUpdatedAt]);
      await c.query('COMMIT');return Object.freeze({...input,transactionalChannels:Object.freeze([...input.transactionalChannels]),promotionalChannels:Object.freeze([...input.promotionalChannels]),suppressedChannels:Object.freeze([...(input.suppressedChannels??[])])});
    }catch(error){try{await c.query('ROLLBACK');}catch{}throw error;}finally{c.release?.();}
  }

  async getPreferences(memberId:string):Promise<PersistedCommunicationPreferences|undefined>{
    const c=await this.pool.connect();try{const q=await c.query<PreferenceRow>('SELECT * FROM member_communication_preferences WHERE member_id=$1',[memberId]);const r=q.rows[0];if(!r)return undefined;return Object.freeze({memberId:r.member_id,transactionalChannels:validChannels(r.transactional_channels),promotionalOptIn:r.promotional_opt_in,promotionalChannels:validChannels(r.promotional_channels),suppressedChannels:validChannels(r.suppressed_channels),consentVersion:Number(r.consent_version),consentUpdatedAt:iso(r.consent_updated_at)});}finally{c.release?.();}
  }

  async enqueue(records:readonly CommunicationRecord[]):Promise<readonly CommunicationRecord[]>{
    const c=await this.pool.connect();try{await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const out:CommunicationRecord[]=[];
      for(const record of records){const key=`${record.eventId}|${record.templateId}|${record.templateVersion}|${record.channel}`;const inserted=await c.query<CommunicationRow>(`INSERT INTO communication_outbox(id,dedupe_key,event_id,member_id,subject_id,event_type,communication_class,template_id,template_version,channel,rendered_subject,rendered_body,status,queued_at,available_at,retry_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15) ON CONFLICT(dedupe_key) DO NOTHING RETURNING *`,[record.id,key,record.eventId,record.memberId,record.subjectId,record.eventType,record.class,record.templateId,record.templateVersion,record.channel,record.renderedSubject,record.renderedBody,record.status,record.queuedAt,record.retryCount]);if(inserted.rowCount===1){out.push(rowToRecord(inserted.rows[0]!));continue;}const existing=await c.query<CommunicationRow>('SELECT * FROM communication_outbox WHERE dedupe_key=$1',[key]);const row=existing.rows[0];if(!row)throw new Error('COMMUNICATION_DEDUPE_LOST');out.push(rowToRecord(row));}
      await c.query('COMMIT');return Object.freeze(out);
    }catch(error){try{await c.query('ROLLBACK');}catch{}throw error;}finally{c.release?.();}
  }

  async claimDispatchBatch(workerToken:string,limit=25,leaseMs=30_000):Promise<readonly CommunicationRecord[]>{
    if(!workerToken.trim()||!Number.isInteger(limit)||limit<=0||!Number.isInteger(leaseMs)||leaseMs<=0)throw new Error('COMMUNICATION_DISPATCH_CLAIM_INVALID');const now=this.now(),until=new Date(now.getTime()+leaseMs);const c=await this.pool.connect();try{await c.query('BEGIN');const q=await c.query<CommunicationRow>(`WITH picked AS (SELECT id FROM communication_outbox WHERE status IN ('QUEUED','FAILED') AND available_at<=$1 AND (lease_until IS NULL OR lease_until<=$1) ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE communication_outbox o SET lease_owner=$3,lease_until=$4 FROM picked WHERE o.id=picked.id RETURNING o.*`,[now.toISOString(),limit,workerToken,until.toISOString()]);await c.query('COMMIT');return Object.freeze(q.rows.map(rowToRecord));}catch(error){try{await c.query('ROLLBACK');}catch{}throw error;}finally{c.release?.();}
  }

  async markSent(id:string,workerToken:string,providerMessageId:string,sentAt:string):Promise<void>{const c=await this.pool.connect();try{const q=await c.query(`UPDATE communication_outbox SET status='SENT',sent_at=$3,provider_message_id=$4,lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2 AND status IN ('QUEUED','FAILED')`,[id,workerToken,sentAt,providerMessageId]);if(q.rowCount!==1)throw new Error('COMMUNICATION_DISPATCH_LEASE_NOT_OWNED');}finally{c.release?.();}}
  async markFailed(id:string,workerToken:string,reason:string,failedAt:string,retryDelayMs=60_000):Promise<void>{const c=await this.pool.connect();try{const available=new Date(Date.parse(failedAt)+retryDelayMs).toISOString();const q=await c.query(`UPDATE communication_outbox SET status='FAILED',failed_at=$3,failure_reason=$4,retry_count=retry_count+1,available_at=$5,lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2 AND status IN ('QUEUED','FAILED')`,[id,workerToken,failedAt,reason,available]);if(q.rowCount!==1)throw new Error('COMMUNICATION_DISPATCH_LEASE_NOT_OWNED');}finally{c.release?.();}}
  async markDelivered(id:string,providerMessageId:string,deliveredAt:string):Promise<void>{const c=await this.pool.connect();try{const q=await c.query(`UPDATE communication_outbox SET status='DELIVERED',delivered_at=$3 WHERE id=$1 AND provider_message_id=$2 AND status='SENT'`,[id,providerMessageId,deliveredAt]);if(q.rowCount!==1)throw new Error('COMMUNICATION_DELIVERY_BINDING_INVALID');}finally{c.release?.();}}
  async listInbox(memberId:string,limit=50):Promise<readonly CommunicationRecord[]>{const c=await this.pool.connect();try{const q=await c.query<CommunicationRow>(`SELECT * FROM communication_outbox WHERE member_id=$1 AND channel='IN_APP' ORDER BY queued_at DESC LIMIT $2`,[memberId,limit]);return Object.freeze(q.rows.map(rowToRecord));}finally{c.release?.();}}
}

export interface CommunicationDeliveryAdapter {readonly channel:CommunicationChannel;send(record:CommunicationRecord):Promise<{providerMessageId:string}>;}

export class CommunicationDispatcher {
  constructor(private readonly repository:PostgresCommunicationRepository,private readonly adapters:readonly CommunicationDeliveryAdapter[],private readonly workerToken:string,private readonly now:()=>string=()=>new Date().toISOString()){}
  async run(limit=25):Promise<{sent:number;failed:number}>{const records=await this.repository.claimDispatchBatch(this.workerToken,limit);let sent=0,failed=0;for(const record of records){if(record.channel==='IN_APP'){await this.repository.markSent(record.id,this.workerToken,`in-app:${record.id}`,this.now());sent++;continue;}const adapter=this.adapters.find(a=>a.channel===record.channel);if(!adapter){await this.repository.markFailed(record.id,this.workerToken,'COMMUNICATION_ADAPTER_UNAVAILABLE',this.now());failed++;continue;}try{const result=await adapter.send(record);if(!result.providerMessageId.trim())throw new Error('COMMUNICATION_PROVIDER_MESSAGE_ID_REQUIRED');await this.repository.markSent(record.id,this.workerToken,result.providerMessageId,this.now());sent++;}catch(error){await this.repository.markFailed(record.id,this.workerToken,error instanceof Error?error.message:'COMMUNICATION_DELIVERY_FAILED',this.now());failed++;}}return {sent,failed};}
}
