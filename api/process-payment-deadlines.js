import crypto from 'node:crypto';
import { requireApplicationAuth } from '../lib/application-auth.js';
import { FULFILLMENT_CAPABLE_OPERATORS } from '../lib/operator-tiers.js';

const MAX_BATCH = 100;

function stableId(prefix, obligationId) {
  return `${prefix}:${crypto.createHash('sha256').update(obligationId).digest('hex').slice(0, 32)}`;
}

async function processOne(sql, obligationId) {
  const balanceId = stableId('prepaid:deadline', obligationId);
  const planId = stableId('plan:deadline', obligationId);
  const rows = await sql`
    WITH src AS (
      SELECT c.*, o.delivery_at, COALESCE(o.demand_qualification_bps,3000)::int demand_qualification_bps,
        COALESCE((SELECT sum(p.amount_minor) FROM preview_sandbox_payment p WHERE p.obligation_id=c.obligation_id AND p.status='CONFIRMED'),0)::bigint paid_minor
      FROM preview_member_commitment c JOIN preview_member_offer o ON o.offer_id=c.offer_id
      WHERE c.obligation_id=${obligationId} AND c.state='OPEN' AND c.deadline_processed_at IS NULL
        AND o.delivery_at IS NOT NULL AND now() >= o.delivery_at - interval '24 hours'
      FOR UPDATE OF c
    ), calc AS (
      SELECT s.*,
        CASE WHEN paid_minor >= committed_price_minor THEN 'FULLY_PAID'
          WHEN paid_minor*10000 >= committed_price_minor*7000 THEN 'PRORATED_FULFILLMENT'
          WHEN paid_minor*10000 >= committed_price_minor*5000 THEN 'CURRENT_BATCH_RESCHEDULE'
          WHEN paid_minor*10000 >= committed_price_minor*demand_qualification_bps THEN 'DEMAND_QUALIFIED' ELSE 'UNQUALIFIED' END tier,
        CASE WHEN paid_minor >= committed_price_minor THEN quantity
          WHEN paid_minor*10000 >= committed_price_minor*7000 THEN floor(quantity*paid_minor::numeric/NULLIF(committed_price_minor,0)) ELSE 0 END fulfill_qty
      FROM src s
    ), econ AS (
      SELECT c.*,
        CASE WHEN tier='PRORATED_FULFILLMENT' THEN LEAST(paid_minor,floor(committed_price_minor*fulfill_qty/NULLIF(quantity,0))::bigint)
          WHEN tier='FULLY_PAID' THEN paid_minor ELSE 0 END applied_minor,
        CASE WHEN tier IN ('UNQUALIFIED','DEMAND_QUALIFIED') THEN quantity
          WHEN tier='PRORATED_FULFILLMENT' THEN quantity-fulfill_qty ELSE 0 END release_qty
      FROM calc c
    ), balance AS (
      INSERT INTO member_prepaid_balance_ledger(balance_entry_id,participant_id,membership_id,obligation_id,amount_minor,source_paid_minor,applied_to_fulfillment_minor)
      SELECT ${balanceId},participant_id,membership_id,obligation_id,paid_minor-applied_minor,paid_minor,applied_minor FROM econ
      WHERE tier IN ('UNQUALIFIED','DEMAND_QUALIFIED','PRORATED_FULFILLMENT') AND paid_minor-applied_minor > 0
      ON CONFLICT(obligation_id,reason) DO NOTHING RETURNING amount_minor
    ), plan AS (
      INSERT INTO preview_deadline_fulfillment_plan(plan_id,obligation_id,disposition,planned_quantity,released_quantity,unit,source_tier)
      SELECT ${planId},obligation_id,CASE WHEN tier='CURRENT_BATCH_RESCHEDULE' THEN 'RESCHEDULE_REQUIRED' ELSE 'READY_TO_FULFILL' END,
        CASE WHEN tier='CURRENT_BATCH_RESCHEDULE' THEN quantity ELSE fulfill_qty END,release_qty,unit,tier FROM econ
      WHERE tier IN ('CURRENT_BATCH_RESCHEDULE','PRORATED_FULFILLMENT','FULLY_PAID') AND (tier='CURRENT_BATCH_RESCHEDULE' OR fulfill_qty > 0)
      ON CONFLICT(obligation_id) DO NOTHING RETURNING plan_id,disposition,planned_quantity,state
    ), upd AS (
      UPDATE preview_member_commitment m SET qualification_state=CASE WHEN e.tier='FULLY_PAID' THEN 'FULLY_PAID'
          WHEN e.tier='CURRENT_BATCH_RESCHEDULE' THEN 'CURRENT_BATCH_RESCHEDULE' ELSE 'DEADLINE_PROCESSED' END,
        deadline_processed_at=now(),released_quantity=e.release_qty FROM econ e WHERE m.obligation_id=e.obligation_id
      RETURNING m.obligation_id,m.qualification_state,m.released_quantity
    )
    SELECT e.obligation_id,e.tier,e.paid_minor,e.applied_minor,e.release_qty,e.fulfill_qty,
      (SELECT amount_minor FROM balance LIMIT 1) prepaid_balance_minor,(SELECT plan_id FROM plan LIMIT 1) plan_id,
      (SELECT disposition FROM plan LIMIT 1) plan_disposition,(SELECT planned_quantity FROM plan LIMIT 1) planned_quantity
    FROM econ e JOIN upd u ON u.obligation_id=e.obligation_id`;
  if (rows[0]) return { processed: true, idempotent: false, disposition: rows[0] };
  const prior = await sql`SELECT c.obligation_id,c.qualification_state,c.released_quantity,c.deadline_processed_at,p.plan_id,p.disposition AS plan_disposition,p.planned_quantity,p.state AS plan_state FROM preview_member_commitment c LEFT JOIN preview_deadline_fulfillment_plan p ON p.obligation_id=c.obligation_id WHERE c.obligation_id=${obligationId}`;
  if (prior[0]?.deadline_processed_at) return { processed: true, idempotent: true, disposition: prior[0] };
  return { processed: false, error: 'DEADLINE_NOT_DUE_OR_NOT_PROCESSABLE' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok:false,error:'METHOD_NOT_ALLOWED' }); }
  if (process.env.VERCEL_ENV === 'production') return res.status(403).json({ ok:false,error:'DEADLINE_PROCESSOR_NOT_LIVE_AUTHORIZED' });
  const principal = await requireApplicationAuth(req,res,'operator:fulfillment.manage',FULFILLMENT_CAPABLE_OPERATORS); if (!principal) return;
  const cs=process.env.DATABASE_URL; if(!cs) return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try {
    const {neon}=await import('@neondatabase/serverless'); const sql=neon(cs,{fetchOptions:{signal:AbortSignal.timeout(10000)}});
    const requestedId=String(req.body?.obligationId||'').trim();
    if(requestedId){const result=await processOne(sql,requestedId);if(!result.processed)return res.status(409).json({ok:false,error:result.error});return res.status(200).json({ok:true,idempotent:result.idempotent,disposition:result.disposition,cashRefundMinor:0,penaltyMinor:0});}
    const due=await sql`SELECT c.obligation_id FROM preview_member_commitment c JOIN preview_member_offer o ON o.offer_id=c.offer_id WHERE c.state='OPEN' AND c.deadline_processed_at IS NULL AND o.delivery_at IS NOT NULL AND now() >= o.delivery_at - interval '24 hours' ORDER BY o.delivery_at,c.created_at LIMIT ${MAX_BATCH}`;
    const results=[];
    for(const row of due){const obligationId=String(row.obligation_id);try{results.push({obligationId,...await processOne(sql,obligationId)});}catch(e){console.error('Deadline obligation failed',{obligationId,name:e?.name,code:e?.code,message:e?.message});results.push({obligationId,processed:false,idempotent:false,error:'DEADLINE_OBLIGATION_FAILED'});}}
    const failed=results.filter(r=>!r.processed);
    return res.status(200).json({ok:failed.length===0,batch:true,scanned:due.length,processed:results.filter(r=>r.processed&&!r.idempotent).length,idempotent:results.filter(r=>r.idempotent).length,failed:failed.length,remainingMayExist:due.length===MAX_BATCH,results,cashRefundMinor:0,penaltyMinor:0});
  } catch(e){console.error('Deadline processor failed',{name:e?.name,code:e?.code,message:e?.message});return res.status(503).json({ok:false,error:'DEADLINE_PROCESSOR_FAILED'});}
}
