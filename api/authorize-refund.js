import { requireApplicationAuth } from '../lib/application-auth.js';
import { FINANCE_CAPABLE_OPERATORS } from '../lib/operator-tiers.js';
import { canonicalRuntimeMetadata, durableId, runtimeEnvironment, runtimeOwnerToken } from '../lib/durable-runtime-semantics.js';
const REQUEST_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBLIGATION_ID_RE=/^(?:preview:obligation:|wfc:obligation:)[0-9a-f-]{36}$/i;
function serialize(r,idempotent=false){return {remedyId:String(r.remedy_id),obligationId:String(r.obligation_id),sourceExceptionId:String(r.source_exception_id),kind:String(r.kind),quantity:Number(r.quantity),unit:String(r.unit),amountMinor:Number(r.amount_minor),currency:String(r.currency),status:String(r.status),authorizeEventId:String(r.authorize_event_id),authorizedAt:String(r.authorized_at),idempotent};}
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'PREVIEW_REFUND_DISABLED_IN_PRODUCTION'});
 const principal=await requireApplicationAuth(req,res,'operator:refund.authorize',FINANCE_CAPABLE_OPERATORS);if(!principal)return;
 const runtime=canonicalRuntimeMetadata({principal,environment:runtimeEnvironment()});const ownerToken=runtimeOwnerToken(runtime.environment);
 const connectionString=process.env.DATABASE_URL;if(!connectionString)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 const obligationId=typeof req.body?.obligationId==='string'?req.body.obligationId:'';const requestId=typeof req.body?.requestId==='string'?req.body.requestId:'';
 if(!OBLIGATION_ID_RE.test(obligationId))return res.status(400).json({ok:false,error:'OBLIGATION_ID_INVALID'});if(!REQUEST_ID_RE.test(requestId))return res.status(400).json({ok:false,error:'REQUEST_ID_INVALID'});
 try{
  const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
  const prior=await sql`SELECT * FROM preview_refund_remedy WHERE obligation_id=${obligationId} OR authorize_request_id=${requestId} LIMIT 1`;
  if(prior[0]){if(String(prior[0].obligation_id)!==obligationId)return res.status(409).json({ok:false,error:'REFUND_AUTH_REQUEST_REBOUND'});return res.status(200).json({ok:true,remedy:serialize(prior[0],true)});}
  const remedyId=durableId('remedy'),eventId=durableId('event'),commandId=durableId('command');
  const rows=await sql`
   WITH source AS (
    SELECT e.exception_id,e.obligation_id,e.affected_quantity,e.unit,c.participant_id,c.committed_price_minor,c.currency,c.quantity AS committed_quantity,
           p.payment_id,p.evidence_id,p.provider_reference AS payment_provider_reference,p.amount_minor AS settled_minor
      FROM preview_fulfillment_exception e
      JOIN preview_member_commitment c ON c.obligation_id=e.obligation_id
      JOIN preview_sandbox_payment p ON p.obligation_id=e.obligation_id AND p.status='CONFIRMED' AND p.currency=c.currency AND p.economic_treatment='RESTRICTED_MEMBER_PREPAYMENT'
     WHERE e.obligation_id=${obligationId} AND e.kind IN ('SHORTFALL','REJECTION') AND e.affected_quantity>0
     FOR UPDATE OF c,p
   ), allocated AS (
    SELECT s.*,COALESCE((SELECT sum(r.amount_minor) FROM preview_refund_remedy r WHERE r.obligation_id=s.obligation_id AND r.status IN ('AUTHORIZED','COMPLETED')),0)::bigint AS prior_refund_minor,
           round((s.committed_price_minor::numeric*s.affected_quantity)/s.committed_quantity)::bigint AS exception_refund_minor
      FROM source s
   ), refundable AS (
    SELECT *,GREATEST(settled_minor-prior_refund_minor,0)::bigint AS remaining_settled_minor FROM allocated
     WHERE settled_minor>prior_refund_minor
   ), remedy AS (
    INSERT INTO preview_refund_remedy(remedy_id,obligation_id,source_exception_id,participant_id,kind,quantity,unit,amount_minor,currency,status,authorize_request_id,authorize_command_id,authorize_event_id,authorized_at)
    SELECT ${remedyId},obligation_id,exception_id,participant_id,'REFUND',affected_quantity,unit,LEAST(exception_refund_minor,remaining_settled_minor),currency,'AUTHORIZED',${requestId},${commandId},${eventId},now()
      FROM refundable WHERE LEAST(exception_refund_minor,remaining_settled_minor)>0 RETURNING *
   ), cmd AS (
    INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,result_json,created_at,updated_at)
    SELECT ${requestId},${commandId},'COMMITTED',${ownerToken},now(),1,jsonb_build_object('status','AUTHORIZED','obligationId',obligation_id,'remedyId',remedy_id,'eventIds',jsonb_build_array(${eventId}::text)),now(),now() FROM remedy RETURNING command_id
   ), ver AS (
    UPDATE aggregate_version av SET version=av.version+1 FROM remedy r WHERE av.aggregate_id=r.obligation_id RETURNING av.aggregate_id,av.version
   ), ev AS (
    INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
    SELECT ${eventId},r.obligation_id,v.version,'REMEDY_AUTHORIZED',jsonb_build_object('operatorId',${runtime.actorId}::text,'remedyId',r.remedy_id,'sourceExceptionId',r.source_exception_id,'kind',r.kind,'quantity',jsonb_build_object('amount',r.quantity,'unit',r.unit),'amount',jsonb_build_object('minor',r.amount_minor,'currency',r.currency),'authorizedCommandId',${commandId}::text,'environment',${runtime.environment}::text),r.authorized_at FROM remedy r JOIN ver v ON v.aggregate_id=r.obligation_id RETURNING event_id
   ) SELECT r.* FROM remedy r JOIN cmd ON true JOIN ev ON ev.event_id=r.authorize_event_id`;
  if(!rows[0])return res.status(409).json({ok:false,error:'NO_SETTLED_REFUNDABLE_AMOUNT'});return res.status(201).json({ok:true,remedy:serialize(rows[0],false)});
 }catch(error){
  if(error?.code==='23505'){try{const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString);const prior=await sql`SELECT * FROM preview_refund_remedy WHERE obligation_id=${obligationId} OR authorize_request_id=${requestId} LIMIT 1`;if(prior[0]){if(String(prior[0].obligation_id)!==obligationId)return res.status(409).json({ok:false,error:'REFUND_AUTH_REQUEST_REBOUND'});return res.status(200).json({ok:true,remedy:serialize(prior[0],true)});}}catch{}}
  console.error('Refund authorization failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'REFUND_AUTHORIZATION_FAILED'});
 }
}
