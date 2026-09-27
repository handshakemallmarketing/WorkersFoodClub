import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/pay-sandbox.js';
import { mintPreviewApiToken } from '../../lib/preview-api-auth.js';

const SECRET = 'pay-sandbox-test-secret-0123456789-abcdefghijklmnop';
const NOW = Date.parse('2026-09-24T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const OBLIGATION_ID = 'wfc:obligation:11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

process.env.PREVIEW_API_AUTH_SECRET = SECRET;
process.env.VERCEL_ENV = 'preview';

function token(scopes = ['member:payment.execute']) {
  return mintPreviewApiToken({ secret: SECRET, subject: 'preview-member-session', actorId: 'preview:member:001', scopes, issuedAt: NOW_SEC - 5, expiresAt: NOW_SEC + 300 });
}
function req(body, { auth = token() } = {}) {
  return { method: 'POST', headers: auth ? { authorization: `Bearer ${auth}` } : {}, body };
}
function response() {
  const result = { statusCode: null, body: null, headers: {} };
  return { result, setHeader(n, v) { result.headers[String(n).toLowerCase()] = v; return this; }, status(c) { result.statusCode = c; return this; }, json(b) { result.body = b; return this; } };
}
const PREVIEW_ENV = { VERCEL_ENV: 'preview', DATABASE_URL: 'postgres://test' };

function fakeSql({ existingPayment = null, atomicRow = undefined, throwCode = null } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('FROM preview_sandbox_payment WHERE request_id=')) return existingPayment ? [existingPayment] : [];
    if (text.includes('WITH locked_commitment AS')) {
      if (throwCode) throw Object.assign(new Error('simulated'), { code: throwCode });
      return atomicRow ? [atomicRow] : [];
    }
    if (text.includes('SELECT c.qualification_state')) return [{ qualification_state: 'FULLY_PAID', paid_minor: 10000 }];
    throw new Error('UNEXPECTED_QUERY: ' + text);
  };
  sql.calls = calls;
  return sql;
}

function atomicResultRow(overrides = {}) {
  return {
    payment_id: 'wfc:sandbox-payment:test', obligation_id: OBLIGATION_ID, request_id: REQUEST_ID,
    status: 'CONFIRMED', amount_minor: 4000, currency: 'GHS', recorded_at: new Date(NOW).toISOString(),
    paid_minor: 4000, resolved_qualification_state: 'DEMAND_QUALIFIED', ...overrides,
  };
}

test('rejects non-POST', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {} }, res, { env: PREVIEW_ENV });
  assert.equal(res.result.statusCode, 405);
});

test('refuses in production', async () => {
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 1000 }), res, { env: { VERCEL_ENV: 'production' } });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION');
});

test('refuses outside preview', async () => {
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 1000 }), res, { env: { VERCEL_ENV: 'development' } });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'SANDBOX_PAYMENT_REQUIRES_PREVIEW');
});

test('requires a valid preview token with the payment-execute scope', async () => {
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 1000 }, { auth: token(['member:orders.read']) }), res, { env: PREVIEW_ENV, now: NOW });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'AUTHORIZATION_SCOPE_REQUIRED');
});

test('validates obligationId, requestId, and amountMinor', async () => {
  const res1 = response();
  await handler(req({ obligationId: 'bad id!', requestId: REQUEST_ID, amountMinor: 1000 }), res1, { env: PREVIEW_ENV, now: NOW });
  assert.equal(res1.result.body.error, 'OBLIGATION_ID_INVALID');

  const res2 = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: 'not-a-uuid', amountMinor: 1000 }), res2, { env: PREVIEW_ENV, now: NOW });
  assert.equal(res2.result.body.error, 'REQUEST_ID_INVALID');

  const res3 = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 0 }), res3, { env: PREVIEW_ENV, now: NOW });
  assert.equal(res3.result.body.error, 'AMOUNT_MINOR_INVALID');

  const res4 = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 1.5 }), res4, { env: PREVIEW_ENV, now: NOW });
  assert.equal(res4.result.body.error, 'AMOUNT_MINOR_INVALID');
});

