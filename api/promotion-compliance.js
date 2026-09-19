import crypto from 'node:crypto';
import { requireApplicationAuth } from '../lib/application-auth.js';
import { PROMOTIONS_CAPABLE_OPERATORS } from '../lib/operator-tiers.js';

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const principal=await requireApplicationAuth(req,res,'operator:promotions.manage',PROMOTIONS_CAPABLE_OPERATORS);if(!principal)return;
  const cs=process.env.DATABASE_URL;if(!cs)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try{const {neon}=await import('@neondatabase/serverless');const sql=neon(cs,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
    if(req.method==='GET'){const promotionId=String(req.query?.promotionId||'').trim();if(!promotionId)return res.status(400).json({ok:false,error:'PROMOTION_ID_REQUIRED'});const rows=await sql`SELECT evidence_id,promotion_id,evidence_type,reference,state,recorded_by,recorded_at,revoked_at FROM promotion_compliance_evidence WHERE promotion_id=${promotionId} ORDER BY recorded_at DESC`;return res.status(200).json({ok:true,evidence:rows});}
    const b=req.body||{};const promotionId=String(b.promotionId||'').trim(),type=String(b.evidenceType||'').trim(),reference=String(b.reference||'').trim();
    if(!promotionId||!['RAFFLE_LEGAL_REVIEW','RAFFLE_RULES_APPROVAL','OTHER'].includes(type)||!reference)return res.status(400).json({ok:false,error:'PROMOTION_COMPLIANCE_FIELDS_INVALID'});
    const actor=String(principal.actorId||principal.participantId||'').trim();if(!actor)return res.status(403).json({ok:false,error:'PROMOTION_COMPLIANCE_ACTOR_REQUIRED'});
    const id=`promo-evidence:${crypto.randomUUID()}`;const rows=await sql`INSERT INTO promotion_compliance_evidence(evidence_id,promotion_id,evidence_type,reference,recorded_by) SELECT ${id},p.promotion_id,${type},${reference},${actor} FROM promotion_campaign p WHERE p.promotion_id=${promotionId} AND p.promotion_type='RAFFLE' RETURNING evidence_id,promotion_id,evidence_type,reference,state,recorded_by,recorded_at`;
    if(!rows[0])return res.status(404).json({ok:false,error:'RAFFLE_PROMOTION_NOT_FOUND'});return res.status(201).json({ok:true,evidence:rows[0]});
  }catch(e){console.error('Promotion compliance failed',{message:e?.message});return res.status(503).json({ok:false,error:'PROMOTION_COMPLIANCE_FAILED'});}
}
