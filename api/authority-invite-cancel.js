import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { isFreshStepUp, verifyEmployeeSessionTokenShape, extractEmployeeSessionToken } from '../lib/employee-session.js';
import { tierOf } from '../dist/packages/authority/src/hierarchy.js';

/**
 * The original inviter -- or any active Owner, as a backstop -- cancels a
 * still-pending invitation before it is redeemed. This never touches an
 * already-created application_authority_grant; it only stops a mistaken or
 * no-longer-wanted invite from being redeemable, mirroring the schema's own
 * REVOKED invitation state (packages/durability/sql/016_authority_invitation.sql).
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
    return res.status(401).json({ ok: false, error: 'AUTHORITY_INVITE_CANCEL_STEP_UP_NOT_FRESH' });
  }

  const invitationId = req.body?.invitationId;
  if (typeof invitationId !== 'string' || invitationId.length === 0) {
    return res.status(400).json({ ok: false, error: 'INVITATION_ID_REQUIRED' });
  }

  const employeeSessionSecret = options.employeeSessionSecret || process.env.EMPLOYEE_SESSION_SECRET;
  if (typeof employeeSessionSecret !== 'string' || employeeSessionSecret.length < 32) {
    return res.status(503).json({ ok: false, error: 'EMPLOYEE_SESSION_NOT_CONFIGURED' });
  }
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

    const bindings = await sql`
      SELECT participant_id, state
        FROM application_identity_binding
       WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject}
       LIMIT 2`;
    if (bindings.length !== 1) return res.status(403).json({ ok: false, error: 'APPLICATION_IDENTITY_NOT_BOUND' });
    if (String(bindings[0].state) !== 'ACTIVE') return res.status(403).json({ ok: false, error: 'APPLICATION_PRINCIPAL_DISABLED' });
    const callerId = String(bindings[0].participant_id);

    const sessions = await sql`
      SELECT session_id
        FROM employee_session
       WHERE session_id=${sessionId} AND participant_id=${callerId}
         AND expires_at>now() AND revoked_at IS NULL
       LIMIT 1`;
    if (sessions.length !== 1) return res.status(401).json({ ok: false, error: 'EMPLOYEE_SESSION_INVALID' });

    const invitations = await sql`
      SELECT invitation_id, inviter_id, state
        FROM authority_invitation
       WHERE invitation_id=${invitationId}
       LIMIT 1`;
    if (invitations.length !== 1) return res.status(404).json({ ok: false, error: 'INVITATION_NOT_FOUND' });
    const invitation = invitations[0];

    if (String(invitation.inviter_id) !== callerId) {
      const ownerGrants = await sql`
        SELECT actions
          FROM application_authority_grant
         WHERE actor_id=${callerId}
           AND valid_from<=now()
           AND (valid_until IS NULL OR valid_until>=now())
           AND (revoked_at IS NULL OR revoked_at>now())`;
      const isOwner = ownerGrants.some((g) => tierOf(Array.isArray(g.actions) ? g.actions.map(String) : []) === 'OWNER');
      if (!isOwner) return res.status(403).json({ ok: false, error: 'ONLY_INVITER_OR_OWNER_MAY_CANCEL' });
    }

    if (String(invitation.state) !== 'INVITED') {
      return res.status(409).json({ ok: false, error: 'INVITATION_NOT_CANCELLABLE' });
    }

    const nowIso = new Date(options.now ?? Date.now()).toISOString();
    const cancelled = await sql`
      UPDATE authority_invitation
         SET state='REVOKED', revoked_at=${nowIso}, revoked_by=${callerId}
       WHERE invitation_id=${invitationId} AND state='INVITED'
      RETURNING invitation_id`;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, invitationId, cancelled: cancelled.length === 1 });
  } catch (error) {
    console.error('Authority invite cancellation failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'AUTHORITY_INVITE_CANCEL_FAILED' });
  }
}
