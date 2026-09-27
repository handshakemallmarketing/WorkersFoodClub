import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { ensureAnnualMembershipInvoice } from '../lib/membership-annual-invoice.js';
import { resolveAnnualFeeMinor } from '../lib/membership-fee-configuration.js';

/**
 * Daily housekeeping for annual membership billing. Three independent, each
 * individually idempotent phases:
 *  1. Issue this calendar year's renewal invoice for every PRIMARY membership
 *     currently ACTIVE or GRACE that doesn't have one yet.
 *  2. Start the 30-day grace window (standing ACTIVE -> GRACE) for any
 *     membership whose OPEN invoice is past due_at. The grace_started_at/
 *     grace_ends_at columns and the 30-day window already existed (migration
 *     027/029) but nothing ever set them until this job.
 *  3. End the grace window (standing GRACE -> RESTRICTED) once grace_ends_at
 *     has passed. Never auto-advances to SUSPENDED -- that remains a manual
 *     administrative action.
 * Paying during GRACE or RESTRICTED restores ACTIVE via
 * settle_membership_subscription's renewal branch (migration 036).
 */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' }); }
  const env = options.env || process.env;
  const access = requireProductionApplicationAccess(env);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const authorize = options.authorizeCron || ((request) => {
    const cronSecret = env.CRON_SECRET;
    const bearer = String(request.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (typeof cronSecret === 'string' && cronSecret.length >= 32 && bearer === cronSecret) return true;
    const renewalToken = env.MEMBERSHIP_RENEWAL_AUTHORITY_TOKEN;
    const got = request.headers?.['x-membership-renewal-authority'];
    return typeof renewalToken === 'string' && renewalToken.length >= 32 && got === renewalToken;
  });
  if (!authorize(req)) return res.status(401).json({ ok: false, error: 'RENEWAL_AUTHORITY_REQUIRED' });

  const connectionString = options.databaseUrl || env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) { const { neon } = await import('@neondatabase/serverless'); sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(9000) } }); }
    const now = options.now ?? Date.now();
    const subscriptionYear = new Date(now).getUTCFullYear();
    const annualFeeMinor = (options.annualFeeMinor ?? (await resolveAnnualFeeMinor({ sql, env }))?.amountMinor);

    const candidates = await sql`
      SELECT m.membership_id, m.public_member_id
      FROM application_membership m
      WHERE m.member_type = 'PRIMARY' AND m.state = 'ACTIVE' AND m.standing IN ('ACTIVE', 'GRACE')
        AND NOT EXISTS (
          SELECT 1 FROM membership_subscription_invoice i
          WHERE i.membership_id = m.membership_id AND i.subscription_year = ${subscriptionYear}
        )`;
    const invoiceIds = [];
    for (const candidate of candidates) {
      const invoice = await ensureAnnualMembershipInvoice({
        sql,
        membershipId: String(candidate.membership_id),
        publicMemberId: String(candidate.public_member_id),
        now,
        env,
        amountMinor: annualFeeMinor,
        subscriptionYear,
      });
      invoiceIds.push(invoice.invoiceId);
    }

    const graced = await sql`
      WITH transitioned AS (
        UPDATE application_membership AS m
        SET standing = 'GRACE', grace_started_at = now(), grace_ends_at = now() + interval '30 days'
        FROM membership_subscription_invoice i
        WHERE i.membership_id = m.membership_id AND i.state = 'OPEN' AND i.due_at < now() AND m.standing = 'ACTIVE'
        RETURNING m.membership_id, m.participant_id
      ), audited AS (
        INSERT INTO application_access_audit(audit_id, participant_id, membership_id, event_type, state, outcome, occurred_at)
        SELECT 'audit:membership-grace:' || membership_id || ':' || extract(epoch FROM now())::text,
               participant_id, membership_id, 'MEMBERSHIP_GRACE_STARTED', 'GRACE', 'TRANSITION', now()
        FROM transitioned
        RETURNING membership_id
      )
      SELECT membership_id FROM transitioned`;

    const restricted = await sql`
      WITH transitioned AS (
        UPDATE application_membership
        SET standing = 'RESTRICTED'
        WHERE standing = 'GRACE' AND grace_ends_at <= now()
        RETURNING membership_id, participant_id
      ), audited AS (
        INSERT INTO application_access_audit(audit_id, participant_id, membership_id, event_type, state, outcome, occurred_at)
        SELECT 'audit:membership-restricted:' || membership_id || ':' || extract(epoch FROM now())::text,
               participant_id, membership_id, 'MEMBERSHIP_RESTRICTED', 'RESTRICTED', 'TRANSITION', now()
        FROM transitioned
        RETURNING membership_id
      )
      SELECT membership_id FROM transitioned`;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      subscriptionYear,
      invoicesIssued: invoiceIds.length,
      invoiceIds,
      gracedMembershipIds: graced.map(r => String(r.membership_id)),
      restrictedMembershipIds: restricted.map(r => String(r.membership_id)),
    });
  } catch (error) {
    console.error('Membership renewal cron failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'MEMBERSHIP_RENEWAL_CRON_FAILED' });
  }
}
