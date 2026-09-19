import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

/**
 * Tells the caller's own Google identity where it stands, so the frontend
 * can decide whether to admit, restrict, or route to /join -- without
 * requiring any existing application_identity_binding or membership row
 * to exist yet (a brand-new applicant has neither).
 *
 * membershipState is the *current* membership's state ('ACTIVE'|'SUSPENDED'
 * |'ENDED'), or null if this identity has never had a membership row at
 * all. hasPendingApplication is true only while a SUBMITTED application
 * exists for this exact identity, so the frontend never invites a second
 * submission on top of one already awaiting review.
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

  const connectionString = options.databaseUrl || process.env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) {
      const { neon } = await import('@neondatabase/serverless');
      sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(4000) } });
    }

    const bindings = await sql`
      SELECT participant_id, state
        FROM application_identity_binding
       WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject}
       LIMIT 2`;

    let membershipState = null;
    if (bindings.length === 1 && String(bindings[0].state) === 'ACTIVE') {
      const participantId = String(bindings[0].participant_id);
      const memberships = await sql`
        SELECT state
          FROM application_membership
         WHERE participant_id=${participantId}
         ORDER BY established_at DESC
         LIMIT 1`;
      if (memberships.length === 1) membershipState = String(memberships[0].state);
    }

    const applications = await sql`
      SELECT application_id
        FROM membership_application
       WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} AND state='SUBMITTED'
       LIMIT 1`;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      membershipState,
      hasPendingApplication: applications.length === 1,
    });
  } catch (error) {
    console.error('Membership status read failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'MEMBERSHIP_STATUS_FAILED' });
  }
}
