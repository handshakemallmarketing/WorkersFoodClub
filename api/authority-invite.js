import { randomUUID } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { isFreshStepUp, verifyEmployeeSessionTokenShape, extractEmployeeSessionToken } from '../lib/employee-session.js';
import {
  generateInvitationToken,
  hashInvitationToken,
  toAuthorityGrant,
  AUTHORITY_INVITATION_DEFAULT_TTL_SECONDS,
  AUTHORITY_INVITATION_MAX_TTL_SECONDS,
} from '../lib/authority-invitation.js';
import { assertGrantIssuable } from '../dist/packages/authority/src/hierarchy.js';

const SENTINEL_PENDING_ACTOR = 'pending:invitation';

function validActions(value) {
  return Array.isArray(value) && value.length > 0 && value.every((a) => typeof a === 'string' && a.length > 0);
}

/**
 * An Owner or Admin creates a bounded, expiring invitation for someone who
 * has never signed in before. Creating the invitation does not grant
 * anything by itself -- the actual application_authority_grant row is only
 * created at redemption (api/authority-invite-redeem.js), where the
 * inviter's authority is re-checked as of that later moment, not assumed
 * still valid from whenever this ran.
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
    return res.status(401).json({ ok: false, error: 'AUTHORITY_INVITE_STEP_UP_NOT_FRESH' });
  }

  const actions = req.body?.actions;
  if (!validActions(actions)) return res.status(400).json({ ok: false, error: 'ACTIONS_REQUIRED' });
  const targetPrefix = req.body?.targetPrefix == null ? null : String(req.body.targetPrefix);
  const ttlSecondsRaw = req.body?.expiresInSeconds;
  const ttlSeconds = Number.isInteger(ttlSecondsRaw) && ttlSecondsRaw > 0
    ? Math.min(ttlSecondsRaw, AUTHORITY_INVITATION_MAX_TTL_SECONDS)
    : AUTHORITY_INVITATION_DEFAULT_TTL_SECONDS;

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
    const inviterId = String(bindings[0].participant_id);

    const sessions = await sql`
      SELECT session_id
        FROM employee_session
       WHERE session_id=${sessionId} AND participant_id=${inviterId}
         AND expires_at>now() AND revoked_at IS NULL
       LIMIT 1`;
    if (sessions.length !== 1) return res.status(401).json({ ok: false, error: 'EMPLOYEE_SESSION_INVALID' });

    const grantRows = await sql`
      SELECT grant_id, grantor_id, actor_id, actions, target_prefix, valid_from, valid_until, revoked_at, parent_grant_id
        FROM application_authority_grant
       WHERE actor_id=${inviterId}
         AND valid_from<=now()
         AND (valid_until IS NULL OR valid_until>=now())
         AND (revoked_at IS NULL OR revoked_at>now())`;
    const inviterActiveGrants = grantRows.map(toAuthorityGrant);

    try {
      assertGrantIssuable({
        grantorId: inviterId,
        grantorActiveGrants: inviterActiveGrants,
        actorId: SENTINEL_PENDING_ACTOR,
        actions,
      });
    } catch (error) {
      return res.status(403).json({ ok: false, error: error.message });
    }

    const token = generateInvitationToken();
    const invitationId = `invitation:${randomUUID()}`;
    const nowMs = options.now ?? Date.now();
    const invitedAt = new Date(nowMs);
    const expiresAt = new Date(nowMs + ttlSeconds * 1000);

    await sql`
      INSERT INTO authority_invitation(invitation_id, inviter_id, actions, target_prefix, token_digest, invited_at, expires_at)
      VALUES (${invitationId}, ${inviterId}, ${actions}, ${targetPrefix}, ${hashInvitationToken(token)}, ${invitedAt.toISOString()}, ${expiresAt.toISOString()})`;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({
      ok: true,
      invitationId,
      token,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Authority invite creation failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'AUTHORITY_INVITE_CREATE_FAILED' });
  }
}
