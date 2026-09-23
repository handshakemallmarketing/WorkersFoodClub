import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from '../../api/membership-subscription-pay-sandbox.js';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const TOKEN = 'wfc_test_member_session';
const SESSION_ID = 'member-session:' + createHash('sha256').update(TOKEN).digest('hex');
const PREVIEW_ENV = { VERCEL_ENV: 'preview', DATABASE_URL: 'postgres://test' };

function response() {
  const result = { statusCode: null, body: null, headers: {} };
  return { result, setHeader(n, v) { result.headers[String(n).toLowerCase()] = v; return this; }, status(c) { result.statusCode = c; return this; }, json(b) { result.body = b; return this; } };
}
function req(body, token = TOKEN) { return { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body }; }

function fakeSql({ session, invoice, settled } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('FROM member_session')) { assert.equal(values[0], SESSION_ID); return session ? [session] : []; }
    if (text.includes('FROM membership_subscription_invoice')) return invoice ? [invoice] : [];
    if (text.includes('WITH evidence AS')) return settled ? [settled] : [];
    throw new Error('UNEXPECTED_QUERY: ' + text);
  };
  sql.calls = calls;
  return sql;
}

const activeSession = { session_id: SESSION_ID, membership_id: 'membership:1', state: 'ACTIVE', expires_at: new Date(NOW + 3600000).toISOString() };
const openInvoice = { invoice_id: 'invoice:1', state: 'OPEN', amount_minor: 12000, currency: 'GHS' };

test('rejects non-POST', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {} }, res, { env: PREVIEW_ENV });
  assert.equal(res.result.statusCode, 405);
});

test('refuses in production', async () => {
  const res = response();
  await handler(req({ invoiceId: 'invoice:1' }), res, { env: { VERCEL_ENV: 'production' } });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION');
});

test('refuses outside preview', async () => {
  const res = response();
  await handler(req({ invoiceId: 'invoice:1' }), res, { env: { VERCEL_ENV: 'development' } });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'SANDBOX_PAYMENT_REQUIRES_PREVIEW');
});

test('requires a member session token', async () => {
  const res = response();
  await handler(req({ invoiceId: 'invoice:1' }, null), res, { env: PREVIEW_ENV });
  assert.equal(res.result.statusCode, 401);
  assert.equal(res.result.body.error, 'MEMBER_SESSION_REQUIRED');
});

test('requires an invoiceId', async () => {
  const res = response();
  await handler(req({}), res, { env: PREVIEW_ENV, now: NOW, sql: fakeSql() });
  assert.equal(res.result.statusCode, 400);
  assert.equal(res.result.body.error, 'INVOICE_ID_REQUIRED');
});

test('rejects an invalid or expired session before touching the invoice', async () => {
  const sql = fakeSql({ session: null });
  const res = response();
  await handler(req({ invoiceId: 'invoice:1' }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 401);
  assert.equal(res.result.body.error, 'MEMBER_SESSION_INVALID');
  assert.equal(sql.calls.length, 1);
});

test('404s when the invoice does not belong to this membership', async () => {
  const sql = fakeSql({ session: activeSession, invoice: null });
  const res = response();
  await handler(req({ invoiceId: 'invoice:1' }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 404);
  assert.equal(res.result.body.error, 'INVOICE_NOT_FOUND');
});

test('refuses an already-settled invoice without creating new evidence', async () => {
  const sql = fakeSql({ session: activeSession, invoice: { ...openInvoice, state: 'PAID' } });
  const res = response();
  await handler(req({ invoiceId: 'invoice:1' }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'INVOICE_ALREADY_SETTLED');
  assert.equal(sql.calls.length, 2);
});

test('refuses a non-OPEN invoice', async () => {
  const sql = fakeSql({ session: activeSession, invoice: { ...openInvoice, state: 'VOID' } });
  const res = response();
  await handler(req({ invoiceId: 'invoice:1' }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'INVOICE_NOT_OPEN');
});

test('simulates a reconciled payment and settles the invoice atomically', async () => {
  const settled = { membership_id: 'membership:1', public_member_id: '555555555001', membership_state: 'ACTIVE', standing: 'ACTIVE', idempotent: false };
  const sql = fakeSql({ session: activeSession, invoice: openInvoice, settled });
  const res = response();
  await handler(req({ invoiceId: 'invoice:1', rail: 'MOBILE_MONEY' }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.sandboxSimulated, true);
  assert.equal(res.result.body.publicMemberId, '555555555001');
  assert.equal(res.result.body.membershipState, 'ACTIVE');
  const settleCall = sql.calls.find(c => c.text.includes('WITH evidence AS'));
  assert.ok(settleCall);
  assert.match(settleCall.text, /INSERT INTO electronic_payment_evidence/);
  assert.match(settleCall.text, /settle_membership_subscription/);
  assert.ok(settleCall.values.includes(openInvoice.amount_minor));
  assert.ok(settleCall.values.includes(openInvoice.currency));
});

test('rejects an unknown rail by defaulting to MOBILE_MONEY rather than failing', async () => {
  const settled = { membership_id: 'membership:1', public_member_id: '555555555001', membership_state: 'ACTIVE', standing: 'ACTIVE', idempotent: false };
  const sql = fakeSql({ session: activeSession, invoice: openInvoice, settled });
  const res = response();
  await handler(req({ invoiceId: 'invoice:1', rail: 'NOT_A_REAL_RAIL' }), res, { env: PREVIEW_ENV, now: NOW, sql });
  const settleCall = sql.calls.find(c => c.text.includes('WITH evidence AS'));
  assert.ok(settleCall.values.includes('MOBILE_MONEY'));
});

test('reports settlement not applicable when the atomic function settles nothing', async () => {
  const sql = fakeSql({ session: activeSession, invoice: openInvoice, settled: null });
  const res = response();
  await handler(req({ invoiceId: 'invoice:1' }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'SUBSCRIPTION_SETTLEMENT_NOT_APPLICABLE');
});
