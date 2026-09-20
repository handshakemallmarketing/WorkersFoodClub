import { randomUUID, createHash } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

const MEMBER_SCOPES=['member:purchase.commit','member:payment.execute','member:fulfillment.accept','member:orders.read','member:notifications.read','member:engagement.survey'];
const MAX_ACTIVE_BENEFICIARIES=2;
function hashToken(token){return createHash('sha256').update(token,'utf8').digest('hex');}

/** Redeem a single-use household invitation into an ACTIVE beneficiary membership. */
export default async function handler(req,res,options={}){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const access=requireProductionApplicationAccess(options.env||process.env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
  const verified=await verifyProductionOidcRequest(req,undefined,undefined,options.production||{});if(!verified.ok)return res.status(verified.status).json({ok:false,error:verified.error});
  const token=req.body?.token;if(typeof token!=='string'||token.length<32||token.length>256)return res.status(400).json({ok:false,error:'HOUSEHOLD_INVITATION_TOKEN_REQUIRED'});
  const connectionString=options.databaseUrl||process.env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try{
    let sql=options.sql;if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
    const tokenHash=hashToken(token);
    const invitations=await sql`SELECT invitation_id,sponsoring_membership_id,state,expires_at FROM household_beneficiary_invitation WHERE token_hash=${tokenHash} LIMIT 2`;
    if(invitations.length!==1)return res.status(404).json({ok:false,error:'HOUSEHOLD_INVITATION_NOT_FOUND'});
    const invitation=invitations[0];if(String(invitation.state)!=='APPROVED_PENDING_ACTIVATION')return res.status(409).json({ok:false,error:'HOUSEHOLD_INVITATION_NOT_ACTIVATABLE'});
    const now=options.now??Date.now();if(!invitation.expires_at||new Date(invitation.expires_at).getTime()<=now)return res.status(410).json({ok:false,error:'HOUSEHOLD_INVITATION_EXPIRED'});
    const sponsorId=String(invitation.sponsoring_membership_id);
    const sponsors=await sql`SELECT membership_id,state,standing,member_type FROM application_membership WHERE membership_id=${sponsorId} LIMIT 1`;
    const sponsor=sponsors[0];
    if(sponsors.length!==1||String(sponsor.state)!=='ACTIVE'||!['ACTIVE','GRACE'].includes(String(sponsor.standing))||String(sponsor.member_type)!=='PRIMARY')return res.status(409).json({ok:false,error:'SPONSOR_MEMBERSHIP_NOT_COMMERCE_ELIGIBLE'});
    // Runtime enforcement: a primary membership may have no more than two active beneficiaries.
    const activeBeneficiaries=await sql`SELECT membership_id FROM application_membership WHERE sponsoring_membership_id=${sponsorId} AND member_type='HOUSEHOLD_BENEFICIARY' AND state='ACTIVE' LIMIT ${MAX_ACTIVE_BENEFICIARIES+1}`;
    if(activeBeneficiaries.length>=MAX_ACTIVE_BENEFICIARIES)return res.status(409).json({ok:false,error:'HOUSEHOLD_BENEFICIARY_LIMIT_REACHED'});
    const bindings=await sql`SELECT participant_id,state FROM application_identity_binding WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} LIMIT 2`;
    if(bindings.length>1)return res.status(503).json({ok:false,error:'APPLICATION_IDENTITY_BINDING_AMBIGUOUS'});if(bindings.length===1&&String(bindings[0].state)!=='ACTIVE')return res.status(403).json({ok:false,error:'APPLICATION_PRINCIPAL_DISABLED'});
    let participantId=bindings.length===1?String(bindings[0].participant_id):null;
    if(participantId){const existingMemberships=await sql`SELECT membership_id,state FROM application_membership WHERE participant_id=${participantId} AND state IN ('INACTIVE','ACTIVE','SUSPENDED') LIMIT 2`;if(existingMemberships.length>0)return res.status(409).json({ok:false,error:'IDENTITY_ALREADY_HAS_MEMBERSHIP'});}
    const claimed=await sql`UPDATE household_beneficiary_invitation SET token_hash=NULL WHERE invitation_id=${String(invitation.invitation_id)} AND state='APPROVED_PENDING_ACTIVATION' AND token_hash=${tokenHash} AND expires_at>now() RETURNING invitation_id`;if(claimed.length!==1)return res.status(409).json({ok:false,error:'HOUSEHOLD_INVITATION_ALREADY_REDEEMED'});
    const nowIso=new Date(now).toISOString();
    if(!participantId){participantId=`participant:${randomUUID()}`;await sql`INSERT INTO application_participant(participant_id,kind,state) VALUES (${participantId},'PERSON','ACTIVE')`;await sql`INSERT INTO application_identity_binding(binding_id,issuer,subject,participant_id,scopes,state,provider_evidence_id,bound_at,bound_by,authority_grant_id) VALUES (${`binding:${randomUUID()}`},${verified.principal.issuer},${verified.principal.subject},${participantId},${MEMBER_SCOPES},'ACTIVE',${`evidence:household-invite:${String(invitation.invitation_id)}`},${nowIso},${participantId},NULL)`;}else{await sql`UPDATE application_identity_binding SET scopes=${MEMBER_SCOPES} WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} AND participant_id=${participantId} AND state='ACTIVE'`;}
    const membershipId=`membership:${randomUUID()}`;const publicMemberId=`WFC-H-${randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`;
    await sql`INSERT INTO application_membership(membership_id,participant_id,state,member_type,standing,sponsoring_membership_id,public_member_id,established_at,activated_at,eligibility_policy_version,eligibility_evidence_ids) VALUES (${membershipId},${participantId},'ACTIVE','HOUSEHOLD_BENEFICIARY','ACTIVE',${sponsorId},${publicMemberId},${nowIso},${nowIso},'household-beneficiary-v2',${[String(invitation.invitation_id),sponsorId]})`;
    const activated=await sql`UPDATE household_beneficiary_invitation SET state='ACTIVE',beneficiary_membership_id=${membershipId},activated_at=${nowIso},activated_by_participant_id=${participantId} WHERE invitation_id=${String(invitation.invitation_id)} AND state='APPROVED_PENDING_ACTIVATION' RETURNING invitation_id`;if(activated.length!==1)return res.status(409).json({ok:false,error:'HOUSEHOLD_ACTIVATION_STATE_RACE'});
    await sql`INSERT INTO application_access_audit(audit_id,participant_id,membership_id,event_type,state,outcome,request_id,occurred_at) VALUES (${`audit:household-activation:${String(invitation.invitation_id)}`},${participantId},${membershipId},'HOUSEHOLD_BENEFICIARY_ACTIVATED','ACTIVE','TRANSITION',${req.headers?.['x-request-id']||null},${nowIso}) ON CONFLICT (audit_id) DO NOTHING`;
    res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,invitationId:String(invitation.invitation_id),membershipId,publicMemberId,membershipState:'ACTIVE',standing:'ACTIVE',memberType:'HOUSEHOLD_BENEFICIARY'});
  }catch(error){console.error('Household activation failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'HOUSEHOLD_ACTIVATION_FAILED'});}
}
