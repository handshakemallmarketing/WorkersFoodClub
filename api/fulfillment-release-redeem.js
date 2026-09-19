import { createHash } from 'node:crypto';
import { requireApplicationAuth } from '../lib/application-auth.js';
import { OPERATOR_ADMIN_ACTOR_ID } from '../lib/operator-tiers.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'PREVIEW_RELEASE_CODE_DISABLED_IN_PRODUCTION'});
 const principal=await requireApplicationAuth(req,res,'operator:release.manage',[OPERATOR_ADMIN_ACTOR_ID]);if(!principal)return;
 const code=typeof req.body?.releaseCode==='string'?req.body.releaseCode.trim():'';if(code.length<10||code.length>64)return res.status(400).json({ok:false,error:'RELEASE_CODE_INVALID'});
 const cs=process.env.DATABASE_URL;if(!cs)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 try{const {neon}=await import('@neondatabase/serverless');const sql=neon(cs,{fetchOptions:{signal:AbortSignal.timeout(5000)}});const digest=hash(code);
  const rows=await sql`UPDATE fulfillment_release_code SET state='REDEEMED',redeemed_at=now(),redeemed_by_actor_id=${String(principal.actorId)} WHERE code_hash=${digest} AND state='ACTIVE' AND expires_at>now() RETURNING release_code_id,fulfillment_id,obligation_id,redeemed_at`;
  if(!rows[0])return res.status(409).json({ok:false,error:'RELEASE_CODE_NOT_ACTIVE'});
  return res.status(200).json({ok:true,release:{releaseCodeId:String(rows[0].release_code_id),fulfillmentId:String(rows[0].fulfillment_id),obligationId:String(rows[0].obligation_id),redeemedAt:String(rows[0].redeemed_at)}});
 }catch(e){console.error('Release code redemption failed',{name:e?.name,code:e?.code,message:e?.message});return res.status(503).json({ok:false,error:'RELEASE_CODE_REDEEM_FAILED'});}
}
