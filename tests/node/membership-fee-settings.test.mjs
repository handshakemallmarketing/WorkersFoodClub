import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/membership-fee-settings.js';
import { resolveAnnualFeeMinor } from '../../lib/membership-fee-configuration.js';

function response() {
  const result = { statusCode: null, body: null, headers: {} };
  return { result, setHeader(n, v) { result.headers[String(n).toLowerCase()] = v; return this; }, status(c) { result.statusCode = c; return this; }, json(b) { result.body = b; return this; } };
}

function fakeSql({ active = null } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('FROM membership_fee_configuration')) return active ? [active] : [];
    if (text.includes('set_membership_fee_configuration')) return [{ config_id: values[0], amount_minor: values[1], currency: 'GHS', active: true, created_at: '2026-09-24T00:00:00.000Z' }];
    throw new Error('UNEXPECTED_QUERY: ' + text);
  };
  sql.calls = calls;
  return sql;
}

const owner = { actorId: 'participant:owner', isSystemOwner: true };
const admin = { actorId: 'participant:admin', isSystemOwner: false };

test('GET reports unconfigured when no active fee exists', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {} }, res, { actor: owner, sql: fakeSql() });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.configured, false);
  assert.equal(res.result.body.fee, null);
});

test('GET reports the active fee', async () => {
  const active = { config_id: 'membership-fee:1', amount_minor: 12000, currency: 'GHS', created_by: 'participant:owner', created_at: '2026-09-24T00:00:00.000Z' };
  const res = response();
  await handler({ method: 'GET', headers: {} }, res, { actor: admin, sql: fakeSql({ active }) });
  assert.equal(res.result.body.configured, true);
  assert.equal(res.result.body.fee.amountMinor, 12000);
  assert.equal(res.result.body.fee.setBy, 'participant:owner');
});

test('POST refuses a non-Owner', async () => {
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { amountMinor: 12000 } }, res, { actor: admin, sql: fakeSql() });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'MEMBERSHIP_FEE_OWNER_AUTHORITY_REQUIRED');
});

test('POST rejects a non-positive or non-integer amount', async () => {
  for (const amountMinor of [0, -100, 1.5, 'abc', undefined]) {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: { amountMinor } }, res, { actor: owner, sql: fakeSql() });
    assert.equal(res.result.statusCode, 400, `expected 400 for ${amountMinor}`);
    assert.equal(res.result.body.error, 'AMOUNT_MINOR_INVALID');
  }
});

test('POST sets a new active fee as the Owner', async () => {
  const sql = fakeSql();
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { amountMinor: 15000 } }, res, { actor: owner, sql });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.fee.amountMinor, 15000);
  assert.equal(res.result.body.fee.setBy, 'participant:owner');
  const call = sql.calls.find(c => c.text.includes('set_membership_fee_configuration'));
  assert.ok(call);
  assert.ok(call.values.includes(15000));
  assert.ok(call.values.includes('participant:owner'));
});

test('resolveAnnualFeeMinor prefers the admin-configured DB value over the env fallback', async () => {
  const active = { amount_minor: 12000, currency: 'GHS' };
  const result = await resolveAnnualFeeMinor({ sql: fakeSql({ active }), env: { ANNUAL_MEMBERSHIP_FEE_MINOR: '99999' } });
  assert.equal(result.amountMinor, 12000);
  assert.equal(result.source, 'ADMIN_CONFIGURED');
});

test('resolveAnnualFeeMinor falls back to the env var when nothing is configured', async () => {
  const result = await resolveAnnualFeeMinor({ sql: fakeSql(), env: { ANNUAL_MEMBERSHIP_FEE_MINOR: '12000' } });
  assert.equal(result.amountMinor, 12000);
  assert.equal(result.source, 'ENV_FALLBACK');
});

test('resolveAnnualFeeMinor returns null when nothing is configured anywhere', async () => {
  const result = await resolveAnnualFeeMinor({ sql: fakeSql(), env: {} });
  assert.equal(result, null);
});

test('resolveAnnualFeeMinor works without a sql connection (env-only callers)', async () => {
  const result = await resolveAnnualFeeMinor({ env: { ANNUAL_MEMBERSHIP_FEE_MINOR: '12000' } });
  assert.equal(result.amountMinor, 12000);
  assert.equal(result.source, 'ENV_FALLBACK');
});
