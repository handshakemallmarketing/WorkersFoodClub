import { requireApplicationAuth } from '../lib/application-auth.js';
import { FULFILLMENT_CAPABLE_OPERATORS } from '../lib/operator-tiers.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const principal=await requireApplicationAuth(req,res,'operator:fulfillment.manage',FULFILLMENT_CAPABLE_OPERATORS);if(!principal)return;
 const cs=process.env.DATABASE_URL;if(!cs)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 try{const {neon}=await import('@neondatabase/serverless');const sql=neon(cs,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
  const rows=await sql`SELECT c.offer_id,o.name,o.unit,sum(c.quantity)::numeric AS qualified_quantity,count(*)::int AS qualified_commitments,sum(c.committed_price_minor)::bigint AS committed_minor,sum(COALESCE((SELECT sum(p.amount_minor) FROM preview_sandbox_payment p WHERE p.obligation_id=c.obligation_id AND p.status='CONFIRMED'),0))::bigint AS paid_minor FROM preview_member_commitment c JOIN preview_member_offer o ON o.offer_id=c.offer_id WHERE c.state='OPEN' AND c.qualification_state IN ('QUALIFIED','FULLY_PAID') GROUP BY c.offer_id,o.name,o.unit ORDER BY o.name,c.offer_id`;
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,qualificationThresholdPercent:30,fullPaymentDeadlineHoursBeforeDelivery:24,demand:rows.map(r=>({offerId:String(r.offer_id),name:String(r.name),unit:String(r.unit),qualifiedQuantity:Number(r.qualified_quantity),qualifiedCommitments:Number(r.qualified_commitments),committedMinor:Number(r.committed_minor),paidMinor:Number(r.paid_minor)}))});
 }catch(e){console.error('Qualified demand projection failed',{name:e?.name,code:e?.code,message:e?.message});return res.status(503).json({ok:false,error:'QUALIFIED_DEMAND_FAILED'});}
}
