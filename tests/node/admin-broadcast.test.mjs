import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/admin-broadcast.js';
import { mintPreviewApiToken } from '../../lib/preview-api-auth.js';

const SECRET = 'admin-broadcast-test-secret-0123456789-abcdefghi';
const NOW = Date.parse('2026-10-03T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);

process.env.PREVIEW_API_AUTH_SECRET = SECRET;
process.env.VERCEL_ENV = 'preview';

function token(actorId = 'preview:operator:001', scopes = ['operator:broadcast.manage']) {
  return mintPreviewApiToken({ secret: SECRET, subject: 'preview-operator-session', actorId, scopes, issuedAt: NOW_SEC - 5, expiresAt: NOW_SEC + 300 });
}
function req(method, body, { auth = token() } = {}) {
  return { method, headers: auth ? { authorization: `Bearer ${auth}` } : {}, body };
}
function response() {
  const result = { statusCode: null, body: null, headers: {} };
  return { result, setHeader(n, v) { result.headers[String(n).toLowerCase()] = v; return this; }, status(c) { result.statusCode = c; return this; }, json(b) { result.body = b; return this; } };
}
const PREVIEW_ENV = { VERCEL_ENV: 'preview', DATABASE_URL: 'postgres://test' };

function fakeSql({ broadcasts = [] } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('GROUP BY subject_id')) return broadcasts;
    throw new Error('UNEXPECTED_QUERY: ' + text);
  };
  sql.calls = calls;
  return sql;
}

test('rejects unsupported methods', async () => {
  const res = response();
  await handler({ method: 'DELETE', headers: {} }, res, { env: PREVIEW_ENV });
  assert.equal(res.result.statusCode, 405);
});

test('rejects a missing bearer token before containment response', async () => {
  const res = response();
  await handler(req('POST', { subject: 'x', body: 'y', eventType: 'DOWNTIME_NOTICE' }, { auth: null }), res, { env: PREVIEW_ENV, now: NOW });
  assert.equal(res.result.statusCode, 401);
});

test('rejects an operator token without the broadcast scope before containment response', async () => {
  const res = response();
  const fulfillmentToken = token('preview:operator:fulfillment:001', ['operator:fulfillment.manage']);
  await handler(req('POST', { subject: 'x', body: 'y', eventType: 'DOWNTIME_NOTICE' }, { auth: fulfillmentToken }), res, { env: PREVIEW_ENV, now: NOW });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'AUTHORIZATION_SCOPE_REQUIRED');
});

test('authorized POST fails closed before database access or mutation', async () => {
  const res = response();
  const sql = fakeSql();
  await handler(req('POST', { subject: 'Scheduled downtime', body: 'We will be down 2-3am GMT.', eventType: 'DOWNTIME_NOTICE' }), res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 503);
  assert.deepEqual(res.result.body, { ok: false, error: 'ADMIN_BROADCAST_SENDING_NOT_CERTIFIED' });
  assert.equal(res.result.headers['cache-control'], 'no-store');
  assert.equal(sql.calls.length, 0);
});

test('GET remains read-only and returns previously sent broadcasts', async () => {
  const res = response();
  const sql = fakeSql({ broadcasts: [{ subject_id: 'broadcast:test-1', subject: 'Scheduled downtime', body: 'We will be down 2-3am GMT.', event_type: 'DOWNTIME_NOTICE', queued_at: new Date(NOW).toISOString(), recipient_count: '3' }] });
  await handler({ method: 'GET', headers: { authorization: `Bearer ${token()}` } }, res, { env: PREVIEW_ENV, now: NOW, sql });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.broadcasts.length, 1);
  assert.equal(res.result.body.broadcasts[0].recipientCount, 3);
  assert.equal(res.result.body.broadcasts[0].broadcastId, 'broadcast:test-1');
  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /SELECT subject_id/);
});

test('DATABASE_URL missing fails closed for GET', async () => {
  const res = response();
  await handler({ method: 'GET', headers: { authorization: `Bearer ${token()}` } }, res, { env: { VERCEL_ENV: 'preview' }, now: NOW });
  assert.equal(res.result.statusCode, 503);
  assert.equal(res.result.body.error, 'DATABASE_URL_MISSING');
});
