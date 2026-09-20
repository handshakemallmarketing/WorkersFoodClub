import { createHash, randomBytes } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
const sha=v=>createHash('sha256').update(String(v)).digest('hex');
function access(env){if((env.VERCEL_ENV||'unknown')==='preview')return{ok:true};return requireProductionApplicationAccess(env);}
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}const env=options.env||process.env,a=access(env);if(!a.ok)return res.status(a.status).json({ok:false,error:a.error});
 const challengeId=String(req.body?.challengeId||''),code=String(req.body?.code||'').trim();if(!challengeId||!/^[0-9]{6}$/.test(code))return res.status(400).json({ok:false,error:'CHALLENGE_AND_CODE_REQUIRED'});
 try{let sql=options.sql;if(!sql){if(!env.DATABASE_URL)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});const{neon}=await import('@neondatabase/serverless');sql=neon(env.DATABASE_URL,{fetchOptions:{signal:AbortSignal.timeout(4000)}});}
  const rows=await sql`SELECT c.challenge_id,c.membership_id,c.code_hash,c.state,c.attempts,c.expires_at,m.participant_id,m.state AS membership_state,m.standing FROM member_auth_challenge c JOIN application_membership m ON m.membership_id=c.membership_id WHERE c.challenge_id=${challengeId} LIMIT 1`;if(rows.length!==1)return res.status(401).json({ok:false,error:'CHALLENGE_INVALID'});const r=rows[0];
  if(String(r.state)!=='OPEN'||new Date(r.expires_at).getTime()<=Number(options.now??Date.now()))return res.status(401).json({ok:false,error:'CHALLENGE_EXPIRED'});if(Number(r.attempts)>=5)return res.status(429).json({ok:false,error:'CHALLENGE_LOCKED'});
  if(sha(code)!==String(r.code_hash)){await sql`UPDATE member_auth_challenge SET attempts=attempts+1 WHERE challenge_id=${challengeId} AND state='OPEN'`;return res.status(401).json({ok:false,error:'CHALLENGE_INVALID'});}
  if(String(r.membership_state)!=='ACTIVE'||!['ACTIVE','GRACE'].includes(String(r.standing)))return res.status(403).json({ok:false,error:'MEMBERSHIP_NOT_ACTIVE'});
  const sessionToken=`wfc_${randomBytes(32).toString('base64url')}`,sessionId=`member-session:${sha(sessionToken)}`,expiresAt=new Date((options.now??Date.now())+12*60*60*1000).toISOString();const transitioned=await sql`WITH used AS (UPDATE member_auth_challenge SET state='USED',used_at=now() WHERE challenge_id=${challengeId} AND state='OPEN' RETURNING membership_id), created AS (INSERT INTO member_session(session_id,membership_id,participant_id,state,expires_at) SELECT ${sessionId},u.membership_id,${String(r.participant_id)},'ACTIVE',${expiresAt} FROM used u RETURNING session_id) SELECT session_id FROM created`;if(transitioned.length!==1)return res.status(409).json({ok:false,error:'CHALLENGE_ALREADY_USED'});
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,sessionToken,expiresAt});
 }catch(error){console.error('Member challenge verify failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBER_AUTH_VERIFY_FAILED'});}
}
