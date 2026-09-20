import { createHash } from 'node:crypto';
import { requirePreviewApiAuth } from './preview-api-auth.js';
import { verifyProductionOidcRequest } from './production-oidc-auth.js';
import { resolveApplicationPrincipal } from './application-principal-binding.js';
import { requireProductionApplicationAccess } from './production-access-policy.js';
import { extractEmployeeSessionToken } from './employee-session.js';

const MEMBER_SCOPES = new Set(['member:purchase.commit','member:payment.execute','member:fulfillment.accept','member:orders.read','member:notifications.read','member:engagement.survey']);
const sha=v=>createHash('sha256').update(String(v)).digest('hex');
function sendFailure(res,result){res.setHeader('Cache-Control','no-store');res.status(result.status).json({ok:false,error:result.error});return null;}
function bearer(req){const value=String(req.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():'';}
async function resolveNativeMember(req,requiredScope,options){
 if(!MEMBER_SCOPES.has(requiredScope))return null;
 const token=bearer(req);if(!token.startsWith('wfc_'))return null;
 let sql=options.sql;if(!sql){const env=options.env||process.env;if(!env.DATABASE_URL)return{ok:false,status:503,error:'DATABASE_URL_MISSING'};const{neon}=await import('@neondatabase/serverless');sql=neon(env.DATABASE_URL,{fetchOptions:{signal:AbortSignal.timeout(4000)}});}
 const sessionId=`member-session:${sha(token)}`;
 const rows=await sql`SELECT s.participant_id,s.membership_id,s.state,s.expires_at,m.state AS membership_state,m.standing FROM member_session s JOIN application_membership m ON m.membership_id=s.membership_id WHERE s.session_id=${sessionId} LIMIT 2`;
 if(rows.length!==1)return{ok:false,status:401,error:'MEMBER_SESSION_INVALID'};const r=rows[0];
 if(String(r.state)!=='ACTIVE'||new Date(r.expires_at).getTime()<=Number(options.now??Date.now()))return{ok:false,status:401,error:'MEMBER_SESSION_EXPIRED'};
 if(String(r.membership_state)!=='ACTIVE'||!['ACTIVE','GRACE'].includes(String(r.standing)))return{ok:false,status:403,error:'MEMBERSHIP_NOT_ACTIVE'};
 return{ok:true,principal:{actorId:String(r.participant_id),participantId:String(r.participant_id),membershipId:String(r.membership_id),scopes:[...MEMBER_SCOPES],authMethod:'WFC_MEMBER_SESSION'}};
}

/** Environment-aware application authentication boundary. Preview retains the RC2 verifier. Production accepts the authoritative WFC member session for member scopes; governed workforce/OIDC identity remains a separate authority path. */
export async function requireApplicationAuth(req,res,requiredScope,previewExpectedActorId,options={}){
 const env=options.env||process.env;
 if((env.VERCEL_ENV||process.env.VERCEL_ENV)!=='production')return requirePreviewApiAuth(req,res,requiredScope,previewExpectedActorId,options.now??Date.now());
 const access=requireProductionApplicationAccess(env);if(!access.ok)return sendFailure(res,access);
 try{const native=await resolveNativeMember(req,requiredScope,options);if(native){if(!native.ok)return sendFailure(res,native);return native.principal;}}catch(error){console.error('Native member session resolution failed',{name:error?.name,code:error?.code});return sendFailure(res,{status:503,error:'MEMBER_SESSION_LOOKUP_FAILED'});}
 const verified=await verifyProductionOidcRequest(req,requiredScope,undefined,options.production||{});if(!verified.ok)return sendFailure(res,verified);
 const resolver=options.bindingResolver||resolveApplicationPrincipal;const bound=await resolver({issuer:verified.principal.issuer,subject:verified.principal.subject,expiresAt:verified.principal.expiresAt},requiredScope,{employeeSessionToken:extractEmployeeSessionToken(req),...options.binding});if(!bound.ok)return sendFailure(res,bound);return bound.principal;
}
