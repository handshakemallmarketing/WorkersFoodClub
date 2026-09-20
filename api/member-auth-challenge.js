import { createHash, randomBytes, randomInt } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
const sha=v=>createHash('sha256').update(String(v)).digest('hex');
function access(env){if((env.VERCEL_ENV||'unknown')==='preview')return{ok:true};return requireProductionApplicationAccess(env);}
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const env=options.env||process.env,a=access(env);if(!a.ok)return res.status(a.status).json({ok:false,error:a.error});
 const memberId=String(req.body?.memberId||'').trim().toUpperCase(),channel=String(req.body?.channel||'EMAIL').toUpperCase();
 if(!memberId)return res.status(400).json({ok:false,error:'MEMBER_ID_REQUIRED'});if(!['EMAIL','PHONE'].includes(channel))return res.status(400).json({ok:false,error:'CHANNEL_INVALID'});
 if((env.VERCEL_ENV||'')==='production'&&!options.deliverChallenge)return res.status(503).json({ok:false,error:'CHALLENGE_DELIVERY_NOT_CONFIGURED'});
 try{let sql=options.sql;if(!sql){if(!env.DATABASE_URL)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});const{neon}=await import('@neondatabase/serverless');sql=neon(env.DATABASE_URL,{fetchOptions:{signal:AbortSignal.timeout(4000)}});}
  const rows=await sql`SELECT m.membership_id,m.participant_id,m.state,m.standing,a.email,a.phone FROM application_membership m LEFT JOIN membership_application a ON a.resulting_membership_id=m.membership_id WHERE upper(m.public_member_id)=upper(${memberId}) ORDER BY a.submitted_at DESC NULLS LAST LIMIT 2`;
  if(rows.length!==1||String(rows[0].state)!=='ACTIVE'||!['ACTIVE','GRACE'].includes(String(rows[0].standing)))return res.status(404).json({ok:false,error:'MEMBER_NOT_ELIGIBLE'});
  const destination=channel==='EMAIL'?rows[0].email:rows[0].phone;if(!destination)return res.status(409).json({ok:false,error:'VERIFICATION_CHANNEL_UNAVAILABLE'});
  const recent=await sql`SELECT count(*)::int AS count FROM member_auth_challenge WHERE membership_id=${String(rows[0].membership_id)} AND created_at > now()-interval '15 minutes'`;if(Number(recent[0]?.count||0)>=5)return res.status(429).json({ok:false,error:'CHALLENGE_RATE_LIMITED'});
  const code=String(options.code||randomInt(100000,1000000)),challengeId=`challenge:${randomBytes(16).toString('hex')}`,expiresAt=new Date((options.now??Date.now())+10*60*1000).toISOString();
  await sql`INSERT INTO member_auth_challenge(challenge_id,membership_id,channel,destination_hash,code_hash,state,expires_at) VALUES(${challengeId},${String(rows[0].membership_id)},${channel},${sha(String(destination).trim().toLowerCase())},${sha(code)},'OPEN',${expiresAt})`;
  try{if(options.deliverChallenge)await options.deliverChallenge({channel,destination,code,memberId});}catch(deliveryError){await sql`UPDATE member_auth_challenge SET state='REVOKED' WHERE challenge_id=${challengeId} AND state='OPEN'`;throw deliveryError;}
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,challengeId,channel,expiresAt,...((env.VERCEL_ENV||'')==='preview'&&env.MEMBER_AUTH_PREVIEW_EXPOSE_CODE==='true'?{previewCode:code}:{})});
 }catch(error){console.error('Member challenge failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBER_CHALLENGE_FAILED'});}
}
