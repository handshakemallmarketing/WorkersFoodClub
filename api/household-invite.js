import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

function hashToken(token){return createHash('sha256').update(token,'utf8').digest('hex');}
function cleanContact(value){return typeof value==='string'&&value.trim()?value.trim():null;}

/** J14: an ACTIVE/CURRENT PRIMARY member may occupy at most two household slots. */
export default async function handler(req,res,options={}){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const access=requireProductionApplicationAccess(options.env||process.env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
  const verified=await verifyProductionOidcRequest(req,undefined,undefined,options.production||{});if(!verified.ok)return res.status(verified.status).json({ok:false,error:verified.error});
  const contactEmail=cleanContact(req.body?.contactEmail)?.toLowerCase()||null;
  const contactPhone=cleanContact(req.body?.contactPhone);
  if(!contactEmail&&!contactPhone)return res.status(400).json({ok:false,error:'HOUSEHOLD_CONTACT_REQUIRED'});
  const connectionString=options.databaseUrl||process.env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try{
    let sql=options.sql;if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
    const bindings=await sql`SELECT participant_id,state FROM application_identity_binding WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} LIMIT 2`;
    if(bindings.length!==1||String(bindings[0].state)!=='ACTIVE')return res.status(403).json({ok:false,error:'APPLICATION_IDENTITY_NOT_BOUND'});
    const participantId=String(bindings[0].participant_id);
    const memberships=await sql`SELECT membership_id,state,standing,member_type FROM application_membership WHERE participant_id=${participantId} AND state='ACTIVE' AND standing='CURRENT' ORDER BY established_at DESC LIMIT 2`;
    if(memberships.length!==1)return res.status(403).json({ok:false,error:'ACTIVE_CURRENT_MEMBERSHIP_REQUIRED'});
    const sponsor=memberships[0];if(String(sponsor.member_type)!=='PRIMARY')return res.status(403).json({ok:false,error:'PRIMARY_MEMBERSHIP_REQUIRED'});
    const sponsorMembershipId=String(sponsor.membership_id);
    const slots=await sql`SELECT invitation_id,state,contact_email,contact_phone FROM household_beneficiary_invitation WHERE sponsoring_membership_id=${sponsorMembershipId} AND state IN ('APPROVED_PENDING_ACTIVATION','ACTIVE') ORDER BY invited_at ASC`;
    if(slots.length>=2)return res.status(409).json({ok:false,error:'HOUSEHOLD_BENEFICIARY_LIMIT_REACHED',limit:2});
    if(slots.some(row=>(contactEmail&&String(row.contact_email||'').toLowerCase()===contactEmail)||(contactPhone&&String(row.contact_phone||'')===contactPhone)))return res.status(409).json({ok:false,error:'HOUSEHOLD_BENEFICIARY_ALREADY_INVITED'});
    const invitationId=`household-invite:${randomUUID()}`;const token=randomBytes(32).toString('base64url');const tokenHash=hashToken(token);const now=options.now??Date.now();const expiresAt=new Date(now+7*24*60*60*1000).toISOString();
    const inserted=await sql`INSERT INTO household_beneficiary_invitation(invitation_id,sponsoring_membership_id,contact_email,contact_phone,state,invited_at,token_hash,expires_at) SELECT ${invitationId},${sponsorMembershipId},${contactEmail},${contactPhone},'APPROVED_PENDING_ACTIVATION',${new Date(now).toISOString()},${tokenHash},${expiresAt} WHERE (SELECT count(*) FROM household_beneficiary_invitation WHERE sponsoring_membership_id=${sponsorMembershipId} AND state IN ('APPROVED_PENDING_ACTIVATION','ACTIVE'))<2 RETURNING invitation_id`;
    if(inserted.length!==1)return res.status(409).json({ok:false,error:'HOUSEHOLD_BENEFICIARY_LIMIT_REACHED',limit:2});
    res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,invitationId,expiresAt,activationPath:`/activate#${encodeURIComponent(token)}`,deliveryRequired:true});
  }catch(error){console.error('Household invitation failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'HOUSEHOLD_INVITATION_FAILED'});}
}
