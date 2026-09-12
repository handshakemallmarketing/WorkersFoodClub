import test from 'node:test';
import assert from 'node:assert/strict';

import { mintPreviewApiToken } from '../../lib/preview-api-auth.js';

import commitSandbox from '../../api/commit-sandbox.js';
import paySandbox from '../../api/pay-sandbox.js';
import acceptFulfillment from '../../api/accept-fulfillment.js';
import memberOrders from '../../api/member-orders.js';
import memberNotifications from '../../api/member-notifications.js';
import fulfillmentReady from '../../api/fulfillment-ready.js';
import authorizeRefund from '../../api/authorize-refund.js';
import completeRefund from '../../api/complete-refund.js';
import operatorOrders from '../../api/operator-orders.js';

const SECRET = 'rc2-route-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';

const routes = [
  {
    name: 'commit-sandbox',
    handler: commitSandbox,
    method: 'POST',
    scope: 'member:purchase.commit',
    actorId: 'preview:member:001',
  },
  {
    name: 'pay-sandbox',
    handler: paySandbox,
    method: 'POST',
    scope: 'member:payment.execute',
    actorId: 'preview:member:001',
  },
  {
    name: 'accept-fulfillment',
    handler: acceptFulfillment,
    method: 'POST',
    scope: 'member:fulfillment.accept',
    actorId: 'preview:member:001',
  },
  {
    name: 'member-orders',
    handler: memberOrders,
    method: 'GET',
    scope: 'member:orders.read',
    actorId: 'preview:member:001',
  },
  {
    name: 'member-notifications',
    handler: memberNotifications,
    method: 'GET',
    scope: 'member:notifications.read',
    actorId: 'preview:member:001',
  },
  {
    name: 'fulfillment-ready',
    handler: fulfillmentReady,
    method: 'POST',
    scope: 'operator:fulfillment.manage',
    actorId: 'preview:operator:001',
  },
  {
    name: 'authorize-refund',
    handler: authorizeRefund,
    method: 'POST',
    scope: 'operator:refund.authorize',
    actorId: 'preview:operator:001',
  },
  {
    name: 'complete-refund',
    handler: completeRefund,
    method: 'POST',
    scope: 'operator:refund.complete',
    actorId: 'preview:operator:001',
  },
  {
    name: 'operator-orders',
    handler: operatorOrders,
    method: 'GET',
    scope: 'operator:orders.read',
    actorId: 'preview:operator:001',
  },
];

function createResponse() {
  const result = {
    statusCode: null,
    body: null,
    headers: {},
  };

  return {
    result,

    setHeader(name, value) {
      result.headers[String(name).toLowerCase()] = value;
      return this;
    },

    status(code) {
      result.statusCode = code;
      return this;
    },

    json(body) {
      result.body = body;
      return this;
    },
  };
}

function token({ actorId, scopes }) {
  const now = Math.floor(Date.now() / 1000);

  return mintPreviewApiToken({
    secret: SECRET,
    subject: `test:${actorId}`,
    actorId,
    scopes,
    issuedAt: now - 5,
    expiresAt: now + 300,
  });
}

function request(method, bearer) {
  return {
    method,
    headers: bearer
      ? { authorization: `Bearer ${bearer}` }
      : {},
    body: {},
  };
}

test.beforeEach(() => {
  process.env.VERCEL_ENV = 'preview';
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;

  // Intentional: proves auth is evaluated before database access.
  delete process.env.DATABASE_URL;
});

for (const route of routes) {
  test(`${route.name} rejects unauthenticated caller before database access`, async () => {
    const res = createResponse();

    await route.handler(
      request(route.method),
      res,
    );

    assert.equal(res.result.statusCode, 401);
    assert.equal(res.result.body?.error, 'AUTHENTICATION_REQUIRED');
  });

  test(`${route.name} rejects wrong scope before database access`, async () => {
    const res = createResponse();

    const bearer = token({
      actorId: route.actorId,
      scopes: ['rc2:unrelated.scope'],
    });

    await route.handler(
      request(route.method, bearer),
      res,
    );

    assert.equal(res.result.statusCode, 403);
    assert.equal(res.result.body?.error, 'AUTHORIZATION_SCOPE_REQUIRED');
  });

  test(`${route.name} rejects wrong authenticated actor`, async () => {
    const res = createResponse();

    const wrongActor = route.actorId.startsWith('preview:member:')
      ? 'preview:member:attacker'
      : 'preview:operator:attacker';

    const bearer = token({
      actorId: wrongActor,
      scopes: [route.scope],
    });

    await route.handler(
      request(route.method, bearer),
      res,
    );

    assert.equal(res.result.statusCode, 403);
    assert.equal(res.result.body?.error, 'AUTHENTICATED_ACTOR_MISMATCH');
  });
}

test('member boundary accepts correct principal past auth gate', async () => {
  const res = createResponse();

  const bearer = token({
    actorId: 'preview:member:001',
    scopes: ['member:orders.read'],
  });

  await memberOrders(
    request('GET', bearer),
    res,
  );

  // DATABASE_URL is deliberately absent.
  // 503 proves the authenticated request passed the auth boundary.
  assert.equal(res.result.statusCode, 503);
  assert.equal(res.result.body?.error, 'DATABASE_URL_MISSING');
});

test('operator boundary accepts correct principal past auth gate', async () => {
  const res = createResponse();

  const bearer = token({
    actorId: 'preview:operator:001',
    scopes: ['operator:orders.read'],
  });

  await operatorOrders(
    request('GET', bearer),
    res,
  );

  assert.equal(res.result.statusCode, 503);
  assert.equal(res.result.body?.error, 'DATABASE_URL_MISSING');
});
