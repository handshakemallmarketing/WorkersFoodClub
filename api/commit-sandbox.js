import { randomUUID } from 'node:crypto';
import { requirePreviewApiAuth } from '../lib/preview-api-auth.js';

const PARTICIPANT_ID = 'preview:member:001';
const MEMBERSHIP_ID = 'preview:membership:001';
const POLICY_VERSION = 'preview-sandbox-v1';
const OFFER_ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serialize(row, idempotent = false) {
  return {
    obligationId: String(row.obligation_id),
    requestId: String(row.request_id),
    participantId: String(row.participant_id),
    membershipId: String(row.membership_id),
    offerId: String(row.offer_id),
    quantity: Number(row.quantity),
    unit: String(row.unit),
    committedPriceMinor: Number(row.committed_price_minor),
    currency: String(row.currency),
    fulfillmentMethod: String(row.fulfillment_method),
    state: String(row.state),
    acceptedAt: String(row.accepted_at),
    policyVersion: String(row.policy_version),
    idempotent,
  };
}

async function readExisting(sql, requestId) {
  const rows = await sql`
    SELECT obligation_id, request_id, participant_id, membership_id, offer_id, quantity, unit,
           committed_price_minor, currency, fulfillment_method, state, accepted_at, policy_version
      FROM preview_member_commitment
     WHERE request_id = ${requestId}
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
    return res.status(403).json({ ok: false, error: 'SANDBOX_COMMIT_DISABLED_IN_PRODUCTION' });
  }

  const principal = requirePreviewApiAuth(
    req,
    res,
    'member:purchase.commit',
    PARTICIPANT_ID,
  );
  if (!principal) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  const offerId = typeof req.body?.offerId === 'string' ? req.body.offerId : '';
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : '';
  if (!OFFER_ID_RE.test(offerId)) return res.status(400).json({ ok: false, error: 'OFFER_ID_INVALID' });
  if (!REQUEST_ID_RE.test(requestId)) return res.status(400).json({ ok: false, error: 'REQUEST_ID_INVALID' });

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(5000) } });

    const existing = await readExisting(sql, requestId);
    if (existing) return res.status(200).json({ ok: true, commitment: serialize(existing, true) });

    const obligationId = `preview:obligation:${randomUUID()}`;
    const commandId = `preview:command:${randomUUID()}`;
    const eventId = `preview:event:${randomUUID()}`;
    const ownerToken = 'vercel-preview';

    const rows = await sql`
      WITH selected_offer AS (
        SELECT offer_id, unit_quantity, unit, price_minor, currency, fulfillment_method
          FROM preview_member_offer
         WHERE offer_id = ${offerId}
           AND status = 'OPEN'
           AND price_minor IS NOT NULL
           AND currency = 'GHS'
         FOR SHARE
      ), commitment AS (
        INSERT INTO preview_member_commitment (
          obligation_id, request_id, participant_id, membership_id, offer_id, quantity, unit,
          committed_price_minor, currency, fulfillment_method, state,
          authorized_command_id, authorized_event_id, policy_version
        )
        SELECT ${obligationId}, ${requestId}, ${PARTICIPANT_ID}, ${MEMBERSHIP_ID}, offer_id,
               unit_quantity, unit, price_minor, currency, fulfillment_method, 'OPEN',
               ${commandId}, ${eventId}, ${POLICY_VERSION}
          FROM selected_offer
        RETURNING *
      ), command_record AS (
        INSERT INTO durable_command_execution (
          idempotency_key, command_id, state, owner_token, lease_until, fence_generation,
          result_json, created_at, updated_at
        )
        SELECT ${requestId}, ${commandId}, 'COMMITTED', ${ownerToken}, now(), 1,
               jsonb_build_object(
                 'status','ACCEPTED',
                 'obligationId', obligation_id,
                 'eventIds', jsonb_build_array(${eventId}::text)
               ),
               now(), now()
          FROM commitment
        RETURNING command_id
      ), aggregate_record AS (
        INSERT INTO aggregate_version (aggregate_id, version)
        SELECT obligation_id, 1 FROM commitment
        RETURNING aggregate_id
      ), canonical_record AS (
        INSERT INTO canonical_event (
          event_id, aggregate_id, aggregate_version, event_type, payload, occurred_at
        )
        SELECT ${eventId}, obligation_id, 1, 'PURCHASE_COMMITTED',
               jsonb_build_object(
                 'participantId', participant_id,
                 'membershipId', membership_id,
                 'offerId', offer_id,
                 'quantity', jsonb_build_object('amount', quantity, 'unit', unit),
                 'committedPrice', jsonb_build_object('minor', committed_price_minor, 'currency', currency),
                 'fulfillmentMethod', fulfillment_method,
                 'authorizedCommandId', authorized_command_id,
                 'policyVersion', policy_version,
                 'environment', 'preview'
               ),
               accepted_at
          FROM commitment
        RETURNING event_id
      )
      SELECT c.obligation_id, c.request_id, c.participant_id, c.membership_id, c.offer_id,
             c.quantity, c.unit, c.committed_price_minor, c.currency, c.fulfillment_method,
             c.state, c.accepted_at, c.policy_version
        FROM commitment c
        JOIN command_record cr ON cr.command_id = c.authorized_command_id
        JOIN aggregate_record ar ON ar.aggregate_id = c.obligation_id
        JOIN canonical_record er ON er.event_id = c.authorized_event_id
    `;

    const created = rows?.[0] ?? null;
    if (!created) return res.status(409).json({ ok: false, error: 'OFFER_NOT_COMMITTABLE' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ ok: true, commitment: serialize(created, false) });
  } catch (error) {
    if (error?.code === '23505') {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(connectionString);
        const existing = await readExisting(sql, requestId);
        if (existing) return res.status(200).json({ ok: true, commitment: serialize(existing, true) });
      } catch {}
    }
    console.error('Sandbox commitment failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'SANDBOX_COMMIT_FAILED' });
  }
}
