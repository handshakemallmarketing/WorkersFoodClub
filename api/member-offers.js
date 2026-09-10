export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });
  }

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(3000) } });
    const rows = await sql`
      SELECT offer_id, name, description, unit_quantity, unit, price_minor, currency,
             fulfillment_method, status, sort_order, updated_at
      FROM preview_member_offer
      ORDER BY sort_order ASC
    `;

    const offers = rows.map((row) => ({
      offerId: String(row.offer_id),
      name: String(row.name),
      description: String(row.description),
      unitQuantity: Number(row.unit_quantity),
      unit: String(row.unit),
      priceMinor: row.price_minor === null ? null : Number(row.price_minor),
      currency: row.currency === null ? null : String(row.currency),
      fulfillmentMethod: String(row.fulfillment_method),
      status: String(row.status),
      sortOrder: Number(row.sort_order),
      updatedAt: String(row.updated_at),
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, source: 'neon-server', offers });
  } catch (error) {
    console.error('Neon offer query failed', { name: error?.name, message: error?.message });
    return res.status(503).json({ ok: false, error: 'NEON_OFFERS_FETCH_FAILED' });
  }
}
