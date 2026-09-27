import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { extractEmployeeSessionToken, verifyEmployeeSessionTokenShape } from '../lib/employee-session.js';

/**
 * "Lock employee workspace": ends elevated access immediately and requires a
 * fresh /api/employee-session mint (fresh Google re-auth) to reopen it. This
 * only ever locks the caller's own session -- proven by requiring the same
 * verified Google identity that the session was minted for, not just
 * knowledge of the session token.
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

  const secret = options.employeeSessionSecret || process.env.EMPLOYEE_SESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    return res.status(503).json({ ok: false, error: 'EMPLOYEE_SESSION_NOT_CONFIGURED' });
  }

  const sessionId = verifyEmployeeSessionTokenShape(secret, extractEmployeeSessionToken(req));
  if (!sessionId) return res.status(401).json({ ok: false, error: 'EMPLOYEE_SESSION_INVALID' });

  const connectionString = options.databaseUrl || process.env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) {
      const { neon } = await import('@neondatabase/serverless');
      sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(5000) } });
    }

    const bindings = await sql`
      SELECT participant_id
        FROM application_identity_binding
       WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject}
       LIMIT 2`;
    if (bindings.length !== 1) return res.status(403).json({ ok: false, error: 'APPLICATION_IDENTITY_NOT_BOUND' });
    const participantId = String(bindings[0].participant_id);

    const rows = await sql`
      UPDATE employee_session
         SET revoked_at = now(), revoked_by = ${participantId}, revoked_reason = 'USER_LOCKED'
       WHERE session_id = ${sessionId} AND participant_id = ${participantId} AND revoked_at IS NULL
       RETURNING session_id`;
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'EMPLOYEE_SESSION_NOT_FOUND_OR_ALREADY_LOCKED' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, locked: true });
  } catch (error) {
    console.error('Employee session lock failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'EMPLOYEE_SESSION_LOCK_FAILED' });
  }
}
