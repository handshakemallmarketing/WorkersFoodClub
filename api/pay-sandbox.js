import { randomUUID } from 'node:crypto';
import { requireApplicationAuth } from '../lib/application-auth.js';
import { canonicalRuntimeMetadata, durableId, runtimeEnvironment } from '../lib/durable-runtime-semantics.js';
import { CURRENT_BATCH_BPS, PRORATED_FULFILLMENT_BPS, FULL_PAYMENT_BPS } from '../lib/qualified-demand-policy.js';

const PREVIEW_PARTICIPANT_ID = 'preview:member:001';
const OBLIGATION_ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * UC-08 payment qualification is ratified as offer-specific through
 * demand_qualification_bps (packages/durability/sql/027_final_policy_consistency_v1.sql).
 * This is the atomic payment-observation write the qualification/deadline
 * machinery (api/qualified-demand.js, api/process-payment-deadlines.js) has been
 * reading from since migration 022/025/027 landed: the payment insert, the
 * qualification-tier recompute, and the canonical event/aggregate-version bump
 * happen in one serializable Postgres statement, with replay keyed on the
 * caller-supplied request_id exactly like api/commit-sandbox.js.
 */
async function readExistingPayment(sql, requestId) {
  const rows = await sql`SELECT payment_id,obligation_id,request_id,status,amount_minor,currency,recorded_at FROM preview_sandbox_payment WHERE request_id=${requestId} LIMIT 1`;
  return rows?.[0] ?? null;
}

function serialize(row, commitment, idempotent) {
  return {
    paymentId: String(row.payment_id),
    requestId: String(row.request_id),
    obligationId: String(row.obligation_id),
    status: String(row.status),
    amountMinor: Number(row.amount_minor),
    currency: String(row.currency),
    recordedAt: String(row.recorded_at),
    qualificationState: commitment ? String(commitment.qualification_state) : null,
    paidMinor: commitment ? Number(commitment.paid_minor) : null,
    idempotent,
  };
}

