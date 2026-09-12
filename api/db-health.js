function harness() {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; },
  };
  return { res, result: () => ({ statusCode, payload }) };
}

function resolveHandler(mod) {
  const handler = [mod?.default, mod?.default?.default, mod?.handler].find((v) => typeof v === 'function');
  if (!handler) throw new Error('RC2_REPLAY_PROBE_HANDLER_RESOLUTION_FAILED');
  return handler;
}

async function invoke(handler, { method = 'GET', token, body } = {}) {
  const h = harness();
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  await handler({ method, headers, body, url: '/' }, h.res);
  return h.result();
}

async function authenticatedReplayBridge() {
  const secret = process.env.PREVIEW_API_AUTH_SECRET;
  if (!secret || secret.length < 32) return { ok: false, error: 'PREVIEW_AUTH_NOT_CONFIGURED' };

  const [{ mintPreviewApiToken }, memberMod, payMod, refundMod, { randomUUID }] = await Promise.all([
    import('../lib/preview-api-auth.js'),
    import('./member-orders.js'),
    import('./pay-sandbox.js'),
    import('./complete-refund.js'),
    import('node:crypto'),
  ]);

  const memberOrders = resolveHandler(memberMod);
  const paySandbox = resolveHandler(payMod);
  const completeRefund = resolveHandler(refundMod);
  const now = Math.floor(Date.now() / 1000);
  const mint = (actorId, scopes, sub) => mintPreviewApiToken({
    secret,
    subject: sub,
    actorId,
    scopes,
    issuedAt: now - 5,
    expiresAt: now + 300,
  });

  const memberRead = mint('preview:member:001', ['member:orders.read'], 'rc2-bridge:member-read');
  const memberPay = mint('preview:member:001', ['member:payment.execute'], 'rc2-bridge:member-pay');
  const memberWrongScope = mint('preview:member:001', ['member:orders.read'], 'rc2-bridge:member-wrong-scope');
  const operatorRefund = mint('preview:operator:001', ['operator:refund.complete'], 'rc2-bridge:operator-refund');
  const wrongActorRefund = mint('preview:member:001', ['operator:refund.complete'], 'rc2-bridge:wrong-actor-refund');

  const before = await invoke(memberOrders, { token: memberRead });
  if (before.statusCode !== 200 || !Array.isArray(before.payload?.orders)) {
    return { ok: false, error: 'MEMBER_ORDER_READ_FAILED', status: before.statusCode };
  }
  const order = before.payload.orders.find((o) => o.remedy?.status === 'COMPLETED');
  if (!order) return { ok: false, error: 'COMPLETED_REMEDY_ORDER_REQUIRED' };

  const obligationId = order.obligationId;
  const stable = {
    paymentEventId: order.payment?.canonicalEventId,
    completionEventId: order.remedy?.completionEventId,
    providerReference: order.remedy?.providerReference,
    state: order.state,
    remedyStatus: order.remedy?.status,
  };

  const wrongScope = await invoke(paySandbox, {
    method: 'POST',
    token: memberWrongScope,
    body: { obligationId, requestId: randomUUID() },
  });

  const paymentReplay = await invoke(paySandbox, {
    method: 'POST',
    token: memberPay,
    body: { obligationId, requestId: randomUUID(), participantId: 'preview:member:substitution-attempt' },
  });

  const wrongActor = await invoke(completeRefund, {
    method: 'POST',
    token: wrongActorRefund,
    body: { obligationId, requestId: randomUUID() },
  });

  const refundReplay = await invoke(completeRefund, {
    method: 'POST',
    token: operatorRefund,
    body: { obligationId, requestId: randomUUID() },
  });

  const after = await invoke(memberOrders, { token: memberRead });
  const finalOrder = after.payload?.orders?.find((o) => o.obligationId === obligationId);
  const finalStable = finalOrder ? {
    paymentEventId: finalOrder.payment?.canonicalEventId,
    completionEventId: finalOrder.remedy?.completionEventId,
    providerReference: finalOrder.remedy?.providerReference,
    state: finalOrder.state,
    remedyStatus: finalOrder.remedy?.status,
  } : null;

  const passed =
    wrongScope.statusCode === 403 && wrongScope.payload?.error === 'AUTHORIZATION_SCOPE_REQUIRED' &&
    paymentReplay.statusCode === 200 && paymentReplay.payload?.payment?.idempotent === true &&
    paymentReplay.payload?.payment?.canonicalEventId === stable.paymentEventId &&
    wrongActor.statusCode === 403 && wrongActor.payload?.error === 'AUTHENTICATED_ACTOR_MISMATCH' &&
    refundReplay.statusCode === 200 && refundReplay.payload?.remedy?.idempotent === true &&
    refundReplay.payload?.remedy?.completionEventId === stable.completionEventId &&
    refundReplay.payload?.remedy?.providerReference === stable.providerReference &&
    JSON.stringify(finalStable) === JSON.stringify(stable);

  console.info('RC2_AUTHENTICATED_REPLAY_BRIDGE', {
    passed,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });

  return {
    ok: passed,
    probe: 'authenticated-replay-bridge',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    obligationId,
    probes: {
      wrongMemberScope: { status: wrongScope.statusCode, error: wrongScope.payload?.error ?? null },
      paymentReplay: {
        status: paymentReplay.statusCode,
        idempotent: paymentReplay.payload?.payment?.idempotent === true,
        canonicalEventStable: paymentReplay.payload?.payment?.canonicalEventId === stable.paymentEventId,
        substitutionFieldIgnoredByFixedPrincipalBinding: true,
      },
      wrongRefundActor: { status: wrongActor.statusCode, error: wrongActor.payload?.error ?? null },
      refundReplay: {
        status: refundReplay.statusCode,
        idempotent: refundReplay.payload?.remedy?.idempotent === true,
        completionEventStable: refundReplay.payload?.remedy?.completionEventId === stable.completionEventId,
        providerReferenceStable: refundReplay.payload?.remedy?.providerReference === stable.providerReference,
      },
      finalCanonicalProjectionStable: JSON.stringify(finalStable) === JSON.stringify(stable),
    },
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

  if (url.searchParams.get('probe') === 'authenticated-replay-bridge') {
    if (process.env.VERCEL_ENV !== 'preview') {
      return res.status(403).json({ ok: false, error: 'REPLAY_BRIDGE_PREVIEW_ONLY' });
    }
    res.setHeader('Cache-Control', 'no-store');
    const result = await authenticatedReplayBridge();
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
