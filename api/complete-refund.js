import {randomUUID} from 'node:crypto';
import { requirePreviewApiAuth } from '../lib/preview-api-auth.js';
const REQUEST_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBLIGATION_ID_RE=/^preview:obligation:[0-9a-f-]{36}$/i;
const OPERATOR_ID='preview:operator:001';

function serialize(r,idempotent=false){return {remedyId:String(r.remedy_id),obligationId:String(r.obligation_id),sourceExceptionId:String(r.source_exception_id),kind:String(r.kind),quantity:Number(r.quantity),unit:String(r.unit),amountMinor:Number(r.amount_minor),currency:String(r.currency),status:String(r.status),completionEventId:r.completion_event_id?String(r.completion_event_id):null,provider:r.provider?String(r.provider):null,providerReference:r.provider_reference?String(r.provider_reference):null,completedAt:r.completed_at?String(r.completed_at):null,idempotent};}

export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'PREVIEW_REFUND_DISABLED_IN_PRODUCTION'});

  const principal = requirePreviewApiAuth(
    req,
    res,
    'operator:refund.complete',
    OPERATOR_ID,
  );
  if (!principal) return;
 const connectionString=process.env.DATABASE_URL;if(!connectionString)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 const obligationId=typeof req.body?.obligationId==='string'?req.body.obligationId:'';const requestId=typeof req.body?.requestId==='string'?req.body.requestId:'';
 if(!OBLIGATION_ID_RE.test(obligationId))return res.status(400).json({ok:false,error:'OBLIGATION_ID_INVALID'});
 if(!REQUEST_ID_RE.test(requestId))return res.status(400).json({ok:false,error:'REQUEST_ID_INVALID'});
 try{
  const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
  const prior=await sql`SELECT * FROM preview_refund_remedy WHERE obligation_id=${obligationId} LIMIT 1`;
  if(!prior[0])return res.status(409).json({ok:false,error:'REFUND_NOT_AUTHORIZED'});
  if(prior[0].status==='COMPLETED')return res.status(200).json({ok:true,remedy:serialize(prior[0],true)});
  const eventId=`preview:event:${randomUUID()}`,commandId=`preview:command:${randomUUID()}`,providerReference=`sandbox-refund:${randomUUID()}`;
  const rows=await sql`
   WITH target AS (
    SELECT * FROM preview_refund_remedy WHERE obligation_id=${obligationId} AND status='AUTHORIZED' FOR UPDATE
   ), upd AS (
    UPDATE preview_refund_remedy r SET status='COMPLETED',complete_request_id=${requestId},complete_command_id=${commandId},completion_event_id=${eventId},provider='SANDBOX_MOMO',provider_reference=${providerReference},completed_at=now(),updated_at=now()
      FROM target t WHERE r.remedy_id=t.remedy_id RETURNING r.*
   ), cmd AS (
    INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,result_json,created_at,updated_at)
    SELECT ${requestId},${commandId},'COMMITTED','vercel-preview',now(),1,jsonb_build_object('status','COMPLETED','obligationId',obligation_id,'remedyId',remedy_id,'eventIds',jsonb_build_array(${eventId}::text)),now(),now() FROM upd RETURNING command_id
   ), ver AS (
    UPDATE aggregate_version av SET version=av.version+1 FROM upd u WHERE av.aggregate_id=u.obligation_id RETURNING av.aggregate_id,av.version
   ), ev AS (
    INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
    SELECT ${eventId},u.obligation_id,v.version,'REMEDY_COMPLETED',jsonb_build_object('operatorId',${OPERATOR_ID}::text,'remedyId',u.remedy_id,'sourceExceptionId',u.source_exception_id,'kind',u.kind,'quantity',jsonb_build_object('amount',u.quantity,'unit',u.unit),'amount',jsonb_build_object('minor',u.amount_minor,'currency',u.currency),'provider',u.provider,'providerReference',u.provider_reference,'authorizedCommandId',${commandId}::text,'environment','preview'),u.completed_at FROM upd u JOIN ver v ON v.aggregate_id=u.obligation_id RETURNING event_id
   ), obligation_done AS (
    UPDATE preview_member_commitment c SET state='FULFILLED' FROM upd u WHERE c.obligation_id=u.obligation_id RETURNING c.obligation_id
   )
   SELECT u.* FROM upd u JOIN cmd ON true JOIN ev ON ev.event_id=u.completion_event_id JOIN obligation_done d ON d.obligation_id=u.obligation_id`;
  if(!rows[0])return res.status(409).json({ok:false,error:'REFUND_NOT_COMPLETABLE'});
  return res.status(201).json({ok:true,remedy:serialize(rows[0],false)});
 }catch(error){
  if(error?.code==='23505'){
   try{const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString);const prior=await sql`SELECT * FROM preview_refund_remedy WHERE obligation_id=${obligationId} LIMIT 1`;if(prior[0]?.status==='COMPLETED')return res.status(200).json({ok:true,remedy:serialize(prior[0],true)});}catch{}
  }
  console.error('Refund completion failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'REFUND_COMPLETION_FAILED'});
 }
}
