import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { mintPreviewApiToken } from '../lib/preview-api-auth.js';

function responseHarness() {
  let statusCode = 200;
  let payload;
  const headers = {};

  const res = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    },
  };

  return {
    res,
    result() {
      return { statusCode, payload, headers };
    },
  };
}

function summarize(result) {
  return {
    status: result.statusCode,
    ok: result.payload?.ok === true,
    error: result.payload?.error ?? null,
    source: result.payload?.source ?? null,
  };
}

async function invokeJsonHandler(handler, { method = 'GET', headers = {}, url = '/' } = {}) {
  const harness = responseHarness();
  await handler({ method, headers, url }, harness.res);
  return harness.result();
}

async function invokeStreamHandler(handler, { body, headers = {} }) {
  const req = Readable.from([Buffer.from(body)]);
  req.method = 'POST';
  req.headers = headers;
  req.url = '/api/paystack-rehearsal';

  const harness = responseHarness();
  await handler(req, harness.res);
  return harness.result();
}

function mintProbeToken(secret, { actorId, scopes, subject }) {
  const now = Math.floor(Date.now() / 1000);
  return mintPreviewApiToken({
    secret,
    subject,
    actorId,
    scopes,
    issuedAt: now - 5,
    expiresAt: now + 300,
  });
}

