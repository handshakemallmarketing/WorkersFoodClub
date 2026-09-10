const DATA_API_URL = 'https://ep-ancient-truth-aewlirhk.apirest.c-2.us-east-2.aws.neon.tech/neondb/rest/v1/preview_member_offer?select=offer_id,name,description,unit_quantity,unit,price_minor,currency,fulfillment_method,status,sort_order,updated_at&order=sort_order.asc';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const response = await fetch(DATA_API_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return res.status(503).json({ ok: false, error: 'NEON_OFFERS_UNAVAILABLE', upstreamStatus: response.status });
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) {
      return res.status(503).json({ ok: false, error: 'NEON_OFFERS_INVALID_RESPONSE' });
    }

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
    return res.status(200).json({ ok: true, source: 'neon', offers });
  } catch {
    return res.status(503).json({ ok: false, error: 'NEON_OFFERS_FETCH_FAILED' });
  }
}
