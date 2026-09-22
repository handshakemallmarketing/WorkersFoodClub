import { createHash, randomBytes, randomInt } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { createMemberChallengeDelivery } from '../lib/member-auth-challenge-delivery.js';
const sha=v=>createHash('sha256').update(String(v)).digest('hex');
function access(env){if((env.VERCEL_ENV||'unknown')==='preview')return{ok:true};return requireProductionApplicationAccess(env);}
function challengeCode(env,options){if(options.code!==undefined)return String(options.code);const preview=(env.VERCEL_ENV||'')==='preview',expose=env.MEMBER_AUTH_PREVIEW_EXPOSE_CODE==='true',fixed=String(env.MEMBER_AUTH_PREVIEW_FIXED_OTP||'').trim();if(preview&&expose&&/^\d{6}$/.test(fixed))return fixed;return String(randomInt(100000,1000000));}
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const env=options.env||process.env,a=access(env);if(!a.ok)return res.status(a.status).json({ok:false,error:a.error});
 const memberId=String(req.body?.memberId||'').trim().toUpperCase(),channel=String(req.body?.channel||'EMAIL').toUpperCase();
 if(!memberId)return res.status(400).json({ok:false,error:'MEMBER_ID_REQUIRED'});if(!['EMAIL','PHONE'].includes(channel))return res.status(400).json({ok:false,error:'CHANNEL_INVALID'});
 if(channel==='EMAIL')return res.status(409).json({ok:false,error:'VERIFICATION_CHANNEL_UNAVAILABLE'});
 try{let sql=options.sql;if(!sql){if(!env.DATABASE_URL)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});const{neon}=await import('@neondatabase/serverless');sql=neon(env.DATABASE_URL,{fetchOptions:{signal:AbortSignal.timeout(4000)}});}
  const rows=await sql`SELECT m.membership_id,m.participant_id,m.state,m.standing,a.email,a.phone FROM application_membership m LEFT JOIN membership_application a ON a.resulting_membership_id=m.membership_id WHERE upper(m.public_member_id)=upper(${memberId}) ORDER BY a.submitted_at DESC NULLS LAST LIMIT 2`;
  if(rows.length!==1)return res.status(404).json({ok:false,error:'MEMBER_NOT_ELIGIBLE'});const member=rows[0],state=String(member.state),standing=String(member.standing);
  const authEligible=(state==='INACTIVE'&&standing==='INITIAL_FEE_DUE')||(state==='ACTIVE'&&['ACTIVE','GRACE'].includes(standing));if(!authEligible)return res.status(404).json({ok:false,error:'MEMBER_NOT_ELIGIBLE'});
  const destination=channel==='EMAIL'?member.email:member.phone;if(!destination)return res.status(409).json({ok:false,error:'VERIFICATION_CHANNEL_UNAVAILABLE'});
  const code=challengeCode(env,options),challengeId=`challenge:${randomBytes(16).toString('hex')}`,expiresAt=new Date((options.now??Date.now())+10*60*1000).toISOString();
  const created=await sql`SELECT challenge_id FROM create_member_auth_challenge(${challengeId},${String(member.membership_id)},${channel},${sha(String(destination).trim().toLowerCase())},${sha(code)},${expiresAt})`;if(created.length!==1)return res.status(429).json({ok:false,error:'CHALLENGE_RATE_LIMITED'});
  const previewExpose=(env.VERCEL_ENV||'')==='preview'&&env.MEMBER_AUTH_PREVIEW_EXPOSE_CODE==='true';
  try{const deliver=options.deliverChallenge||(previewExpose?null:createMemberChallengeDelivery({sql,env,fetchImpl:options.fetchImpl||fetch}));if(deliver)await deliver({channel,destination,code,memberId});else if(!previewExpose)throw Object.assign(new Error('CHALLENGE_DELIVERY_NOT_CONFIGURED'),{code:'CHALLENGE_DELIVERY_NOT_CONFIGURED'});}catch(deliveryError){await sql`UPDATE member_auth_challenge SET state='REVOKED' WHERE challenge_id=${challengeId} AND state='OPEN'`;console.error('Member challenge delivery failed',{channel,code:deliveryError?.code,message:deliveryError?.message});return res.status(503).json({ok:false,error:'CHALLENGE_DELIVERY_FAILED',failureCode:String(deliveryError?.code||'CHALLENGE_DELIVERY_FAILED')});}
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,challengeId,channel,expiresAt,delivery:previewExpose?'PREVIEW_CODE':'DELIVERED',...(previewExpose?{previewCode:code}:{})});
 }catch(error){console.error('Member challenge failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBER_CHALLENGE_FAILED'});}
}
