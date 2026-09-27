import { requireApplicationAuth } from '../lib/application-auth.js';
import { FULFILLMENT_CAPABLE_OPERATORS } from '../lib/operator-tiers.js';

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'FULFILLMENT_PLAN_SCHEDULING_NOT_LIVE_AUTHORIZED'});
  const principal=await requireApplicationAuth(req,res,'operator:fulfillment.manage',FULFILLMENT_CAPABLE_OPERATORS);if(!principal)return;
  const planId=String(req.body?.planId||'').trim();const targetRaw=String(req.body?.targetDeliveryAt||'').trim();const target=new Date(targetRaw);
  if(!planId||!targetRaw||!Number.isFinite(target.getTime()))return res.status(400).json({ok:false,error:'FULFILLMENT_PLAN_SCHEDULE_FIELDS_INVALID'});
  if(target.getTime()<=Date.now())return res.status(400).json({ok:false,error:'TARGET_DELIVERY_MUST_BE_FUTURE'});
  const cs=process.env.DATABASE_URL;if(!cs)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try{const {neon}=await import('@neondatabase/serverless');const sql=neon(cs,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
    const rows=await sql`UPDATE preview_deadline_fulfillment_plan SET target_delivery_at=${target.toISOString()},state='SCHEDULED',updated_at=now() WHERE plan_id=${planId} AND disposition='RESCHEDULE_REQUIRED' AND state='PENDING' RETURNING plan_id,obligation_id,disposition,planned_quantity,target_delivery_at,state`;
    if(rows[0])return res.status(200).json({ok:true,plan:rows[0]});
    const prior=await sql`SELECT plan_id,obligation_id,disposition,planned_quantity,target_delivery_at,state FROM preview_deadline_fulfillment_plan WHERE plan_id=${planId}`;
    if(!prior[0])return res.status(404).json({ok:false,error:'FULFILLMENT_PLAN_NOT_FOUND'});
    if(prior[0].state==='SCHEDULED'&&new Date(prior[0].target_delivery_at).getTime()===target.getTime())return res.status(200).json({ok:true,idempotent:true,plan:prior[0]});
    return res.status(409).json({ok:false,error:'FULFILLMENT_PLAN_NOT_SCHEDULABLE',state:prior[0].state,disposition:prior[0].disposition});
  }catch(e){console.error('Fulfillment plan scheduling failed',{message:e?.message});return res.status(503).json({ok:false,error:'FULFILLMENT_PLAN_SCHEDULING_FAILED'});}
}
