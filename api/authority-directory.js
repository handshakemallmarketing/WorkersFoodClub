import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { verifyEmployeeSessionTokenShape, extractEmployeeSessionToken } from '../lib/employee-session.js';
import { tierOf } from '../dist/packages/authority/src/hierarchy.js';

function toGrantView(row) {
  const actions = Array.isArray(row.actions) ? row.actions.map(String) : [];
  return {
    grantId: String(row.grant_id),
    grantorId: String(row.grantor_id),
    actorId: String(row.actor_id),
    actions,
    tier: tierOf(actions),
    targetPrefix: row.target_prefix == null ? null : String(row.target_prefix),
    validFrom: row.valid_from instanceof Date ? row.valid_from.toISOString() : String(row.valid_from),
    validUntil: row.valid_until == null ? null : (row.valid_until instanceof Date ? row.valid_until.toISOString() : String(row.valid_until)),
    revokedAt: row.revoked_at == null ? null : (row.revoked_at instanceof Date ? row.revoked_at.toISOString() : String(row.revoked_at)),
    revokedBy: row.revoked_by == null ? null : String(row.revoked_by),
    parentGrantId: row.parent_grant_id == null ? null : String(row.parent_grant_id),
  };
}

function toMembershipApplicationView(row) {
  return {
    applicationId: String(row.application_id),
    issuer: String(row.issuer),
    subject: String(row.subject),
    contactNote: row.contact_note == null ? null : String(row.contact_note),
    state: String(row.state),
    submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : String(row.submitted_at),
    decidedAt: row.decided_at == null ? null : (row.decided_at instanceof Date ? row.decided_at.toISOString() : String(row.decided_at)),
    decidedBy: row.decided_by == null ? null : String(row.decided_by),
    resultingMembershipId: row.resulting_membership_id == null ? null : String(row.resulting_membership_id),
  };
}

function toInvitationView(row) {
  return {
    invitationId: String(row.invitation_id),
    inviterId: String(row.inviter_id),
    actions: Array.isArray(row.actions) ? row.actions.map(String) : [],
    targetPrefix: row.target_prefix == null ? null : String(row.target_prefix),
    state: String(row.state),
    invitedAt: row.invited_at instanceof Date ? row.invited_at.toISOString() : String(row.invited_at),
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    acceptedAt: row.accepted_at == null ? null : (row.accepted_at instanceof Date ? row.accepted_at.toISOString() : String(row.accepted_at)),
    acceptedBy: row.accepted_by == null ? null : String(row.accepted_by),
    resultingGrantId: row.resulting_grant_id == null ? null : String(row.resulting_grant_id),
    revokedAt: row.revoked_at == null ? null : (row.revoked_at instanceof Date ? row.revoked_at.toISOString() : String(row.revoked_at)),
    revokedBy: row.revoked_by == null ? null : String(row.revoked_by),
  };
}

/**
 * Read-only roster for the Employees management screen: the caller's own
 * tier, every application_authority_grant (active and historical, an audit
 * trail), and every authority_invitation (pending and resolved). Gated to an
 * active Owner or Admin -- an ordinary Operator has no legitimate reason to
 * see the whole roster. Mirrors operator:orders.read's own precedent of
 * requiring a live employee_session for a read, not just a valid grant.
 */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const access = requireProductionApplicationAccess(options.env || process.env);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const verified = await verifyProductionOidcRequest(req, undefined, undefined, options.production || {});
  if (!verified.ok) return res.status(verified.status).json({ ok: false, error: verified.error });

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

    const callerGrantRows = await sql`
      SELECT actions
        FROM application_authority_grant
       WHERE actor_id=${callerId}
         AND valid_from<=now()
         AND (valid_until IS NULL OR valid_until>=now())
         AND (revoked_at IS NULL OR revoked_at>now())`;
    const callerActions = callerGrantRows.flatMap((g) => (Array.isArray(g.actions) ? g.actions.map(String) : []));
    const callerTier = tierOf(callerActions);
    if (callerTier === 'OPERATOR') {
      return res.status(403).json({ ok: false, error: 'AUTHORITY_DIRECTORY_REQUIRES_OWNER_OR_ADMIN' });
    }

    const grantRows = await sql`
      SELECT grant_id, grantor_id, actor_id, actions, target_prefix, valid_from, valid_until, revoked_at, revoked_by, parent_grant_id
        FROM application_authority_grant
       ORDER BY valid_from DESC
       LIMIT 200`;

    const invitationRows = await sql`
      SELECT invitation_id, inviter_id, actions, target_prefix, state, invited_at, expires_at, accepted_at, accepted_by, resulting_grant_id, revoked_at, revoked_by
        FROM authority_invitation
       ORDER BY invited_at DESC
       LIMIT 200`;

    const membershipApplicationRows = await sql`
      SELECT application_id, issuer, subject, contact_note, state, submitted_at, decided_at, decided_by, resulting_membership_id
        FROM membership_application
       ORDER BY submitted_at DESC
       LIMIT 200`;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      self: { participantId: callerId, tier: callerTier, actions: callerActions },
      grants: grantRows.map(toGrantView),
      invitations: invitationRows.map(toInvitationView),
      membershipApplications: membershipApplicationRows.map(toMembershipApplicationView),
    });
  } catch (error) {
    console.error('Authority directory read failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'AUTHORITY_DIRECTORY_FAILED' });
  }
}
