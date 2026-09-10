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
             c.accepted_at, c.policy_version, c.authorized_event_id
        FROM preview_member_commitment c
        JOIN preview_member_offer o ON o.offer_id = c.offer_id
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
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, source: 'neon-server', orders });
  } catch (error) {
    console.error('Neon order query failed', { name: error?.name, message: error?.message });
    return res.status(503).json({ ok: false, error: 'NEON_ORDERS_FETCH_FAILED' });
  }
}
