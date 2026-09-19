import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

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
    const bindings = await sql`SELECT participant_id, state FROM application_identity_binding WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} LIMIT 2`;
    let membershipState = null;
    let membershipId = null;
    if (bindings.length === 1 && String(bindings[0].state) === 'ACTIVE') {
      const memberships = await sql`SELECT membership_id, state FROM application_membership WHERE participant_id=${String(bindings[0].participant_id)} ORDER BY established_at DESC LIMIT 1`;
      if (memberships.length === 1) {
        membershipId = String(memberships[0].membership_id);
        membershipState = String(memberships[0].state);
      }
    }
    const applications = await sql`SELECT application_id, state, activation_state, submitted_at, decided_at FROM membership_application WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} ORDER BY created_at DESC LIMIT 1`;
    const application = applications[0] || null;
    const journeyState = membershipState === 'ACTIVE' ? 'ACTIVE' : membershipState === 'PENDING_ACTIVATION' ? 'APPROVED_PENDING_ACTIVATION' : application && ['SUBMITTED','UNDER_REVIEW'].includes(String(application.state)) ? 'APPLICANT' : 'AUTHENTICATED_UNBOUND';

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      journeyState,
      membershipState,
      membershipId,
      hasPendingApplication: journeyState === 'APPLICANT',
      application: application ? {
        applicationId: String(application.application_id),
        state: String(application.state),
        activationState: String(application.activation_state),
        submittedAt: application.submitted_at || null,
        decidedAt: application.decided_at || null,
      } : null,
    });
  } catch (error) {
    console.error('Membership status read failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'MEMBERSHIP_STATUS_FAILED' });
  }
}
