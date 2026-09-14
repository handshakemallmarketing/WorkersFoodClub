import { randomUUID } from 'node:crypto';
import { requireApplicationAuth } from '../lib/application-auth.js';
import { canonicalRuntimeMetadata, durableId, runtimeEnvironment, runtimeOwnerToken } from '../lib/durable-runtime-semantics.js';

const PREVIEW_PARTICIPANT_ID = 'preview:member:001';
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBLIGATION_ID_RE = /^(?:preview:obligation:|wfc:obligation:)[0-9a-f-]{36}$/i;

function serialize(row, idempotent = false) {
  return {
    paymentId: String(row.payment_id),
    requestId: String(row.request_id),
    obligationId: String(row.obligation_id),
    provider: String(row.provider),
    providerReference: String(row.provider_reference),
    amountMinor: Number(row.amount_minor),
    currency: String(row.currency),
    status: String(row.status),
    evidenceId: String(row.evidence_id),
    canonicalEventId: String(row.canonical_event_id),
    economicTreatment: String(row.economic_treatment),
    observedAt: String(row.observed_at),
    idempotent,
  };
}

async function readExisting(sql, obligationId, requestId) {
  const rows = await sql`
    SELECT payment_id, request_id, obligation_id, provider, provider_reference, amount_minor,
           currency, status, evidence_id, canonical_event_id, economic_treatment, observed_at
      FROM preview_sandbox_payment
     WHERE obligation_id = ${obligationId} OR request_id = ${requestId}
     ORDER BY (obligation_id = ${obligationId}) DESC
     LIMIT 1
  `;
  return rows?.[0] ?? null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  if (process.env.VERCEL_ENV === 'production') {
    return res.status(403).json({ ok: false, error: 'SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION' });
  }

  const principal = await requireApplicationAuth(
    req,
    res,
    'member:payment.execute',
    PREVIEW_PARTICIPANT_ID,
  );
  if (!principal) return;

  const runtime = canonicalRuntimeMetadata({ principal, environment: runtimeEnvironment() });
  const ownerToken = runtimeOwnerToken(runtime.environment);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  const obligationId = typeof req.body?.obligationId === 'string' ? req.body.obligationId : '';
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : '';
  if (!OBLIGATION_ID_RE.test(obligationId)) return res.status(400).json({ ok: false, error: 'OBLIGATION_ID_INVALID' });
  if (!REQUEST_ID_RE.test(requestId)) return res.status(400).json({ ok: false, error: 'REQUEST_ID_INVALID' });

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(5000) } });

    const existing = await readExisting(sql, obligationId, requestId);
    if (existing) {
      if (String(existing.obligation_id) !== obligationId) return res.status(409).json({ ok: false, error: 'PAYMENT_REQUEST_REBOUND' });
      return res.status(200).json({ ok: true, payment: serialize(existing, true) });
    }

    const paymentId = durableId('payment');
    const providerReference = `sandbox-ref:${randomUUID()}`;
    const evidenceId = `evidence:payment:${randomUUID()}`;
    const eventId = durableId('event');
    const commandId = durableId('command');

    const rows = await sql`
      WITH obligation AS (
        SELECT obligation_id, participant_id, offer_id, committed_price_minor, currency, state
          FROM preview_member_commitment
         WHERE obligation_id = ${obligationId}
           AND participant_id = ${runtime.actorId}
           AND state = 'OPEN'
         FOR UPDATE
      ), payment AS (
        INSERT INTO preview_sandbox_payment (
          payment_id, request_id, obligation_id, provider, provider_reference,
          amount_minor, currency, status, evidence_id, canonical_event_id,
          provider_raw_status, provider_status_mapping_version, observed_at,
          economic_treatment
        )
        SELECT ${paymentId}, ${requestId}, obligation_id, 'SANDBOX_MOMO', ${providerReference},
               committed_price_minor, currency, 'CONFIRMED', ${evidenceId}, ${eventId},
               'CONFIRMED', 'sandbox-terminal-v1', now(), 'RESTRICTED_MEMBER_PREPAYMENT'
          FROM obligation
        RETURNING *
      ), command_record AS (
        INSERT INTO durable_command_execution (
          idempotency_key, command_id, state, owner_token, lease_until, fence_generation,
          result_json, created_at, updated_at
        )
        SELECT ${requestId}, ${commandId}, 'COMMITTED', ${ownerToken}, now(), 1,
               jsonb_build_object(
                 'status','CONFIRMED',
                 'obligationId',obligation_id,
                 'paymentId',payment_id,
                 'eventIds',jsonb_build_array(${eventId}::text)
               ), now(), now()
          FROM payment
        RETURNING command_id
      ), version_record AS (
        UPDATE aggregate_version av
           SET version = av.version + 1
          FROM payment p
         WHERE av.aggregate_id = p.obligation_id
        RETURNING av.aggregate_id, av.version
      ), canonical_record AS (
        INSERT INTO canonical_event (
          event_id, aggregate_id, aggregate_version, event_type, payload, occurred_at
        )
        SELECT ${eventId}, p.obligation_id, v.version, 'PAYMENT_CONFIRMED',
               jsonb_build_object(
                 'participantId', o.participant_id,
                 'offerId', o.offer_id,
                 'provider', p.provider,
                 'providerReference', p.provider_reference,
                 'amount', jsonb_build_object('minor', p.amount_minor, 'currency', p.currency),
                 'evidenceId', p.evidence_id,
                 'providerRawStatus', p.provider_raw_status,
                 'providerStatusMappingVersion', p.provider_status_mapping_version,
                 'economicTreatment', p.economic_treatment,
                 'authorizedCommandId', ${commandId}::text,
                 'actorId', ${runtime.actorId}::text,
                 'environment', ${runtime.environment}::text
               ), p.observed_at
          FROM payment p
          JOIN obligation o ON o.obligation_id = p.obligation_id
          JOIN version_record v ON v.aggregate_id = p.obligation_id
        RETURNING event_id
      )
      SELECT p.payment_id, p.request_id, p.obligation_id, p.provider, p.provider_reference,
             p.amount_minor, p.currency, p.status, p.evidence_id, p.canonical_event_id,
             p.economic_treatment, p.observed_at
        FROM payment p
        JOIN command_record c ON c.command_id = ${commandId}
        JOIN version_record v ON v.aggregate_id = p.obligation_id
        JOIN canonical_record e ON e.event_id = p.canonical_event_id
    `;

    const created = rows?.[0] ?? null;
    if (!created) return res.status(409).json({ ok: false, error: 'OBLIGATION_NOT_PAYABLE' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ ok: true, payment: serialize(created, false) });
  } catch (error) {
    if (error?.code === '23505') {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(connectionString);
        const existing = await readExisting(sql, obligationId, requestId);
        if (existing && String(existing.obligation_id) === obligationId) {
          return res.status(200).json({ ok: true, payment: serialize(existing, true) });
        }
      } catch {}
    }
    console.error('Sandbox payment failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'SANDBOX_PAYMENT_FAILED' });
  }
}
