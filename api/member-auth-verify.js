import { createHash, randomBytes } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
const sha=v=>createHash('sha256').update(String(v)).digest('hex');
function access(env){if((env.VERCEL_ENV||'unknown')==='preview')return{ok:true};return requireProductionApplicationAccess(env);}
export default async function handler(req,res,options={}){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}const env=options.env||process.env,a=access(env);if(!a.ok)return res.status(a.status).json({ok:false,error:a.error});
 const challengeId=String(req.body?.challengeId||''),code=String(req.body?.code||'').trim();if(!challengeId||!/^[0-9]{6}$/.test(code))return res.status(400).json({ok:false,error:'CHALLENGE_AND_CODE_REQUIRED'});
 try{let sql=options.sql;if(!sql){if(!env.DATABASE_URL)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});const{neon}=await import('@neondatabase/serverless');sql=neon(env.DATABASE_URL,{fetchOptions:{signal:AbortSignal.timeout(4000)}});}
  const codeHash=sha(code),now=new Date(Number(options.now??Date.now())).toISOString(),sessionToken=`wfc_${randomBytes(32).toString('base64url')}`,sessionId=`member-session:${sha(sessionToken)}`,expiresAt=new Date(Number(options.now??Date.now())+12*60*60*1000).toISOString();
  const rows=await sql`SELECT * FROM verify_member_auth_challenge(${challengeId},${codeHash},${now},${sessionId},${expiresAt})`;if(rows.length!==1)return res.status(401).json({ok:false,error:'CHALLENGE_INVALID'});const r=rows[0];
  if(String(r.code_hash)!==codeHash)return res.status(Number(r.attempts)>=5||String(r.state)==='REVOKED'?429:401).json({ok:false,error:Number(r.attempts)>=5||String(r.state)==='REVOKED'?'CHALLENGE_LOCKED':'CHALLENGE_INVALID'});
  const membershipState=String(r.membership_state),standing=String(r.standing),preSettlement=membershipState==='INACTIVE'&&standing==='INITIAL_FEE_DUE',normalMember=membershipState==='ACTIVE'&&['ACTIVE','GRACE'].includes(standing);if(!preSettlement&&!normalMember)return res.status(403).json({ok:false,error:'MEMBERSHIP_NOT_AUTHENTICATABLE'});if(String(r.session_id)!==sessionId)throw Object.assign(new Error('MEMBER_SESSION_NOT_CREATED'),{code:'MEMBER_SESSION_NOT_CREATED'});
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,sessionToken,expiresAt,accessState:preSettlement?'MEMBERSHIP_PAYMENT_REQUIRED':'MEMBER_AUTHENTICATED'});
 }catch(error){console.error('Member challenge verify failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBER_AUTH_VERIFY_FAILED'});}
}
