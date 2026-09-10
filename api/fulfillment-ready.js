import {randomUUID} from 'node:crypto';
const REQUEST_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBLIGATION_ID_RE=/^preview:obligation:[0-9a-f-]{36}$/i;
const OPERATOR_ID='preview:operator:001';

export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'PREVIEW_FULFILLMENT_DISABLED_IN_PRODUCTION'});
 const connectionString=process.env.DATABASE_URL;if(!connectionString)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 const obligationId=typeof req.body?.obligationId==='string'?req.body.obligationId:'';const requestId=typeof req.body?.requestId==='string'?req.body.requestId:'';
 if(!OBLIGATION_ID_RE.test(obligationId))return res.status(400).json({ok:false,error:'OBLIGATION_ID_INVALID'});
 if(!REQUEST_ID_RE.test(requestId))return res.status(400).json({ok:false,error:'REQUEST_ID_INVALID'});
 try{
  const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
  const prior=await sql`SELECT * FROM preview_fulfillment WHERE obligation_id=${obligationId} OR ready_request_id=${requestId} LIMIT 1`;
  if(prior[0]){if(String(prior[0].obligation_id)!==obligationId)return res.status(409).json({ok:false,error:'FULFILLMENT_REQUEST_REBOUND'});return res.status(200).json({ok:true,fulfillment:{fulfillmentId:String(prior[0].fulfillment_id),obligationId:String(prior[0].obligation_id),state:String(prior[0].state),readyEventId:String(prior[0].ready_event_id),idempotent:true}});}
  const fulfillmentId=`preview:fulfillment:${randomUUID()}`,eventId=`preview:event:${randomUUID()}`,commandId=`preview:command:${randomUUID()}`;
  const rows=await sql`
   WITH payable AS (
    SELECT c.obligation_id,c.participant_id,c.quantity,c.unit,c.committed_pickup_place
      FROM preview_member_commitment c JOIN preview_sandbox_payment p ON p.obligation_id=c.obligation_id
     WHERE c.obligation_id=${obligationId} AND p.status='CONFIRMED' FOR UPDATE OF c
   ), f AS (
    INSERT INTO preview_fulfillment(fulfillment_id,obligation_id,ready_request_id,ready_event_id,operator_id,ready_quantity,unit,pickup_place,state,ready_at)
    SELECT ${fulfillmentId},obligation_id,${requestId},${eventId},${OPERATOR_ID},quantity,unit,committed_pickup_place,'READY',now() FROM payable RETURNING *
   ), cmd AS (
    INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,result_json,created_at,updated_at)
    SELECT ${requestId},${commandId},'COMMITTED','vercel-preview',now(),1,jsonb_build_object('status','READY','obligationId',obligation_id,'fulfillmentId',fulfillment_id,'eventIds',jsonb_build_array(${eventId}::text)),now(),now() FROM f RETURNING command_id
   ), ver AS (
    UPDATE aggregate_version av SET version=av.version+1 FROM f WHERE av.aggregate_id=f.obligation_id RETURNING av.aggregate_id,av.version
   ), ev AS (
    INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
    SELECT ${eventId},f.obligation_id,v.version,'FULFILLMENT_READY',jsonb_build_object('operatorId',${OPERATOR_ID}::text,'quantity',jsonb_build_object('amount',f.ready_quantity,'unit',f.unit),'pickupPlace',f.pickup_place,'authorizedCommandId',${commandId}::text,'environment','preview'),f.ready_at FROM f JOIN ver v ON v.aggregate_id=f.obligation_id RETURNING event_id
   )
   SELECT f.fulfillment_id,f.obligation_id,f.state,f.ready_event_id,f.ready_at FROM f JOIN cmd ON true JOIN ev ON ev.event_id=f.ready_event_id`;
  if(!rows[0])return res.status(409).json({ok:false,error:'OBLIGATION_NOT_READYABLE'});
  return res.status(201).json({ok:true,fulfillment:{fulfillmentId:String(rows[0].fulfillment_id),obligationId:String(rows[0].obligation_id),state:String(rows[0].state),readyEventId:String(rows[0].ready_event_id),readyAt:String(rows[0].ready_at),idempotent:false}});
 }catch(error){console.error('Fulfillment ready failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'FULFILLMENT_READY_FAILED'});}
}
