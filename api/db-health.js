export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('probe') === 'build-info') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      environment: process.env.VERCEL_ENV || 'unknown',
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      deploymentUrl: process.env.VERCEL_URL || null,
      branchUrl: process.env.VERCEL_BRANCH_URL || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(503).json({ ok: false, status: 'unavailable', error: 'DATABASE_URL_MISSING' });
  }

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(3000) } });
    const rows = await sql`SELECT status, database_name, schema_name, governed_table_count FROM preview_health LIMIT 1`;
    const row = rows?.[0] ?? null;
    const healthy = row?.status === 'connected' && row?.database_name === 'neondb' && Number(row?.governed_table_count) === 7;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(healthy ? 200 : 503).json({
      ok: healthy,
      status: healthy ? 'connected' : 'degraded',
      database: row?.database_name ?? null,
      schema: row?.schema_name ?? null,
      governedTableCount: Number(row?.governed_table_count ?? 0),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Neon health probe failed', { name: error?.name, message: error?.message });
    return res.status(503).json({ ok: false, status: 'unavailable', error: 'NEON_HEALTH_CHECK_FAILED' });
  }
}
