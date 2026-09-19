import { randomUUID } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { isFreshStepUp, verifyEmployeeSessionTokenShape, extractEmployeeSessionToken } from '../lib/employee-session.js';
import { tierOf } from '../dist/packages/authority/src/hierarchy.js';

/**
 * Owner/Admin decision boundary for a membership application.
 * APPROVE creates a durable PENDING_ACTIVATION membership only. It does not
 * grant member scopes. The applicant must complete UC-02 activation before
 * the membership can become ACTIVE.
 */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const access = requireProductionApplicationAccess(options.env || process.env);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const verified = await verifyProductionOidcRequest(req, undefined, undefined, options.production || {});
  if (!verified.ok) return res.status(verified.status).json({ ok: false, error: verified.error });
  if (!isFreshStepUp(verified.principal.issuedAt, options.now ?? Date.now())) {
    return res.status(401).json({ ok: false, error: 'MEMBERSHIP_DECIDE_STEP_UP_NOT_FRESH' });
  }

  const applicationId = req.body?.applicationId;
  const decision = req.body?.decision;
  if (typeof applicationId !== 'string' || applicationId.length === 0) return res.status(400).json({ ok: false, error: 'APPLICATION_ID_REQUIRED' });
  if (decision !== 'APPROVE' && decision !== 'REJECT') return res.status(400).json({ ok: false, error: 'DECISION_MUST_BE_APPROVE_OR_REJECT' });

  const employeeSessionSecret = options.employeeSessionSecret || process.env.EMPLOYEE_SESSION_SECRET;
  if (typeof employeeSessionSecret !== 'string' || employeeSessionSecret.length < 32) return res.status(503).json({ ok: false, error: 'EMPLOYEE_SESSION_NOT_CONFIGURED' });
  const employeeSessionToken = options.employeeSessionToken ?? extractEmployeeSessionToken(req);
  const sessionId = verifyEmployeeSessionTokenShape(employeeSessionSecret, employeeSessionToken);
  if (!sessionId) return res.status(401).json({ ok: false, error: 'EMPLOYEE_SESSION_REQUIRED' });

  const connectionString = options.databaseUrl || process.env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) {
      const { neon } = await import('@neondatabase/serverless');
      sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(5000) } });
    }

    const bindings = await sql`SELECT participant_id, state FROM application_identity_binding WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} LIMIT 2`;
    if (bindings.length !== 1) return res.status(403).json({ ok: false, error: 'APPLICATION_IDENTITY_NOT_BOUND' });
    if (String(bindings[0].state) !== 'ACTIVE') return res.status(403).json({ ok: false, error: 'APPLICATION_PRINCIPAL_DISABLED' });
    const callerId = String(bindings[0].participant_id);

    const sessions = await sql`SELECT session_id FROM employee_session WHERE session_id=${sessionId} AND participant_id=${callerId} AND expires_at>now() AND revoked_at IS NULL LIMIT 1`;
    if (sessions.length !== 1) return res.status(401).json({ ok: false, error: 'EMPLOYEE_SESSION_INVALID' });

    const callerGrantRows = await sql`SELECT actions FROM application_authority_grant WHERE actor_id=${callerId} AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) AND (revoked_at IS NULL OR revoked_at>now())`;
    const callerActions = callerGrantRows.flatMap((g) => (Array.isArray(g.actions) ? g.actions.map(String) : []));
    if (tierOf(callerActions) === 'OPERATOR') return res.status(403).json({ ok: false, error: 'MEMBERSHIP_DECISION_REQUIRES_OWNER_OR_ADMIN' });

    const applications = await sql`SELECT application_id, issuer, subject, state FROM membership_application WHERE application_id=${applicationId} LIMIT 1`;
    if (applications.length !== 1) return res.status(404).json({ ok: false, error: 'APPLICATION_NOT_FOUND' });
    const application = applications[0];
    if (String(application.state) !== 'SUBMITTED') return res.status(409).json({ ok: false, error: 'APPLICATION_NOT_DECIDABLE' });

    const nowIso = new Date(options.now ?? Date.now()).toISOString();
    if (decision === 'REJECT') {
      const rejected = await sql`UPDATE membership_application SET state='REJECTED', decided_at=${nowIso}, decided_by=${callerId} WHERE application_id=${applicationId} AND state='SUBMITTED' RETURNING application_id`;
      if (rejected.length !== 1) return res.status(409).json({ ok: false, error: 'APPLICATION_ALREADY_DECIDED' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, applicationId, decision: 'REJECT' });
    }

    const applicantIssuer = String(application.issuer);
    const applicantSubject = String(application.subject);
    const existingBindings = await sql`SELECT participant_id, state FROM application_identity_binding WHERE issuer=${applicantIssuer} AND subject=${applicantSubject} LIMIT 2`;
    if (existingBindings.length > 1) return res.status(503).json({ ok: false, error: 'APPLICANT_IDENTITY_BINDING_AMBIGUOUS' });
    if (existingBindings.length === 1 && String(existingBindings[0].state) !== 'ACTIVE') return res.status(403).json({ ok: false, error: 'APPLICANT_PRINCIPAL_DISABLED' });

    const isNewParticipant = existingBindings.length === 0;
    const participantId = isNewParticipant ? `participant:${randomUUID()}` : String(existingBindings[0].participant_id);
    if (isNewParticipant) {
      await sql`INSERT INTO application_participant(participant_id, kind, state) VALUES (${participantId}, 'PERSON', 'ACTIVE')`;
      await sql`INSERT INTO application_identity_binding(binding_id, issuer, subject, participant_id, scopes, state, provider_evidence_id, bound_at, bound_by, authority_grant_id) VALUES (${`binding:${randomUUID()}`}, ${applicantIssuer}, ${applicantSubject}, ${participantId}, ${[]}, 'ACTIVE', ${`evidence:membership-application-decide:${applicationId}`}, ${nowIso}, ${callerId}, NULL)`;
    }

    const membershipId = `membership:${randomUUID()}`;
    await sql`INSERT INTO application_membership(membership_id, participant_id, state, established_at, eligibility_policy_version, eligibility_evidence_ids) VALUES (${membershipId}, ${participantId}, 'PENDING_ACTIVATION', ${nowIso}, 'membership-application-v1', ${[applicationId]})`;

    const approved = await sql`UPDATE membership_application SET state='APPROVED', activation_state='APPROVED_PENDING_ACTIVATION', decided_at=${nowIso}, decided_by=${callerId}, resulting_membership_id=${membershipId} WHERE application_id=${applicationId} AND state='SUBMITTED' RETURNING application_id`;
    if (approved.length !== 1) {
      await sql`UPDATE application_membership SET state='ENDED', ended_at=${nowIso} WHERE membership_id=${membershipId} AND state='PENDING_ACTIVATION'`;
      return res.status(409).json({ ok: false, error: 'APPLICATION_ALREADY_DECIDED' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, applicationId, decision: 'APPROVE', activationRequired: true, participantId, membershipId });
  } catch (error) {
    console.error('Membership application decision failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'MEMBERSHIP_DECIDE_FAILED' });
  }
}
