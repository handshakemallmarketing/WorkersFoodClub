const PARTICIPANT_ID = 'preview:member:001';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

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
             p.economic_treatment, p.observed_at AS payment_observed_at
        FROM preview_member_commitment c
        JOIN preview_member_offer o ON o.offer_id = c.offer_id
        LEFT JOIN preview_sandbox_payment p ON p.obligation_id = c.obligation_id
       WHERE c.participant_id = ${PARTICIPANT_ID}
       ORDER BY c.created_at DESC
       LIMIT 50
    `;

    const orders = rows.map((row) => ({
      obligationId: String(row.obligation_id),
      offerId: String(row.offer_id),
      offerName: String(row.offer_name),
      quantity: Number(row.quantity),
      unit: String(row.unit),
      committedPriceMinor: Number(row.committed_price_minor),
      currency: String(row.currency),
      fulfillmentMethod: String(row.fulfillment_method),
      state: String(row.state),
      acceptedAt: String(row.accepted_at),
      policyVersion: String(row.policy_version),
      canonicalEventId: String(row.authorized_event_id),
      payment: row.payment_id === null ? null : {
        paymentId: String(row.payment_id),
        status: String(row.payment_status),
        provider: String(row.provider),
        providerReference: String(row.provider_reference),
        evidenceId: String(row.payment_evidence_id),
        canonicalEventId: String(row.payment_event_id),
        economicTreatment: String(row.economic_treatment),
        observedAt: String(row.payment_observed_at),
      },
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, source: 'neon-server', orders });
  } catch (error) {
    console.error('Neon order query failed', { name: error?.name, message: error?.message });
    return res.status(503).json({ ok: false, error: 'NEON_ORDERS_FETCH_FAILED' });
  }
}
