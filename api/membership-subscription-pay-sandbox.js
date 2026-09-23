import { createHash, randomUUID } from 'node:crypto';

const RAILS = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CAGD_PAYROLL'];
const sha = v => createHash('sha256').update(String(v)).digest('hex');

/**
 * Sandbox-only simulator for the payment-evidence step no real provider
 * integration exists for yet: inserts a RECONCILED electronic_payment_evidence
 * row for the caller's own OPEN annual invoice, then calls the already-atomic
 * settle_membership_subscription in the SAME statement, so the evidence and
 * the settlement either both land or neither does. No real funds move.
 * Structurally cannot run outside preview (mirrors commit-sandbox.js/pay-sandbox.js).
 */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' }); }
  const env = options.env || process.env;
  if (env.VERCEL_ENV === 'production') return res.status(403).json({ ok: false, error: 'SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION' });
  if (env.VERCEL_ENV !== 'preview') return res.status(403).json({ ok: false, error: 'SANDBOX_PAYMENT_REQUIRES_PREVIEW' });

  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ ok: false, error: 'MEMBER_SESSION_REQUIRED' });

  const invoiceId = typeof req.body?.invoiceId === 'string' ? req.body.invoiceId.trim() : '';
  if (!invoiceId) return res.status(400).json({ ok: false, error: 'INVOICE_ID_REQUIRED' });
  const rail = RAILS.includes(req.body?.rail) ? req.body.rail : 'MOBILE_MONEY';

  const cs = options.databaseUrl || env.DATABASE_URL;
  if (!cs && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) { const { neon } = await import('@neondatabase/serverless'); sql = neon(cs, { fetchOptions: { signal: AbortSignal.timeout(5000) } }); }
    const now = options.now ?? Date.now(), nowIso = new Date(now).toISOString();
    const sessionId = `member-session:${sha(token)}`;

    const sessions = await sql`SELECT session_id, membership_id, state, expires_at FROM member_session WHERE session_id=${sessionId} LIMIT 1`;
    if (sessions.length !== 1 || String(sessions[0].state) !== 'ACTIVE' || new Date(sessions[0].expires_at).getTime() <= Number(now)) return res.status(401).json({ ok: false, error: 'MEMBER_SESSION_INVALID' });
    const membershipId = String(sessions[0].membership_id);

    // Pre-check, not the atomicity boundary: avoids creating orphan evidence for the
    // common wrong-id/already-paid cases. settle_membership_subscription's own locked
    // re-check inside the transaction below is what actually guarantees correctness
    // under a genuine concurrent double-submit.
    const invoices = await sql`SELECT invoice_id, state, amount_minor, currency FROM membership_subscription_invoice WHERE invoice_id=${invoiceId} AND membership_id=${membershipId} LIMIT 1`;
    if (invoices.length !== 1) return res.status(404).json({ ok: false, error: 'INVOICE_NOT_FOUND' });
    const invoice = invoices[0];
    if (String(invoice.state) === 'PAID') return res.status(409).json({ ok: false, error: 'INVOICE_ALREADY_SETTLED' });
    if (String(invoice.state) !== 'OPEN') return res.status(409).json({ ok: false, error: 'INVOICE_NOT_OPEN' });

    const evidenceId = `evidence:sandbox:${randomUUID()}`;
    const providerReference = `sandbox:${randomUUID()}`;
    const auditId = `audit:subscription:sandbox:${randomUUID()}`;
    const requestId = req.headers?.['x-request-id'] || null;

    const rows = await sql`
      WITH evidence AS (
        INSERT INTO electronic_payment_evidence(evidence_id, membership_id, obligation_id, rail, state, amount_minor, currency, provider_reference, reconciled_at)
        VALUES (${evidenceId}, ${membershipId}, ${invoiceId}, ${rail}, 'RECONCILED', ${invoice.amount_minor}, ${invoice.currency}, ${providerReference}, ${nowIso})
        RETURNING evidence_id
      ), settled AS (
        SELECT * FROM settle_membership_subscription(${invoiceId}, (SELECT evidence_id FROM evidence), ${sessionId}, ${auditId}, ${requestId}, ${nowIso})
      )
      SELECT * FROM settled`;

    if (rows.length !== 1) return res.status(409).json({ ok: false, error: 'SUBSCRIPTION_SETTLEMENT_NOT_APPLICABLE' });
    const result = rows[0];
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      sandboxSimulated: true,
      idempotent: result.idempotent === true || String(result.idempotent) === 'true',
      invoiceId,
      evidenceId,
      membershipId: String(result.membership_id),
      publicMemberId: String(result.public_member_id),
      membershipState: String(result.membership_state),
      standing: String(result.standing),
    });
  } catch (error) {
    console.error('Sandbox membership subscription payment failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'SANDBOX_SUBSCRIPTION_PAYMENT_FAILED' });
  }
}