test('records a confirmed sandbox payment and returns the recomputed qualification tier atomically', async () => {
  const sql = fakeSql({ atomicRow: atomicResultRow() });
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 4000 }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 201);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.payment.status, 'CONFIRMED');
  assert.equal(res.result.body.payment.qualificationState, 'DEMAND_QUALIFIED');
  assert.equal(res.result.body.payment.paidMinor, 4000);
  assert.equal(res.result.body.payment.idempotent, false);
  const atomicCall = sql.calls.find(c => c.text.includes('WITH locked_commitment AS'));
  assert.ok(atomicCall);
  assert.ok(atomicCall.values.includes('preview:member:001'));
  assert.ok(atomicCall.values.includes(4000));
});

test('a payment against a commitment that is not OPEN or not owned by the caller is refused, not silently accepted', async () => {
  const sql = fakeSql({ atomicRow: null });
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 4000 }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'OBLIGATION_NOT_PAYABLE');
});

test('replays an already-recorded request_id idempotently without a second write', async () => {
  const existingPayment = { payment_id: 'wfc:sandbox-payment:prior', obligation_id: OBLIGATION_ID, request_id: REQUEST_ID, status: 'CONFIRMED', amount_minor: 4000, currency: 'GHS', recorded_at: new Date(NOW).toISOString() };
  const sql = fakeSql({ existingPayment });
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 4000 }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.payment.idempotent, true);
  assert.equal(res.result.body.payment.qualificationState, 'FULLY_PAID');
  assert.equal(sql.calls.filter(c => c.text.includes('WITH locked_commitment AS')).length, 0);
});

test('rejects a replay whose request_id was previously bound to a different obligation', async () => {
  const existingPayment = { payment_id: 'wfc:sandbox-payment:prior', obligation_id: 'wfc:obligation:different', request_id: REQUEST_ID, status: 'CONFIRMED', amount_minor: 4000, currency: 'GHS', recorded_at: new Date(NOW).toISOString() };
  const sql = fakeSql({ existingPayment });
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 4000 }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'PAYMENT_REQUEST_REBOUND');
});

test('recovers idempotently from a unique-constraint race on request_id', async () => {
  const existingPayment = { payment_id: 'wfc:sandbox-payment:race', obligation_id: OBLIGATION_ID, request_id: REQUEST_ID, status: 'CONFIRMED', amount_minor: 4000, currency: 'GHS', recorded_at: new Date(NOW).toISOString() };
  let call = 0;
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM preview_sandbox_payment WHERE request_id=')) { call += 1; return call === 1 ? [] : [existingPayment]; }
    if (text.includes('WITH locked_commitment AS')) throw Object.assign(new Error('dup'), { code: '23505' });
    throw new Error('UNEXPECTED_QUERY: ' + text);
  };
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 4000 }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.payment.idempotent, true);
});

test('a simulated failed payment records NO_ECONOMIC_EFFECT and leaves qualification unchanged', async () => {
  const sql = fakeSql({ atomicRow: atomicResultRow({ status: 'FAILED', paid_minor: 0, resolved_qualification_state: 'UNQUALIFIED' }) });
  const res = response();
  await handler(req({ obligationId: OBLIGATION_ID, requestId: REQUEST_ID, amountMinor: 4000, simulateFailure: true }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 201);
  assert.equal(res.result.body.payment.status, 'FAILED');
  assert.equal(res.result.body.payment.qualificationState, 'UNQUALIFIED');
  const atomicCall = sql.calls.find(c => c.text.includes('WITH locked_commitment AS'));
  assert.ok(atomicCall.values.includes('NO_ECONOMIC_EFFECT'));
  assert.ok(atomicCall.values.includes('FAILED'));
});