export default async function handler(req, res, options = {}) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const env = options.env || process.env;

  if (env.VERCEL_ENV === 'production') {
    return res.status(403).json({ ok: false, error: 'SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION' });
  }
  if (env.VERCEL_ENV !== 'preview') {
    return res.status(403).json({ ok: false, error: 'SANDBOX_PAYMENT_REQUIRES_PREVIEW' });
  }

  const principal = await requireApplicationAuth(req, res, 'member:payment.execute', PREVIEW_PARTICIPANT_ID, options);
  if (!principal) return;

  const obligationId = typeof req.body?.obligationId === 'string' ? req.body.obligationId : '';
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : '';
  const amountMinor = Number(req.body?.amountMinor);
  const simulateFailure = req.body?.simulateFailure === true;
  if (!OBLIGATION_ID_RE.test(obligationId)) return res.status(400).json({ ok: false, error: 'OBLIGATION_ID_INVALID' });
  if (!REQUEST_ID_RE.test(requestId)) return res.status(400).json({ ok: false, error: 'REQUEST_ID_INVALID' });
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return res.status(400).json({ ok: false, error: 'AMOUNT_MINOR_INVALID' });

  const cs = options.databaseUrl || env.DATABASE_URL;
  if (!cs && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) { const { neon } = await import('@neondatabase/serverless'); sql = neon(cs, { fetchOptions: { signal: AbortSignal.timeout(5000) } }); }
    const runtime = canonicalRuntimeMetadata({ principal, environment: runtimeEnvironment(env) });
    const now = new Date(options.now ?? Date.now()).toISOString();

    const existing = await readExistingPayment(sql, requestId);
    if (existing) {
      if (String(existing.obligation_id) !== obligationId) return res.status(409).json({ ok: false, error: 'PAYMENT_REQUEST_REBOUND' });
      const commitmentRows = await sql`
        SELECT c.qualification_state,
          COALESCE((SELECT sum(p.amount_minor) FROM preview_sandbox_payment p WHERE p.obligation_id=c.obligation_id AND p.status='CONFIRMED'),0)::bigint AS paid_minor
        FROM preview_member_commitment c WHERE c.obligation_id=${obligationId}`;
      return res.status(200).json({ ok: true, payment: serialize(existing, commitmentRows[0] ?? null, true) });
    }

    const paymentId = durableId('sandbox-payment'), canonicalEventId = durableId('event'), evidenceId = durableId('sandbox-evidence');
    const providerReference = `sandbox:${randomUUID()}`;
    const status = simulateFailure ? 'FAILED' : 'CONFIRMED';
    const economicTreatment = simulateFailure ? 'NO_ECONOMIC_EFFECT' : 'RESTRICTED_MEMBER_PREPAYMENT';

    const rows = await sql`
      WITH locked_commitment AS (
        SELECT c.obligation_id,c.currency,c.committed_price_minor,c.participant_id,o.demand_qualification_bps
        FROM preview_member_commitment c
        JOIN preview_member_offer o ON o.offer_id=c.offer_id
        WHERE c.obligation_id=${obligationId} AND c.participant_id=${runtime.actorId} AND c.state='OPEN'
        FOR UPDATE OF c
      ), payment AS (
        INSERT INTO preview_sandbox_payment(
          payment_id,obligation_id,request_id,provider,provider_reference,status,provider_raw_status,
          provider_status_mapping_version,amount_minor,currency,observed_at,evidence_id,economic_treatment,
          canonical_event_id,recorded_at
        )
        SELECT ${paymentId},lc.obligation_id,${requestId},'SANDBOX_MOMO',${providerReference},${status},${status},
          'sandbox-momo-v1',${amountMinor},lc.currency,${now},${evidenceId},${economicTreatment},${canonicalEventId},${now}
        FROM locked_commitment lc
        RETURNING *
      ), prior_paid AS (
        SELECT COALESCE(sum(p.amount_minor),0)::bigint AS paid_minor
        FROM preview_sandbox_payment p, payment np
        WHERE p.obligation_id=np.obligation_id AND p.status='CONFIRMED' AND p.payment_id<>np.payment_id
      ), tier AS (
        SELECT
          (pp.paid_minor + CASE WHEN np.status='CONFIRMED' THEN np.amount_minor ELSE 0 END)::bigint AS paid_minor,
          CASE WHEN np.status<>'CONFIRMED' THEN NULL
            WHEN (pp.paid_minor+np.amount_minor)*10000 >= lc.committed_price_minor*${FULL_PAYMENT_BPS} THEN 'FULLY_PAID'
            WHEN (pp.paid_minor+np.amount_minor)*10000 >= lc.committed_price_minor*${PRORATED_FULFILLMENT_BPS} THEN 'PRORATED_FULFILLMENT'
            WHEN (pp.paid_minor+np.amount_minor)*10000 >= lc.committed_price_minor*${CURRENT_BATCH_BPS} THEN 'CURRENT_BATCH_RESCHEDULE'
            WHEN (pp.paid_minor+np.amount_minor)*10000 >= lc.committed_price_minor*lc.demand_qualification_bps THEN 'DEMAND_QUALIFIED'
            ELSE 'UNQUALIFIED' END AS qualification_state
        FROM prior_paid pp, payment np, locked_commitment lc
      ), updated_commitment AS (
        UPDATE preview_member_commitment m SET
          qualification_state=COALESCE(t.qualification_state,m.qualification_state),
          qualified_at=CASE WHEN t.qualification_state IS NOT NULL AND t.qualification_state<>'UNQUALIFIED' AND m.qualified_at IS NULL THEN ${now}::timestamptz ELSE m.qualified_at END,
          fully_paid_at=CASE WHEN t.qualification_state='FULLY_PAID' AND m.fully_paid_at IS NULL THEN ${now}::timestamptz ELSE m.fully_paid_at END
        FROM tier t
        WHERE m.obligation_id=${obligationId}
        RETURNING m.qualification_state
      ), bumped_version AS (
        UPDATE aggregate_version av SET version=av.version+1
        FROM updated_commitment uc
        WHERE av.aggregate_id=${obligationId}
        RETURNING av.version
      ), event AS (
        INSERT INTO canonical_event(event_id,aggregate_id,aggregate_version,event_type,payload,occurred_at)
        SELECT ${canonicalEventId},${obligationId},bv.version,'PAYMENT_OBSERVED',
          jsonb_build_object('obligationId',${obligationId}::text,'status',${status}::text,'amountMinor',${amountMinor}::int,'actorId',${runtime.actorId}::text,'environment',${runtime.environment}::text),
          ${now}
        FROM bumped_version bv
        RETURNING event_id
      )
      SELECT p.*, t.paid_minor, uc.qualification_state AS resolved_qualification_state
      FROM payment p JOIN tier t ON true JOIN updated_commitment uc ON true JOIN event e ON true`;

    if (!rows?.[0]) return res.status(409).json({ ok: false, error: 'OBLIGATION_NOT_PAYABLE' });
    const row = rows[0];
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({
      ok: true,
      payment: serialize(row, { qualification_state: row.resolved_qualification_state, paid_minor: row.paid_minor }, false),
    });
  } catch (error) {
    if (error?.code === '23505') {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = options.sql || neon(cs);
        const existing = await readExistingPayment(sql, requestId);
        if (existing) return res.status(200).json({ ok: true, payment: serialize(existing, null, true) });
      } catch { /* fall through to generic failure below */ }
    }
    console.error('Sandbox payment failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'SANDBOX_PAYMENT_FAILED' });
  }
}
