import { createHash } from 'node:crypto';

const RAILS = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CAGD_PAYROLL'];
const sha = v => createHash('sha256').update(String(v)).digest('hex');

/**
 * Sandbox-only simulator for the payment-evidence step no real provider
 * integration exists for yet: inserts a RECONCILED electronic_payment_evidence
 * row for the caller's own OPEN annual invoice, then calls the already-atomic
 * settle_membership_subscription in one database transaction, so the evidence and
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
  const requestedRail = req.body?.rail;
  const rail = requestedRail == null || requestedRail === '' ? 'MOBILE_MONEY' : requestedRail;
  if (!RAILS.includes(rail)) return res.status(400).json({ ok: false, error: 'PAYMENT_RAIL_INVALID' });
  const requestId = typeof req.headers?.['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return res.status(400).json({ ok: false, error: 'REQUEST_ID_REQUIRED' });

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
    if (!['OPEN', 'PAID'].includes(String(invoice.state))) return res.status(409).json({ ok: false, error: 'INVOICE_NOT_OPEN' });

    const requestDigest = sha(`${membershipId}\u0000${requestId}`);
    const evidenceId = `evidence:sandbox:${requestDigest}`;
    const providerReference = `sandbox:${requestDigest}`;
    const auditId = `audit:subscription:sandbox:${requestDigest}`;

    if (typeof sql.transaction !== 'function') return res.status(503).json({ ok: false, error: 'DATABASE_TRANSACTION_UNAVAILABLE' });
    const [, bindingRows, , rows, completionRows] = await sql.transaction([
      sql`
        INSERT INTO membership_subscription_sandbox_request(
          request_id, membership_id, invoice_id, rail, amount_minor, currency,
          evidence_id, provider_reference, audit_id, created_at
        ) VALUES (
          ${requestId}, ${membershipId}, ${invoiceId}, ${rail},
          ${invoice.amount_minor}, ${invoice.currency}, ${evidenceId},
          ${providerReference}, ${auditId}, ${nowIso}
        )
        ON CONFLICT DO NOTHING
        RETURNING request_id`,
      sql`
        SELECT request_id FROM membership_subscription_sandbox_request
        WHERE request_id=${requestId} AND membership_id=${membershipId}
          AND invoice_id=${invoiceId} AND rail=${rail}
          AND amount_minor=${invoice.amount_minor} AND currency=${invoice.currency}
          AND evidence_id=${evidenceId} AND provider_reference=${providerReference}
          AND audit_id=${auditId}
        LIMIT 1`,
      sql`
        INSERT INTO electronic_payment_evidence(
          evidence_id, membership_id, obligation_id, rail, state, amount_minor,
          currency, provider_reference, reconciled_at
        ) SELECT
          r.evidence_id, r.membership_id, r.invoice_id, r.rail, 'RECONCILED',
          r.amount_minor, r.currency, r.provider_reference, r.created_at
        FROM membership_subscription_sandbox_request r
        WHERE r.request_id=${requestId} AND r.membership_id=${membershipId}
          AND r.invoice_id=${invoiceId} AND r.rail=${rail}
          AND r.amount_minor=${invoice.amount_minor} AND r.currency=${invoice.currency}
          AND r.evidence_id=${evidenceId} AND r.provider_reference=${providerReference}
        ON CONFLICT (evidence_id) DO NOTHING
        RETURNING evidence_id`,
      sql`
        SELECT * FROM settle_membership_subscription(
          ${invoiceId}, ${evidenceId}, ${sessionId}, ${auditId}, ${requestId}, ${nowIso}
        )`,
      sql`
        UPDATE membership_subscription_sandbox_request r
        SET state=CASE WHEN EXISTS (
          SELECT 1 FROM membership_subscription_settlement_allocation a
          WHERE a.invoice_id=${invoiceId} AND a.evidence_id=${evidenceId}
        ) THEN 'COMMITTED' ELSE 'INVALID' END,
          completed_at=COALESCE(r.completed_at, ${nowIso}::timestamptz),
          result_public_member_id=CASE WHEN r.state='COMMITTED' THEN r.result_public_member_id ELSE m.public_member_id END,
          result_membership_state=CASE WHEN r.state='COMMITTED' THEN r.result_membership_state ELSE m.state END,
          result_standing=CASE WHEN r.state='COMMITTED' THEN r.result_standing ELSE m.standing END
        FROM application_membership m
        WHERE r.request_id=${requestId} AND r.membership_id=${membershipId}
          AND r.invoice_id=${invoiceId} AND r.rail=${rail}
          AND r.evidence_id=${evidenceId}
          AND m.membership_id=r.membership_id
        RETURNING r.request_id, r.result_public_member_id, r.result_membership_state,
          r.result_standing`,
    ]);

    if (bindingRows.length !== 1 || rows.length !== 1 || completionRows.length !== 1) return res.status(409).json({ ok: false, error: 'SUBSCRIPTION_SETTLEMENT_NOT_APPLICABLE' });
    const result = rows[0], durableResult = completionRows[0];
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      sandboxSimulated: true,
      idempotent: result.idempotent === true || String(result.idempotent) === 'true',
      invoiceId,
      evidenceId,
      membershipId,
      publicMemberId: String(durableResult.result_public_member_id),
      membershipState: String(durableResult.result_membership_state),
      standing: String(durableResult.result_standing),
    });
  } catch (error) {
    if (error?.code === '23514' && error?.constraint === 'membership_subscription_sandbox_request_state_ck') return res.status(409).json({ ok: false, error: 'SUBSCRIPTION_SETTLEMENT_NOT_APPLICABLE' });
    console.error('Sandbox membership subscription payment failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'SANDBOX_SUBSCRIPTION_PAYMENT_FAILED' });
  }
}
