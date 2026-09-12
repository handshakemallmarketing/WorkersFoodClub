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

  if (url.searchParams.get('probe') === 'config-isolation') {
    if (process.env.VERCEL_ENV !== 'preview') {
      return res.status(403).json({
        ok: false,
        error: 'CONFIG_ISOLATION_PROBE_PREVIEW_ONLY',
      });
    }

    const cases = {
      'sandbox-provider-in-production': {
        input: {
          environment: 'production',
          paymentProvider: 'SANDBOX_MOMO',
          webhookSecret: 'synthetic-webhook-secret',
          databaseUrl: 'postgres://prod-db.internal/foodclub',
        },
        expected: 'SANDBOX_PROVIDER_FORBIDDEN_IN_PRODUCTION',
      },
      'live-provider-outside-production': {
        input: {
          environment: 'staging',
          paymentProvider: 'PAYSTACK_GH_LIVE',
          webhookSecret: 'synthetic-webhook-secret',
          databaseUrl: 'postgres://staging-db.internal/foodclub',
        },
        expected: 'LIVE_PROVIDER_FORBIDDEN_OUTSIDE_PRODUCTION',
      },
      'non-production-db-in-production': {
        input: {
          environment: 'production',
          paymentProvider: 'PAYSTACK_GH_LIVE',
          webhookSecret: 'synthetic-webhook-secret',
          databaseUrl: 'postgres://localhost/foodclub-test',
        },
        expected: 'NON_PRODUCTION_DATABASE_FORBIDDEN_IN_PRODUCTION',
      },
    };

    const caseName = url.searchParams.get('case');
    const diagnostic = cases[caseName];

    if (!diagnostic) {
      return res.status(400).json({
        ok: false,
        error: 'CONFIG_ISOLATION_PROBE_CASE_INVALID',
      });
    }

    try {
      const { RuntimeConfigurationGate } = await import(
        '../dist/packages/production-readiness/src/index.js'
      );

      const gate = new RuntimeConfigurationGate();
      gate.validate(diagnostic.input);

      console.error('RC2_CONFIG_ISOLATION_PROBE_UNEXPECTED_ACCEPT', {
        case: caseName,
      });

      return res.status(500).json({
        ok: false,
        case: caseName,
        error: 'CONFIG_ISOLATION_PROBE_UNEXPECTED_ACCEPT',
      });
    } catch (error) {
      const reason = error?.message || 'UNKNOWN_CONFIGURATION_REJECTION';
      const passed = reason === diagnostic.expected;

      console.info('RC2_CONFIG_ISOLATION_PROBE', {
        case: caseName,
        rejected: true,
        reason,
        expected: diagnostic.expected,
        passed,
      });

      res.setHeader('Cache-Control', 'no-store');

      return res.status(passed ? 200 : 500).json({
        ok: passed,
        case: caseName,
        rejected: true,
        reason,
      });
    }
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
