import { randomUUID } from 'node:crypto';
import { extractEmployeeSessionToken, verifyEmployeeSessionTokenShape } from '../lib/employee-session.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

/** Explicit bridge between independent workforce and membership state machines. */
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
    const grants=await sql`SELECT grant_id FROM application_authority_grant WHERE actor_id=${participantId} AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) AND (revoked_at IS NULL OR revoked_at>now()) ORDER BY valid_from DESC LIMIT 1`;
    if(grants.length!==1)return res.status(409).json({ok:false,error:'EMPLOYEE_NOT_ACTIVE'});
    const existing=await sql`SELECT s.sponsorship_id,s.membership_id,m.state FROM employee_membership_sponsorship s JOIN application_membership m ON m.membership_id=s.membership_id WHERE s.participant_id=${participantId} AND s.state='ACTIVE' LIMIT 2`;
    if(existing.length===1)return res.status(200).json({ok:true,sponsorshipId:String(existing[0].sponsorship_id),membershipId:String(existing[0].membership_id),membershipState:String(existing[0].state),created:false});
    if(existing.length>1)return res.status(503).json({ok:false,error:'EMPLOYEE_MEMBERSHIP_SPONSORSHIP_AMBIGUOUS'});
    const memberships=await sql`SELECT membership_id,state,member_type FROM application_membership WHERE participant_id=${participantId} AND state IN ('INACTIVE','ACTIVE','SUSPENDED') LIMIT 2`;
    if(memberships.length>0)return res.status(409).json({ok:false,error:'EXISTING_MEMBERSHIP_REQUIRES_EXPLICIT_CONVERSION'});
    const nowIso=new Date(options.now??Date.now()).toISOString();const membershipId=`membership:${randomUUID()}`;const sponsorshipId=`employee-sponsorship:${randomUUID()}`;
    await sql`INSERT INTO application_membership(membership_id,participant_id,state,member_type,standing,established_at,activated_at,eligibility_policy_version,eligibility_evidence_ids) VALUES (${membershipId},${participantId},'ACTIVE','EMPLOYEE_SPONSORED','EMPLOYEE_SPONSORED',${nowIso},${nowIso},'employee-sponsored-v1',${[String(grants[0].grant_id)]})`;
    await sql`INSERT INTO employee_membership_sponsorship(sponsorship_id,participant_id,membership_id,authority_grant_id,state,established_at) VALUES (${sponsorshipId},${participantId},${membershipId},${String(grants[0].grant_id)},'ACTIVE',${nowIso})`;
    return res.status(201).json({ok:true,sponsorshipId,membershipId,membershipState:'ACTIVE',memberType:'EMPLOYEE_SPONSORED',created:true});
  } catch(error){console.error('Employee membership sync failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'EMPLOYEE_MEMBERSHIP_SYNC_FAILED'});}
}
