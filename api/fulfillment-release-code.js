import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { requireApplicationAuth } from '../lib/application-auth.js';
const MEMBER='preview:member:001';
const ID=/^(?:preview:fulfillment:|wfc:fulfillment:)[0-9a-f-]{36}$/i;
const hash=v=>createHash('sha256').update(v).digest('hex');
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({ok:false,error:'PREVIEW_RELEASE_CODE_DISABLED_IN_PRODUCTION'});
 const principal=await requireApplicationAuth(req,res,'member:orders.read',MEMBER);if(!principal)return;
 const fulfillmentId=typeof req.body?.fulfillmentId==='string'?req.body.fulfillmentId:'';if(!ID.test(fulfillmentId))return res.status(400).json({ok:false,error:'FULFILLMENT_ID_INVALID'});
 const cs=process.env.DATABASE_URL;if(!cs)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
 try{const {neon}=await import('@neondatabase/serverless');const sql=neon(cs,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
  const owned=await sql`SELECT f.fulfillment_id,f.obligation_id FROM preview_fulfillment f JOIN preview_member_commitment c ON c.obligation_id=f.obligation_id WHERE f.fulfillment_id=${fulfillmentId} AND c.participant_id=${String(principal.actorId)} AND f.state='READY' LIMIT 1`;
  if(!owned[0])return res.status(404).json({ok:false,error:'READY_FULFILLMENT_NOT_FOUND'});
  await sql`UPDATE fulfillment_release_code SET state='REVOKED' WHERE fulfillment_id=${fulfillmentId} AND state='ACTIVE'`;
  const code=randomBytes(9).toString('base64url'),id=`release:${randomUUID()}`,expires=new Date(Date.now()+24*60*60*1000).toISOString();
  await sql`INSERT INTO fulfillment_release_code(release_code_id,fulfillment_id,obligation_id,code_hash,issued_by_actor_id,expires_at,state) VALUES(${id},${fulfillmentId},${String(owned[0].obligation_id)},${hash(code)},${String(principal.actorId)},${expires},'ACTIVE')`;
  res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,releaseCode:code,expiresAt:expires});
 }catch(e){console.error('Release code issuance failed',{name:e?.name,code:e?.code,message:e?.message});return res.status(503).json({ok:false,error:'RELEASE_CODE_ISSUE_FAILED'});}
}