async function runAuthSelfTest() {
  const authSecret = process.env.PREVIEW_API_AUTH_SECRET;
  if (!authSecret || authSecret.length < 32) {
    return { ok: false, error: 'PREVIEW_AUTH_NOT_CONFIGURED' };
  }

  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret || !paystackSecret.startsWith('sk_test_')) {
    return { ok: false, error: 'PAYSTACK_TEST_SECRET_NOT_CONFIGURED' };
  }

  const [
    { default: memberOrdersHandler },
    { default: operatorOrdersHandler },
    { default: paystackHandler },
  ] = await Promise.all([
    import('./member-orders.js'),
    import('./operator-orders.js'),
    import('./paystack-rehearsal.js'),
  ]);

  const memberWrongScope = await invokeJsonHandler(memberOrdersHandler, {
    headers: {
      authorization: `Bearer ${mintProbeToken(authSecret, {
        actorId: 'preview:member:001',
        scopes: ['member:notifications.read'],
        subject: 'rc2-probe:member-wrong-scope',
      })}`,
    },
  });

  const memberWrongActor = await invokeJsonHandler(memberOrdersHandler, {
    headers: {
      authorization: `Bearer ${mintProbeToken(authSecret, {
        actorId: 'preview:operator:001',
        scopes: ['member:orders.read'],
        subject: 'rc2-probe:member-wrong-actor',
      })}`,
    },
  });

  const memberValid = await invokeJsonHandler(memberOrdersHandler, {
    headers: {
      authorization: `Bearer ${mintProbeToken(authSecret, {
        actorId: 'preview:member:001',
        scopes: ['member:orders.read'],
        subject: 'rc2-probe:member-valid',
      })}`,
    },
  });

  const operatorWrongActor = await invokeJsonHandler(operatorOrdersHandler, {
    headers: {
      authorization: `Bearer ${mintProbeToken(authSecret, {
        actorId: 'preview:member:001',
        scopes: ['operator:orders.read'],
        subject: 'rc2-probe:operator-wrong-actor',
      })}`,
    },
  });

  const operatorValid = await invokeJsonHandler(operatorOrdersHandler, {
    headers: {
      authorization: `Bearer ${mintProbeToken(authSecret, {
        actorId: 'preview:operator:001',
        scopes: ['operator:orders.read'],
        subject: 'rc2-probe:operator-valid',
      })}`,
    },
  });

  const manualBody = JSON.stringify({
    action: 'not-a-real-action',
    reference: 'wfc-rc2-auth-self-test-001',
  });

  const manualUnauthenticated = await invokeStreamHandler(paystackHandler, {
    body: manualBody,
  });

  const manualWrongScope = await invokeStreamHandler(paystackHandler, {
    body: manualBody,
    headers: {
      authorization: `Bearer ${mintProbeToken(authSecret, {
        actorId: 'preview:operator:001',
        scopes: ['operator:orders.read'],
        subject: 'rc2-probe:paystack-wrong-scope',
      })}`,
    },
  });

  const manualWrongActor = await invokeStreamHandler(paystackHandler, {
    body: manualBody,
    headers: {
      authorization: `Bearer ${mintProbeToken(authSecret, {
        actorId: 'preview:member:001',
        scopes: ['operator:payment.rehearse'],
        subject: 'rc2-probe:paystack-wrong-actor',
      })}`,
    },
  });

  const manualValid = await invokeStreamHandler(paystackHandler, {
    body: manualBody,
    headers: {
      authorization: `Bearer ${mintProbeToken(authSecret, {
        actorId: 'preview:operator:001',
        scopes: ['operator:payment.rehearse'],
        subject: 'rc2-probe:paystack-valid',
      })}`,
    },
  });

  const webhookBody = JSON.stringify({
    event: 'charge.success',
    data: {
      reference: 'wfc-rc2-auth-self-test-webhook-001',
      status: 'success',
      amount: 100,
      currency: 'GHS',
      paid_at: '2026-09-12T07:00:00Z',
    },
  });
  const webhookSignature = createHmac('sha512', paystackSecret)
    .update(webhookBody)
    .digest('hex');

  const signedWebhook = await invokeStreamHandler(paystackHandler, {
    body: webhookBody,
    headers: { 'x-paystack-signature': webhookSignature },
  });

  const probes = {
    memberWrongScope: summarize(memberWrongScope),
    memberWrongActor: summarize(memberWrongActor),
    memberValid: {
      ...summarize(memberValid),
      crossedAuthBoundary: ![401, 403].includes(memberValid.statusCode),
      orderCount: Array.isArray(memberValid.payload?.orders) ? memberValid.payload.orders.length : null,
    },
    operatorWrongActor: summarize(operatorWrongActor),
    operatorValid: {
      ...summarize(operatorValid),
      crossedAuthBoundary: ![401, 403].includes(operatorValid.statusCode),
      orderCount: Array.isArray(operatorValid.payload?.orders) ? operatorValid.payload.orders.length : null,
    },
    paystackManualUnauthenticated: summarize(manualUnauthenticated),
    paystackManualWrongScope: summarize(manualWrongScope),
    paystackManualWrongActor: summarize(manualWrongActor),
    paystackManualValid: {
      ...summarize(manualValid),
      crossedAuthBoundary: manualValid.statusCode === 400 && manualValid.payload?.error === 'PAYSTACK_REHEARSAL_ACTION_INVALID',
    },
    signedPaystackWebhookWithoutPreviewBearer: {
      ...summarize(signedWebhook),
      authenticity: signedWebhook.payload?.webhook?.authenticity ?? null,
      provider: signedWebhook.payload?.webhook?.provider ?? null,
      crossedProviderHmacBoundary: signedWebhook.statusCode === 200 && signedWebhook.payload?.webhook?.authenticity === 'HMAC_SHA512_VERIFIED',
    },
  };

  const passed =
    probes.memberWrongScope.status === 403 && probes.memberWrongScope.error === 'AUTHORIZATION_SCOPE_REQUIRED' &&
    probes.memberWrongActor.status === 403 && probes.memberWrongActor.error === 'AUTHENTICATED_ACTOR_MISMATCH' &&
    probes.memberValid.crossedAuthBoundary === true &&
    probes.operatorWrongActor.status === 403 && probes.operatorWrongActor.error === 'AUTHENTICATED_ACTOR_MISMATCH' &&
    probes.operatorValid.crossedAuthBoundary === true &&
    probes.paystackManualUnauthenticated.status === 401 && probes.paystackManualUnauthenticated.error === 'AUTHENTICATION_REQUIRED' &&
    probes.paystackManualWrongScope.status === 403 && probes.paystackManualWrongScope.error === 'AUTHORIZATION_SCOPE_REQUIRED' &&
    probes.paystackManualWrongActor.status === 403 && probes.paystackManualWrongActor.error === 'AUTHENTICATED_ACTOR_MISMATCH' &&
    probes.paystackManualValid.crossedAuthBoundary === true &&
    probes.signedPaystackWebhookWithoutPreviewBearer.crossedProviderHmacBoundary === true;

  console.info('RC2_AUTH_SELF_TEST', {
    passed,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });

  return {
    ok: passed,
    probe: 'rc2-auth-self-test',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    probes,
  };
}

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

  if (url.searchParams.get('probe') === 'auth-self-test') {
    if (process.env.VERCEL_ENV !== 'preview') {
      return res.status(403).json({ ok: false, error: 'AUTH_SELF_TEST_PREVIEW_ONLY' });
    }

    res.setHeader('Cache-Control', 'no-store');
    const result = await runAuthSelfTest();
    return res.status(result.ok ? 200 : 500).json(result);
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
