import {randomUUID} from 'node:crypto';
const PARTICIPANT_ID='preview:member:001';
const REQUEST_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBLIGATION_ID_RE=/^preview:obligation:[0-9a-f-]{36}$/i;

export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'PREVIEW_ACCEPTANCE_DISABLED_IN_PRODUCTION'});
 const connectionString=process.env.DATABASE_URL;if(!connectionString)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 const obligationId=typeof req.body?.obligationId==='string'?req.body.obligationId:'';const requestId=typeof req.body?.requestId==='string'?req.body.requestId:'';const acceptedQuantity=Number(req.body?.acceptedQuantity);
 if(!OBLIGATION_ID_RE.test(obligationId))return res.status(400).json({ok:false,error:'OBLIGATION_ID_INVALID'});
 if(!REQUEST_ID_RE.test(requestId))return res.status(400).json({ok:false,error:'REQUEST_ID_INVALID'});
 if(!Number.isFinite(acceptedQuantity)||acceptedQuantity<0)return res.status(400).json({ok:false,error:'ACCEPTED_QUANTITY_INVALID'});
 try{
  const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
  const prior=await sql`SELECT * FROM preview_fulfillment WHERE obligation_id=${obligationId} LIMIT 1`;
  if(!prior[0])return res.status(409).json({ok:false,error:'FULFILLMENT_NOT_READY'});
  if(prior[0].state!=='READY')return res.status(200).json({ok:true,acceptance:{obligationId,state:String(prior[0].state),acceptedQuantity:Number(prior[0].accepted_quantity),shortfallQuantity:Number(prior[0].shortfall_quantity),acceptanceEventId:String(prior[0].acceptance_event_id),idempotent:true}});
  const readyQuantity=Number(prior[0].ready_quantity);if(acceptedQuantity>readyQuantity)return res.status(400).json({ok:false,error:'ACCEPTED_QUANTITY_EXCEEDS_READY'});
  const shortfall=readyQuantity-acceptedQuantity;const state=acceptedQuantity===readyQuantity?'ACCEPTED':acceptedQuantity===0?'REJECTED':'PARTIALLY_ACCEPTED';
  const acceptanceId=`preview:acceptance:${randomUUID()}`,acceptEventId=`preview:event:${randomUUID()}`,exceptionId=shortfall>0?`preview:exception:${randomUUID()}`:null,exceptionEventId=shortfall>0?`preview:event:${randomUUID()}`:null,commandId=`preview:command:${randomUUID()}`;
  const rows=await sql`
   WITH target AS (
    SELECT f.fulfillment_id,f.obligation_id,f.ready_quantity,f.unit,f.pickup_place,c.participant_id
      FROM preview_fulfillment f JOIN preview_member_commitment c ON c.obligation_id=f.obligation_id
     WHERE f.obligation_id=${obligationId} AND f.state='READY' AND c.participant_id=${PARTICIPANT_ID} FOR UPDATE OF f
   ), upd AS (
    UPDATE preview_fulfillment f SET state=${state},acceptance_request_id=${requestId},acceptance_id=${acceptanceId},acceptance_event_id=${acceptEventId},participant_id=${PARTICIPANT_ID},accepted_quantity=${acceptedQuantity},shortfall_quantity=${shortfall},accepted_at=now(),updated_at=now()
      FROM target t WHERE f.fulfillment_id=t.fulfillment_id RETURNING f.*
   ), cmd AS (
    INSERT INTO durable_command_execution(idempotency_key,command_id,state,owner_token,lease_until,fence_generation,result_json,created_at,updated_at)
    SELECT ${requestId},${commandId},'COMMITTED','vercel-preview',now(),1,jsonb_build_object('status',${state}::text,'obligationId',obligation_id,'acceptanceId',${acceptanceId}::text,'eventIds',CASE WHEN ${shortfall}>0 THEN jsonb_build_array(${acceptEventId}::text,${exceptionEventId}::text) ELSE jsonb_build_array(${acceptEventId}::text) END),now(),now() FROM upd RETURNING command_id
   ), ver AS (
    UPDATE aggregate_version av SET version=av.version+(CASE WHEN ${shortfall}>0 THEN 2 ELSE 1 END)
      FROM upd u WHERE av.aggregate_id=u.obligation_id
      RETURNING av.aggregate_id,av.version AS final_version
   ), ev1 AS (
    INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
    SELECT ${acceptEventId},u.obligation_id,(CASE WHEN ${shortfall}>0 THEN v.final_version-1 ELSE v.final_version END),'FULFILLMENT_ACCEPTED',jsonb_build_object('participantId',${PARTICIPANT_ID}::text,'state',u.state,'acceptedQuantity',jsonb_build_object('amount',u.accepted_quantity,'unit',u.unit),'shortfallQuantity',jsonb_build_object('amount',u.shortfall_quantity,'unit',u.unit),'authorizedCommandId',${commandId}::text,'environment','preview'),u.accepted_at FROM upd u JOIN ver v ON v.aggregate_id=u.obligation_id RETURNING event_id
   ), ex AS (
    INSERT INTO preview_fulfillment_exception(exception_id,fulfillment_id,obligation_id,acceptance_id,kind,affected_quantity,unit,canonical_event_id,occurred_at)
    SELECT ${exceptionId},u.fulfillment_id,u.obligation_id,${acceptanceId},CASE WHEN ${state}='REJECTED' THEN 'REJECTION' ELSE 'SHORTFALL' END,u.shortfall_quantity,u.unit,${exceptionEventId},u.accepted_at FROM upd u WHERE ${shortfall}>0 RETURNING *
   ), ev2 AS (
    INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
    SELECT ${exceptionEventId},e.obligation_id,v.final_version,'FULFILLMENT_EXCEPTION',jsonb_build_object('exceptionId',e.exception_id,'acceptanceId',e.acceptance_id,'kind',e.kind,'affectedQuantity',jsonb_build_object('amount',e.affected_quantity,'unit',e.unit),'authorizedCommandId',${commandId}::text,'environment','preview'),e.occurred_at FROM ex e JOIN ver v ON v.aggregate_id=e.obligation_id WHERE ${shortfall}>0 RETURNING event_id
   )
   SELECT u.obligation_id,u.state,u.accepted_quantity,u.shortfall_quantity,u.acceptance_event_id FROM upd u JOIN cmd ON true JOIN ev1 ON ev1.event_id=u.acceptance_event_id
   WHERE ${shortfall}=0 OR EXISTS (SELECT 1 FROM ev2 WHERE event_id=${exceptionEventId})`;
  if(!rows[0])return res.status(409).json({ok:false,error:'FULFILLMENT_NOT_ACCEPTABLE'});
  return res.status(201).json({ok:true,acceptance:{obligationId:String(rows[0].obligation_id),state:String(rows[0].state),acceptedQuantity:Number(rows[0].accepted_quantity),shortfallQuantity:Number(rows[0].shortfall_quantity),acceptanceEventId:String(rows[0].acceptance_event_id),idempotent:false}});
 }catch(error){console.error('Fulfillment acceptance failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'FULFILLMENT_ACCEPTANCE_FAILED'});}
}
