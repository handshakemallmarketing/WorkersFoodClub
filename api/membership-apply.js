import { randomUUID } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';

function requireApplicationAccess(env) {
  if ((env.VERCEL_ENV || 'unknown') === 'preview') return { ok: true };
  return requireProductionApplicationAccess(env);
}

/** A verified identity may submit a membership application. Submission never confers membership rights. */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' }); }
  const env = options.env || process.env;
  const access = requireApplicationAccess(env);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
  const verified = await verifyProductionOidcRequest(req, undefined, undefined, options.production || {});
  if (!verified.ok) return res.status(verified.status).json({ ok: false, error: verified.error });
  const contactNoteRaw = req.body?.contactNote;
  const contactNote = typeof contactNoteRaw === 'string' && contactNoteRaw.trim().length > 0 ? contactNoteRaw.trim().slice(0, 2000) : null;
  const connectionString = options.databaseUrl || process.env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });
  try {
    let sql = options.sql;
    if (!sql) { const { neon } = await import('@neondatabase/serverless'); sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(5000) } }); }
    const bindings = await sql`SELECT participant_id, state FROM application_identity_binding WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} LIMIT 2`;
    if (bindings.length > 1) return res.status(409).json({ ok: false, error: 'IDENTITY_BINDING_AMBIGUOUS' });
    if (bindings.length === 1 && String(bindings[0].state) === 'ACTIVE') {
      const participantId = String(bindings[0].participant_id);
      const memberships = await sql`SELECT state FROM application_membership WHERE participant_id=${participantId} ORDER BY established_at DESC LIMIT 1`;
      if (memberships.length === 1 && ['ACTIVE', 'SUSPENDED'].includes(String(memberships[0].state))) return res.status(409).json({ ok: false, error: 'ALREADY_A_MEMBER' });
    }
    const existing = await sql`SELECT application_id FROM membership_application WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject} AND state='SUBMITTED' LIMIT 1`;
    if (existing.length === 1) { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ok: true, applicationId: String(existing[0].application_id), state: 'SUBMITTED', alreadySubmitted: true }); }
    const applicationId = `application:${randomUUID()}`;
    await sql`INSERT INTO membership_application(application_id, issuer, subject, contact_note) VALUES (${applicationId}, ${verified.principal.issuer}, ${verified.principal.subject}, ${contactNote})`;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ ok: true, applicationId, state: 'SUBMITTED', alreadySubmitted: false });
  } catch (error) {
    console.error('Membership application submission failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'MEMBERSHIP_APPLY_FAILED' });
  }
}