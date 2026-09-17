import test from 'node:test';
import assert from 'node:assert/strict';

import { mintPreviewApiToken } from '../../lib/preview-api-auth.js';
import {
  OPERATOR_ADMIN_ACTOR_ID,
  OPERATOR_FINANCE_ACTOR_ID,
  OPERATOR_FULFILLMENT_ACTOR_ID,
  OPERATOR_TIER_SCOPES,
  isAdminOperator,
} from '../../lib/operator-tiers.js';

import fulfillmentReady from '../../api/fulfillment-ready.js';
import authorizeRefund from '../../api/authorize-refund.js';
import completeRefund from '../../api/complete-refund.js';
import operatorOrders from '../../api/operator-orders.js';

const SECRET = 'operator-tier-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';

// (handler, method, requiredScope) for each operator route under test.
const ROUTES = {
  fulfillmentReady: { handler: fulfillmentReady, method: 'POST', scope: 'operator:fulfillment.manage' },
  authorizeRefund: { handler: authorizeRefund, method: 'POST', scope: 'operator:refund.authorize' },
  completeRefund: { handler: completeRefund, method: 'POST', scope: 'operator:refund.complete' },
  operatorOrders: { handler: operatorOrders, method: 'GET', scope: 'operator:orders.read' },
};

function createResponse() {
  const result = { statusCode: null, body: null, headers: {} };
  return {
    result,
    setHeader(name, value) { result.headers[String(name).toLowerCase()] = value; return this; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

function token(actorId, scopes) {
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
  return { method, headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, body: {} };
}

test.beforeEach(() => {
  process.env.VERCEL_ENV = 'preview';
  process.env.PREVIEW_API_AUTH_SECRET = SECRET;
  delete process.env.DATABASE_URL;
});

async function callAsTier(routeName, actorId) {
  const { handler, method, scope } = ROUTES[routeName];
  const bearer = token(actorId, OPERATOR_TIER_SCOPES[actorId]);
  const res = createResponse();
  await handler(request(method, bearer), res);
  return res.result;
}

test('fulfillment tier can reach fulfillment-ready and operator-orders, not the refund routes', async () => {
  assert.equal((await callAsTier('fulfillmentReady', OPERATOR_FULFILLMENT_ACTOR_ID)).statusCode, 503); // past auth, DB missing
  assert.equal((await callAsTier('operatorOrders', OPERATOR_FULFILLMENT_ACTOR_ID)).statusCode, 503);
  assert.equal((await callAsTier('authorizeRefund', OPERATOR_FULFILLMENT_ACTOR_ID)).statusCode, 403);
  assert.equal((await callAsTier('authorizeRefund', OPERATOR_FULFILLMENT_ACTOR_ID)).body.error, 'AUTHORIZATION_SCOPE_REQUIRED');
  assert.equal((await callAsTier('completeRefund', OPERATOR_FULFILLMENT_ACTOR_ID)).statusCode, 403);
});

test('finance tier can reach both refund routes and operator-orders, not fulfillment-ready', async () => {
  assert.equal((await callAsTier('authorizeRefund', OPERATOR_FINANCE_ACTOR_ID)).statusCode, 503);
  assert.equal((await callAsTier('completeRefund', OPERATOR_FINANCE_ACTOR_ID)).statusCode, 503);
  assert.equal((await callAsTier('operatorOrders', OPERATOR_FINANCE_ACTOR_ID)).statusCode, 503);
  const blocked = await callAsTier('fulfillmentReady', OPERATOR_FINANCE_ACTOR_ID);
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.body.error, 'AUTHORIZATION_SCOPE_REQUIRED');
});

test('admin tier can reach every operator route', async () => {
  assert.equal((await callAsTier('fulfillmentReady', OPERATOR_ADMIN_ACTOR_ID)).statusCode, 503);
  assert.equal((await callAsTier('authorizeRefund', OPERATOR_ADMIN_ACTOR_ID)).statusCode, 503);
  assert.equal((await callAsTier('completeRefund', OPERATOR_ADMIN_ACTOR_ID)).statusCode, 503);
  assert.equal((await callAsTier('operatorOrders', OPERATOR_ADMIN_ACTOR_ID)).statusCode, 503);
});

test('isAdminOperator recognizes only a scope set that holds every admin-tier scope', () => {
  assert.equal(isAdminOperator(OPERATOR_TIER_SCOPES[OPERATOR_ADMIN_ACTOR_ID]), true);
  assert.equal(isAdminOperator(OPERATOR_TIER_SCOPES[OPERATOR_FULFILLMENT_ACTOR_ID]), false);
  assert.equal(isAdminOperator(OPERATOR_TIER_SCOPES[OPERATOR_FINANCE_ACTOR_ID]), false);
  assert.equal(isAdminOperator([...OPERATOR_TIER_SCOPES[OPERATOR_FULFILLMENT_ACTOR_ID], ...OPERATOR_TIER_SCOPES[OPERATOR_FINANCE_ACTOR_ID]]), true);
  assert.equal(isAdminOperator([]), false);
  assert.equal(isAdminOperator(undefined), false);
});

test('a token with the right scope but the wrong tier actor is still rejected (actor allowlist is not redundant)', async () => {
  // Simulates a forged/misissued token: fulfillment.manage scope bound to an actor id
  // that was never granted the fulfillment tier. Scope alone must not be sufficient.
  const forged = token('preview:operator:unlisted:001', ['operator:fulfillment.manage', 'operator:orders.read']);
  const res = createResponse();
  await fulfillmentReady(request('POST', forged), res);
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'AUTHENTICATED_ACTOR_MISMATCH');
});
