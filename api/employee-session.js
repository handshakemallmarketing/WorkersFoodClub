import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import {
  generateSessionId,
  signEmployeeSessionToken,
  isFreshStepUp,
  EMPLOYEE_SESSION_TTL_SECONDS,
} from '../lib/employee-session.js';

/**
 * Mints a short-lived, independently revocable employee session. This is the
 * "verify again" step: it requires a Google ID token issued essentially right
 * now (not merely still unexpired), and it requires the caller to already
 * hold at least one active authority grant of any kind -- this endpoint only
 * elevates an existing employee, it never creates authority.
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
    return res.status(401).json({ ok: false, error: 'EMPLOYEE_STEP_UP_NOT_FRESH' });
  }

  const secret = options.employeeSessionSecret || process.env.EMPLOYEE_SESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    return res.status(503).json({ ok: false, error: 'EMPLOYEE_SESSION_NOT_CONFIGURED' });
  }

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
    const participantId = String(bindings[0].participant_id);

    const grants = await sql`
      SELECT grant_id
        FROM application_authority_grant
       WHERE actor_id=${participantId}
         AND valid_from<=now()
         AND (valid_until IS NULL OR valid_until>=now())
         AND (revoked_at IS NULL OR revoked_at>now())
       LIMIT 1`;
    if (grants.length !== 1) return res.status(403).json({ ok: false, error: 'NO_ACTIVE_EMPLOYEE_GRANT' });

    const sessionId = generateSessionId();
    const nowMs = options.now ?? Date.now();
    const issuedAt = new Date(nowMs);
    const expiresAt = new Date(nowMs + EMPLOYEE_SESSION_TTL_SECONDS * 1000);
    const stepUpTokenIat = new Date(verified.principal.issuedAt * 1000);

    await sql`
      INSERT INTO employee_session(session_id, participant_id, issued_at, expires_at, step_up_subject, step_up_issuer, step_up_token_iat)
      VALUES (${sessionId}, ${participantId}, ${issuedAt.toISOString()}, ${expiresAt.toISOString()}, ${verified.principal.subject}, ${verified.principal.issuer}, ${stepUpTokenIat.toISOString()})`;

    const token = signEmployeeSessionToken(secret, sessionId);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ ok: true, employeeSessionToken: token, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('Employee session mint failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'EMPLOYEE_SESSION_MINT_FAILED' });
  }
}
