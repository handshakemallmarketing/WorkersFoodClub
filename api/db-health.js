const DATA_API_URL = 'https://ep-ancient-truth-aewlirhk.apirest.c-2.us-east-2.aws.neon.tech/neondb/rest/v1/preview_health?select=status,database_name,schema_name,governed_table_count';

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
      return res.status(503).json({
        ok: false,
        status: 'unavailable',
        error: 'NEON_DATA_API_UNAVAILABLE',
        upstreamStatus: response.status,
      });
    }

    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const healthy = row?.status === 'connected' && row?.database_name === 'neondb' && Number(row?.governed_table_count) === 7;

    return res.status(healthy ? 200 : 503).json({
      ok: healthy,
      status: healthy ? 'connected' : 'degraded',
      database: row?.database_name ?? null,
      schema: row?.schema_name ?? null,
      governedTableCount: Number(row?.governed_table_count ?? 0),
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({
      ok: false,
      status: 'unavailable',
      error: 'NEON_HEALTH_CHECK_FAILED',
    });
  }
}
