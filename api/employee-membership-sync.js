import { randomUUID } from 'node:crypto';
import { extractEmployeeSessionToken, verifyEmployeeSessionTokenShape } from '../lib/employee-session.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

/** Reconcile ACTIVE employment into a separate zero-fee membership entitlement. */
export default async function handler(req,res,options={}) {
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const access=requireProductionApplicationAccess(options.env||process.env);if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
  const secret=options.employeeSessionSecret||process.env.EMPLOYEE_SESSION_SECRET;if(typeof secret!=='string'||secret.length<32)return res.status(503).json({ok:false,error:'EMPLOYEE_SESSION_NOT_CONFIGURED'});
  const sessionId=verifyEmployeeSessionTokenShape(secret,extractEmployeeSessionToken(req));if(!sessionId)return res.status(401).json({ok:false,error:'EMPLOYEE_SESSION_INVALID'});
  const connectionString=options.databaseUrl||process.env.DATABASE_URL;if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try {
    let sql=options.sql;if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
    const sessions=await sql`SELECT participant_id FROM employee_session WHERE session_id=${sessionId} AND revoked_at IS NULL AND expires_at>now() LIMIT 2`;
    if(sessions.length!==1)return res.status(401).json({ok:false,error:'EMPLOYEE_SESSION_INACTIVE'});
    const participantId=String(sessions[0].participant_id);
    const employments=await sql`SELECT employment_record_id,evidence_id FROM employee_employment WHERE participant_id=${participantId} AND state='ACTIVE' AND ended_at IS NULL LIMIT 2`;
    if(employments.length!==1)return res.status(409).json({ok:false,error:employments.length===0?'EMPLOYEE_NOT_ACTIVE':'EMPLOYMENT_STATE_AMBIGUOUS'});
    const employment=employments[0];
    const existing=await sql`SELECT entitlement_id,membership_id FROM employee_membership_entitlement WHERE participant_id=${participantId} AND state='GRANTED' LIMIT 2`;
    if(existing.length===1)return res.status(200).json({ok:true,entitlementId:String(existing[0].entitlement_id),membershipId:String(existing[0].membership_id),membershipState:'ACTIVE',created:false});
    if(existing.length>1)return res.status(503).json({ok:false,error:'EMPLOYEE_MEMBERSHIP_ENTITLEMENT_AMBIGUOUS'});
    const memberships=await sql`SELECT membership_id,state,member_type FROM application_membership WHERE participant_id=${participantId} AND state IN ('INACTIVE','ACTIVE','SUSPENDED') LIMIT 2`;
    if(memberships.length>0)return res.status(409).json({ok:false,error:'EXISTING_MEMBERSHIP_REQUIRES_EXPLICIT_CONVERSION'});
    const nowIso=new Date(options.now??Date.now()).toISOString();const membershipId=`membership:${randomUUID()}`;const entitlementId=`employee-entitlement:${randomUUID()}`;
    await sql`INSERT INTO application_membership(membership_id,participant_id,state,member_type,standing,established_at,activated_at,eligibility_policy_version,eligibility_evidence_ids) VALUES (${membershipId},${participantId},'ACTIVE','EMPLOYEE_SPONSORED','ACTIVE',${nowIso},${nowIso},'employee-sponsored-v2',${[String(employment.evidence_id)]})`;
    await sql`INSERT INTO employee_membership_entitlement(entitlement_id,participant_id,employment_record_id,membership_id,state,sponsorship_type,annual_fee_minor,granted_at) VALUES (${entitlementId},${participantId},${String(employment.employment_record_id)},${membershipId},'GRANTED','EMPLOYEE_SPONSORED',0,${nowIso})`;
    return res.status(201).json({ok:true,entitlementId,membershipId,membershipState:'ACTIVE',memberType:'EMPLOYEE_SPONSORED',created:true});
  } catch(error){console.error('Employee membership sync failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'EMPLOYEE_MEMBERSHIP_SYNC_FAILED'});}
}
