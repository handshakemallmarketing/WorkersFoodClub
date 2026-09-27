import { randomUUID } from 'node:crypto';
import { verifyProductionOidcRequest } from '../lib/production-oidc-auth.js';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { isFreshStepUp } from '../lib/employee-session.js';
import { OWNER_ACTION } from '../dist/packages/authority/src/hierarchy.js';

const SYSTEM_BOOTSTRAP_PARTICIPANT_ID = 'participant:system-bootstrap';

/**
 * One-time System Owner bootstrap. Requires the same "verify again" fresh
 * Google re-authentication as the employee-session step-up, then creates the
 * very first authority:owner grant -- bound to whoever is making this exact,
 * live-verified request, never to a caller-supplied identity string.
 *
 * The only safety property that matters here: this can never run a second
 * time once any active Owner grant exists anywhere. That is checked
 * immediately before writing, and is the one thing this file must never
 * relax. Adding further Owners/Admins/Operators afterward is a separate,
 * Owner-authorized delegation path (not yet built), not a re-run of this.
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
    return res.status(401).json({ ok: false, error: 'OWNER_BOOTSTRAP_STEP_UP_NOT_FRESH' });
  }

  const connectionString = options.databaseUrl || process.env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) {
      const { neon } = await import('@neondatabase/serverless');
      sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(5000) } });
    }

    const existingOwners = await sql`
      SELECT grant_id
        FROM application_authority_grant
       WHERE ${OWNER_ACTION}=ANY(actions)
         AND valid_from<=now()
         AND (valid_until IS NULL OR valid_until>=now())
         AND (revoked_at IS NULL OR revoked_at>now())
       LIMIT 1`;
    if (existingOwners.length > 0) {
      return res.status(409).json({ ok: false, error: 'OWNER_ALREADY_BOOTSTRAPPED' });
    }

    await sql`
      INSERT INTO application_participant(participant_id, kind, state)
      VALUES (${SYSTEM_BOOTSTRAP_PARTICIPANT_ID}, 'SYSTEM', 'ACTIVE')
      ON CONFLICT (participant_id) DO NOTHING`;

    const existingBindings = await sql`
      SELECT participant_id, state
        FROM application_identity_binding
       WHERE issuer=${verified.principal.issuer} AND subject=${verified.principal.subject}
       LIMIT 2`;
    if (existingBindings.length > 1) {
      return res.status(503).json({ ok: false, error: 'APPLICATION_IDENTITY_BINDING_AMBIGUOUS' });
    }
    if (existingBindings.length === 1 && String(existingBindings[0].state) !== 'ACTIVE') {
      return res.status(403).json({ ok: false, error: 'APPLICATION_PRINCIPAL_DISABLED' });
    }

    const participantId = existingBindings.length === 1
      ? String(existingBindings[0].participant_id)
      : `participant:${randomUUID()}`;

    const grantId = `grant:${randomUUID()}`;
    const nowIso = new Date(options.now ?? Date.now()).toISOString();

    if (existingBindings.length === 0) {
      await sql`
        INSERT INTO application_participant(participant_id, kind, state)
        VALUES (${participantId}, 'PERSON', 'ACTIVE')`;
    }

    await sql`
      INSERT INTO application_authority_grant(grant_id, grantor_id, actor_id, actions, valid_from)
      VALUES (${grantId}, ${SYSTEM_BOOTSTRAP_PARTICIPANT_ID}, ${participantId}, ARRAY[${OWNER_ACTION}], ${nowIso})`;

    if (existingBindings.length === 0) {
      const bindingId = `binding:${randomUUID()}`;
      await sql`
        INSERT INTO application_identity_binding(
          binding_id, issuer, subject, participant_id, scopes, state,
          provider_evidence_id, bound_at, bound_by, authority_grant_id
        )
        VALUES (
          ${bindingId}, ${verified.principal.issuer}, ${verified.principal.subject}, ${participantId},
          ARRAY[]::text[], 'ACTIVE',
          ${`evidence:owner-bootstrap:${grantId}`}, ${nowIso}, ${SYSTEM_BOOTSTRAP_PARTICIPANT_ID}, ${grantId}
        )`;
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({
      ok: true,
      participantId,
      grantId,
      reusedExistingIdentityBinding: existingBindings.length === 1,
    });
  } catch (error) {
    console.error('Owner bootstrap failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'OWNER_BOOTSTRAP_FAILED' });
  }
}
