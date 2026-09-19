import { randomUUID } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { isFreshStepUp, verifyEmployeeSessionTokenShape, extractEmployeeSessionToken } from '../lib/employee-session.js';
import { tierOf } from '../dist/packages/authority/src/hierarchy.js';

/** Approval creates a PRIMARY membership, but annual subscription settlement activates it. */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); }
  const access=requireProductionApplicationAccess(options.env||process.env); if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});
  const verified=await verifyProductionOidcRequest(req,undefined,undefined,options.production||{}); if(!verified.ok)return res.status(verified.status).json({ok:false,error:verified.error});
  if(!isFreshStepUp(verified.principal.issuedAt,options.now??Date.now()))return res.status(401).json({ok:false,error:'MEMBERSHIP_DECIDE_STEP_UP_NOT_FRESH'});
  const applicationId=req.body?.applicationId, decision=req.body?.decision;
  if(typeof applicationId!=='string'||!applicationId)return res.status(400).json({ok:false,error:'APPLICATION_ID_REQUIRED'});
  if(!['APPROVE','REJECT'].includes(decision))return res.status(400).json({ok:false,error:'DECISION_MUST_BE_APPROVE_OR_REJECT'});
  const secret=options.employeeSessionSecret||process.env.EMPLOYEE_SESSION_SECRET;
  if(typeof secret!=='string'||secret.length<32)return res.status(503).json({ok:false,error:'EMPLOYEE_SESSION_NOT_CONFIGURED'});
  const sessionId=verifyEmployeeSessionTokenShape(secret,options.employeeSessionToken??extractEmployeeSessionToken(req));
  if(!sessionId)return res.status(401).json({ok:false,error:'EMPLOYEE_SESSION_REQUIRED'});
  const connectionString=options.databaseUrl||process.env.DATABASE_URL; if(!connectionString&&!options.sql)return res.status(503).json({ok:false,error:'DATABASE_URL_MISSING'});
  try {
    let sql=options.sql; if(!sql){const {neon}=await import('@neondatabase/serverless');sql=neon(connectionString,{fetchOptions:{signal:AbortSignal.timeout(5000)}});}
    const bindings=await sql`SELECT participant_id,state FROM application_identity_binding WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} LIMIT 2`;
    if(bindings.length!==1)return res.status(403).json({ok:false,error:'APPLICATION_IDENTITY_NOT_BOUND'}); if(String(bindings[0].state)!=='ACTIVE')return res.status(403).json({ok:false,error:'APPLICATION_PRINCIPAL_DISABLED'});
    const callerId=String(bindings[0].participant_id);
    const sessions=await sql`SELECT session_id FROM employee_session WHERE session_id=${sessionId} AND participant_id=${callerId} AND expires_at>now() AND revoked_at IS NULL LIMIT 1`;
    if(sessions.length!==1)return res.status(401).json({ok:false,error:'EMPLOYEE_SESSION_INVALID'});
    const grants=await sql`SELECT actions FROM application_authority_grant WHERE actor_id=${callerId} AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) AND (revoked_at IS NULL OR revoked_at>now())`;
    if(tierOf(grants.flatMap(g=>Array.isArray(g.actions)?g.actions.map(String):[]))==='OPERATOR')return res.status(403).json({ok:false,error:'MEMBERSHIP_DECISION_REQUIRES_OWNER_OR_ADMIN'});
    const apps=await sql`SELECT application_id,issuer,subject,state FROM membership_application WHERE application_id=${applicationId} LIMIT 1`;
    if(apps.length!==1)return res.status(404).json({ok:false,error:'APPLICATION_NOT_FOUND'}); const app=apps[0]; if(String(app.state)!=='SUBMITTED')return res.status(409).json({ok:false,error:'APPLICATION_NOT_DECIDABLE'});
    const nowIso=new Date(options.now??Date.now()).toISOString();
    const annualFeeMinor=Number(options.annualFeeMinor??process.env.ANNUAL_MEMBERSHIP_FEE_MINOR);
    // Validate configuration before approval creates any participant/binding/membership rows.
    if(decision==='APPROVE'&&(!Number.isSafeInteger(annualFeeMinor)||annualFeeMinor<=0))return res.status(503).json({ok:false,error:'ANNUAL_MEMBERSHIP_FEE_NOT_CONFIGURED'});
    if(decision==='REJECT'){const rows=await sql`UPDATE membership_application SET state='REJECTED',decided_at=${nowIso},decided_by=${callerId} WHERE application_id=${applicationId} AND state='SUBMITTED' RETURNING application_id`;if(rows.length!==1)return res.status(409).json({ok:false,error:'APPLICATION_ALREADY_DECIDED'});res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,applicationId,decision:'REJECT'});}
    const existing=await sql`SELECT participant_id,state FROM application_identity_binding WHERE issuer=${String(app.issuer)} AND subject=${String(app.subject)} LIMIT 2`;
    if(existing.length>1)return res.status(503).json({ok:false,error:'APPLICANT_IDENTITY_BINDING_AMBIGUOUS'}); if(existing.length===1&&String(existing[0].state)!=='ACTIVE')return res.status(403).json({ok:false,error:'APPLICANT_PRINCIPAL_DISABLED'});
    const participantId=existing.length===0?`participant:${randomUUID()}`:String(existing[0].participant_id);
    // Claim the application before provisioning membership artifacts. This makes
    // concurrent approvals single-winner and prevents loser requests from
    // creating orphan participants, bindings, memberships or invoices.
    const approved=await sql`UPDATE membership_application SET state='APPROVED',decided_at=${nowIso},decided_by=${callerId} WHERE application_id=${applicationId} AND state='SUBMITTED' RETURNING application_id`;
    if(approved.length!==1)return res.status(409).json({ok:false,error:'APPLICATION_ALREADY_DECIDED'});
    let membershipId=null,invoiceId=null;
    try {
    if(existing.length===0){await sql`INSERT INTO application_participant(participant_id,kind,state) VALUES (${participantId},'PERSON','ACTIVE')`;await sql`INSERT INTO application_identity_binding(binding_id,issuer,subject,participant_id,scopes,state,provider_evidence_id,bound_at,bound_by,authority_grant_id) VALUES (${`binding:${randomUUID()}`},${String(app.issuer)},${String(app.subject)},${participantId},${[]},'ACTIVE',${`evidence:membership-application-decide:${applicationId}`},${nowIso},${callerId},NULL)`;}
    membershipId=`membership:${randomUUID()}`;
    await sql`INSERT INTO application_membership(membership_id,participant_id,state,member_type,standing,established_at,eligibility_policy_version,eligibility_evidence_ids) VALUES (${membershipId},${participantId},'INACTIVE','PRIMARY','INITIAL_FEE_DUE',${nowIso},'membership-application-v3',${[applicationId]})`;
    const subscriptionYear=new Date(nowIso).getUTCFullYear(); invoiceId=`subscription-invoice:${randomUUID()}`;
    const dueAt=new Date(new Date(nowIso).getTime()+14*24*60*60*1000).toISOString();
    await sql`INSERT INTO membership_subscription_invoice(invoice_id,membership_id,subscription_year,amount_minor,currency,state,due_at) VALUES (${invoiceId},${membershipId},${subscriptionYear},${annualFeeMinor},'GHS','OPEN',${dueAt})`;
    await sql`UPDATE membership_application SET resulting_membership_id=${membershipId} WHERE application_id=${applicationId} AND state='APPROVED' AND decided_by=${callerId}`;
    res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,applicationId,decision:'APPROVE',participantId,membershipId,membershipState:'INACTIVE',standing:'INITIAL_FEE_DUE',invoiceId,dueAt});
    } catch(provisionError) {
      // Compensate a claimed-but-unprovisioned approval. Participant/identity
      // records are intentionally reusable; economic membership artifacts are
      // neutralized and the application becomes retryable.
      if(invoiceId) await sql`UPDATE membership_subscription_invoice SET state='VOID' WHERE invoice_id=${invoiceId} AND state='OPEN'`;
      if(membershipId) await sql`UPDATE application_membership SET state='ENDED',standing='ENDED',ended_at=${nowIso} WHERE membership_id=${membershipId} AND state='INACTIVE'`;
      await sql`UPDATE membership_application SET state='SUBMITTED',decided_at=NULL,decided_by=NULL,resulting_membership_id=NULL WHERE application_id=${applicationId} AND state='APPROVED' AND decided_by=${callerId} AND resulting_membership_id IS NULL`;
      throw provisionError;
    }
  } catch(error){console.error('Membership application decision failed',{name:error?.name,code:error?.code,message:error?.message});return res.status(503).json({ok:false,error:'MEMBERSHIP_DECIDE_FAILED'});}
}
