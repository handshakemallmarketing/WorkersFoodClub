import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { isFreshStepUp, verifyEmployeeSessionTokenShape, extractEmployeeSessionToken } from '../lib/employee-session.js';
import { toAuthorityGrant } from '../lib/authority-invitation.js';
import { assertGrantRevocable, OWNER_ACTION } from '../dist/packages/authority/src/hierarchy.js';

/**
 * An Owner or Admin revokes an existing grant. Deliberately does not cascade
 * to grants this one delegated onward (parent_grant_id is provenance only,
 * same rule already applied in lib/application-principal-binding.js) -- a
 * revoked Admin's own downstream delegations stay active unless someone
 * separately revokes each of those too.
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
    return res.status(401).json({ ok: false, error: 'AUTHORITY_REVOKE_STEP_UP_NOT_FRESH' });
  }

  const grantId = req.body?.grantId;
  if (typeof grantId !== 'string' || grantId.length === 0) {
    return res.status(400).json({ ok: false, error: 'GRANT_ID_REQUIRED' });
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
    const revokerId = String(bindings[0].participant_id);

    const sessions = await sql`
      SELECT session_id
        FROM employee_session
       WHERE session_id=${sessionId} AND participant_id=${revokerId}
         AND expires_at>now() AND revoked_at IS NULL
       LIMIT 1`;
    if (sessions.length !== 1) return res.status(401).json({ ok: false, error: 'EMPLOYEE_SESSION_INVALID' });

    const targetRows = await sql`
      SELECT grant_id, grantor_id, actor_id, actions, target_prefix, valid_from, valid_until, revoked_at, parent_grant_id
        FROM application_authority_grant
       WHERE grant_id=${grantId}
       LIMIT 1`;
    if (targetRows.length !== 1) return res.status(404).json({ ok: false, error: 'GRANT_NOT_FOUND' });
    const target = toAuthorityGrant(targetRows[0]);
    if (target.revokedAt) return res.status(200).json({ ok: true, grantId, alreadyRevoked: true });

    const revokerGrantRows = await sql`
      SELECT grant_id, grantor_id, actor_id, actions, target_prefix, valid_from, valid_until, revoked_at, parent_grant_id
        FROM application_authority_grant
       WHERE actor_id=${revokerId}
         AND valid_from<=now()
         AND (valid_until IS NULL OR valid_until>=now())
         AND (revoked_at IS NULL OR revoked_at>now())`;
    const revokerActiveGrants = revokerGrantRows.map(toAuthorityGrant);

    const ownerGrantRows = await sql`
      SELECT grant_id, grantor_id, actor_id, actions, target_prefix, valid_from, valid_until, revoked_at, parent_grant_id
        FROM application_authority_grant
       WHERE ${OWNER_ACTION}=ANY(actions)
         AND valid_from<=now()
         AND (valid_until IS NULL OR valid_until>=now())
         AND (revoked_at IS NULL OR revoked_at>now())`;
    const allActiveOwnerGrants = ownerGrantRows.map(toAuthorityGrant);

    try {
      assertGrantRevocable({ revokerId, revokerActiveGrants, target, allActiveOwnerGrants });
    } catch (error) {
      return res.status(403).json({ ok: false, error: error.message });
    }

    const nowIso = new Date(options.now ?? Date.now()).toISOString();
    const revoked = await sql`
      UPDATE application_authority_grant
         SET revoked_at=${nowIso}, revoked_by=${revokerId}
       WHERE grant_id=${grantId} AND revoked_at IS NULL
      RETURNING grant_id`;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, grantId, alreadyRevoked: revoked.length !== 1 });
  } catch (error) {
    console.error('Authority revoke failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'AUTHORITY_REVOKE_FAILED' });
  }
}
