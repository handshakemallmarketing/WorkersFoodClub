import { requirePreviewApiAuth } from '../lib/preview-api-auth.js';
const PREVIEW_PICKUP_PLACE='preview:pickup:001';

export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}

  const principal = requirePreviewApiAuth(
    req,
    res,
    'operator:orders.read',
    'preview:operator:001',
  );
  if (!principal) return;
 const connectionString=process.env.DATABASE_URL;if(!connectionString)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 try{
  const {neon}=await import('@neondatabase/serverless');const sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(4000)}});
  const rows=await sql`
   SELECT c.obligation_id,c.participant_id,o.name AS offer_name,c.quantity,c.unit,
          p.status AS payment_status,p.canonical_event_id AS payment_event_id,
          f.fulfillment_id,f.state AS fulfillment_state,f.ready_at,f.accepted_quantity,f.shortfall_quantity,
          x.exception_id,x.kind AS exception_kind,x.affected_quantity,
          r.remedy_id,r.status AS remedy_status,r.amount_minor AS remedy_amount_minor,r.currency AS remedy_currency,
          r.authorize_event_id,r.completion_event_id,r.provider_reference AS refund_provider_reference
     FROM preview_member_commitment c
     JOIN preview_member_offer o ON o.offer_id=c.offer_id
     JOIN preview_sandbox_payment p ON p.obligation_id=c.obligation_id AND p.status='CONFIRMED'
LEFT JOIN preview_fulfillment f ON f.obligation_id=c.obligation_id
LEFT JOIN preview_fulfillment_exception x ON x.obligation_id=c.obligation_id
LEFT JOIN preview_refund_remedy r ON r.obligation_id=c.obligation_id
 ORDER BY c.created_at DESC LIMIT 50`;
  const orders=rows.map(r=>({obligationId:String(r.obligation_id),participantId:String(r.participant_id),offerName:String(r.offer_name),quantity:Number(r.quantity),unit:String(r.unit),pickupPlace:PREVIEW_PICKUP_PLACE,paymentStatus:String(r.payment_status),paymentEventId:String(r.payment_event_id),fulfillment:r.fulfillment_id?{fulfillmentId:String(r.fulfillment_id),state:String(r.fulfillment_state),readyAt:r.ready_at?String(r.ready_at):null,acceptedQuantity:r.accepted_quantity===null?null:Number(r.accepted_quantity),shortfallQuantity:r.shortfall_quantity===null?null:Number(r.shortfall_quantity)}:null,exception:r.exception_id?{exceptionId:String(r.exception_id),kind:String(r.exception_kind),affectedQuantity:Number(r.affected_quantity)}:null,remedy:r.remedy_id?{remedyId:String(r.remedy_id),status:String(r.remedy_status),amountMinor:Number(r.remedy_amount_minor),currency:String(r.remedy_currency),authorizeEventId:String(r.authorize_event_id),completionEventId:r.completion_event_id?String(r.completion_event_id):null,providerReference:r.refund_provider_reference?String(r.refund_provider_reference):null}:null}));
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,source:'neon-server',orders});
 }catch(error){console.error('Operator order query failed',{name:error?.name,message:error?.message});return res.status(503).json({ok:false,error:'OPERATOR_ORDERS_FETCH_FAILED'});}
}
