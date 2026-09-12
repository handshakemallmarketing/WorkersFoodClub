import { requirePreviewApiAuth } from '../lib/preview-api-auth.js';
const PARTICIPANT_ID = 'preview:member:001';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const principal = requirePreviewApiAuth(
    req,
    res,
    'member:orders.read',
    PARTICIPANT_ID,
  );
  if (!principal) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(4000) } });
    const rows = await sql`
      SELECT c.obligation_id, c.offer_id, o.name AS offer_name, c.quantity, c.unit,
             c.committed_price_minor, c.currency, c.fulfillment_method, c.state,
             c.accepted_at, c.policy_version, c.authorized_event_id,
             p.payment_id, p.status AS payment_status, p.provider, p.provider_reference,
             p.evidence_id AS payment_evidence_id, p.canonical_event_id AS payment_event_id,
             p.economic_treatment, p.observed_at AS payment_observed_at,
             f.fulfillment_id, f.state AS fulfillment_state, f.ready_event_id, f.ready_at,
             f.acceptance_id, f.acceptance_event_id, f.accepted_quantity, f.shortfall_quantity, f.accepted_at AS fulfillment_accepted_at,
             x.exception_id, x.kind AS exception_kind, x.affected_quantity, x.canonical_event_id AS exception_event_id,
             r.remedy_id, r.status AS remedy_status, r.amount_minor AS remedy_amount_minor, r.currency AS remedy_currency,
             r.authorize_event_id, r.authorized_at, r.completion_event_id, r.provider AS refund_provider,
             r.provider_reference AS refund_provider_reference, r.completed_at
        FROM preview_member_commitment c
        JOIN preview_member_offer o ON o.offer_id = c.offer_id
        LEFT JOIN preview_sandbox_payment p ON p.obligation_id = c.obligation_id
        LEFT JOIN preview_fulfillment f ON f.obligation_id = c.obligation_id
        LEFT JOIN preview_fulfillment_exception x ON x.obligation_id = c.obligation_id
        LEFT JOIN preview_refund_remedy r ON r.obligation_id = c.obligation_id
       WHERE c.participant_id = ${PARTICIPANT_ID}
       ORDER BY c.created_at DESC
       LIMIT 50
    `;

    const orders = rows.map((row) => ({
      obligationId: String(row.obligation_id), offerId: String(row.offer_id), offerName: String(row.offer_name),
      quantity: Number(row.quantity), unit: String(row.unit), committedPriceMinor: Number(row.committed_price_minor),
      currency: String(row.currency), fulfillmentMethod: String(row.fulfillment_method), state: String(row.state),
      acceptedAt: String(row.accepted_at), policyVersion: String(row.policy_version), canonicalEventId: String(row.authorized_event_id),
      payment: row.payment_id === null ? null : { paymentId: String(row.payment_id), status: String(row.payment_status), provider: String(row.provider), providerReference: String(row.provider_reference), evidenceId: String(row.payment_evidence_id), canonicalEventId: String(row.payment_event_id), economicTreatment: String(row.economic_treatment), observedAt: String(row.payment_observed_at) },
      fulfillment: row.fulfillment_id === null ? null : { fulfillmentId: String(row.fulfillment_id), state: String(row.fulfillment_state), readyEventId: String(row.ready_event_id), readyAt: String(row.ready_at), acceptanceId: row.acceptance_id===null?null:String(row.acceptance_id), acceptanceEventId: row.acceptance_event_id===null?null:String(row.acceptance_event_id), acceptedQuantity: row.accepted_quantity===null?null:Number(row.accepted_quantity), shortfallQuantity: row.shortfall_quantity===null?null:Number(row.shortfall_quantity), acceptedAt: row.fulfillment_accepted_at===null?null:String(row.fulfillment_accepted_at), exceptionEventId: row.exception_event_id===null?null:String(row.exception_event_id) },
      exception: row.exception_id===null?null:{exceptionId:String(row.exception_id),kind:String(row.exception_kind),affectedQuantity:Number(row.affected_quantity),canonicalEventId:row.exception_event_id===null?null:String(row.exception_event_id)},
      remedy: row.remedy_id===null?null:{remedyId:String(row.remedy_id),status:String(row.remedy_status),amountMinor:Number(row.remedy_amount_minor),currency:String(row.remedy_currency),authorizeEventId:String(row.authorize_event_id),authorizedAt:String(row.authorized_at),completionEventId:row.completion_event_id===null?null:String(row.completion_event_id),provider:row.refund_provider===null?null:String(row.refund_provider),providerReference:row.refund_provider_reference===null?null:String(row.refund_provider_reference),completedAt:row.completed_at===null?null:String(row.completed_at)},
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, source: 'neon-server', orders });
  } catch (error) {
    console.error('Neon order query failed', { name: error?.name, message: error?.message });
    return res.status(503).json({ ok: false, error: 'NEON_ORDERS_FETCH_FAILED' });
  }
}
