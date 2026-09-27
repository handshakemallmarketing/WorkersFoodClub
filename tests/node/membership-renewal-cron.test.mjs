import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/membership-renewal-cron.js';

const NOW = Date.parse('2026-09-24T06:00:00Z');
const PROD_ENV = { PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true', VERCEL_ENV: 'production' };
const CRON_SECRET = 'a'.repeat(32);
const RENEWAL_TOKEN = 'b'.repeat(32);

function req(headers = {}) { return { method: 'GET', headers }; }
function res() { const r = { statusCode: null, body: null, headers: {} }; return { r, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.statusCode = c; return this; }, json(b) { r.body = b; return this; } }; }

function cronSql({ candidates = [], graced = [], restricted = [] } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('FROM application_membership m') && text.includes('NOT EXISTS')) return candidates;
    if (text.includes('WITH member AS')) {
      const membershipId = values[0];
      return [{ invoice_id: `subscription-invoice:${membershipId}`, membership_id: membershipId, subscription_year: 2026, amount_minor: 12000, currency: 'GHS', state: 'OPEN', due_at: '2026-10-05T00:00:00.000Z', existing: false }];
    }
    if (text.includes("SET standing = 'GRACE'")) return graced;
    if (text.includes("SET standing = 'RESTRICTED'")) return restricted;
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
  sql.calls = calls;
  return sql;
}

async function invoke(sql, { headers, env = PROD_ENV, ...extra } = {}) {
  const out = res();
  await handler(req(headers), out, { sql, env, now: NOW, annualFeeMinor: 12000, ...extra });
  return out.r;
}

test('rejects non-GET methods', async () => {
  const out = res();
  await handler({ method: 'POST', headers: {} }, out, { env: PROD_ENV });
  assert.equal(out.r.statusCode, 405);
});

test('fails closed when production application access is disabled', async () => {
  const sql = cronSql();
  const r = await invoke(sql, { env: { VERCEL_ENV: 'production' }, headers: { authorization: `Bearer ${CRON_SECRET}` } });
  assert.notEqual(r.statusCode, 200);
  assert.equal(sql.calls.length, 0);
});

test('rejects a request with neither a valid CRON_SECRET bearer nor the renewal authority header', async () => {
  const sql = cronSql();
  const r = await invoke(sql, { env: { ...PROD_ENV, CRON_SECRET }, headers: {} });
  assert.equal(r.statusCode, 401);
  assert.equal(r.body.error, 'RENEWAL_AUTHORITY_REQUIRED');
  assert.equal(sql.calls.length, 0);
});

test('accepts Vercel\'s native cron bearer (CRON_SECRET)', async () => {
  const sql = cronSql();
  const r = await invoke(sql, { env: { ...PROD_ENV, CRON_SECRET }, headers: { authorization: `Bearer ${CRON_SECRET}` } });
  assert.equal(r.statusCode, 200);
});

test('also accepts the same manual renewal-authority header used by membership-renewal-invoice.js', async () => {
  const sql = cronSql();
  const r = await invoke(sql, { env: { ...PROD_ENV, MEMBERSHIP_RENEWAL_AUTHORITY_TOKEN: RENEWAL_TOKEN }, headers: { 'x-membership-renewal-authority': RENEWAL_TOKEN } });
  assert.equal(r.statusCode, 200);
});

test('issues this year\'s invoice for every ACTIVE/GRACE PRIMARY membership missing one', async () => {
  const sql = cronSql({ candidates: [{ membership_id: 'membership:1', public_member_id: 'WFC-P-1' }, { membership_id: 'membership:2', public_member_id: 'WFC-P-2' }] });
  const r = await invoke(sql, { headers: { authorization: `Bearer ${CRON_SECRET}` }, env: { ...PROD_ENV, CRON_SECRET } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.invoicesIssued, 2);
  assert.deepEqual(r.body.invoiceIds.sort(), ['subscription-invoice:membership:1', 'subscription-invoice:membership:2']);
});

test('reports memberships moved into GRACE and RESTRICTED', async () => {
  const sql = cronSql({ graced: [{ membership_id: 'membership:3' }], restricted: [{ membership_id: 'membership:4' }] });
  const r = await invoke(sql, { headers: { authorization: `Bearer ${CRON_SECRET}` }, env: { ...PROD_ENV, CRON_SECRET } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.gracedMembershipIds, ['membership:3']);
  assert.deepEqual(r.body.restrictedMembershipIds, ['membership:4']);
});

test('the GRACE transition sets the full 30-day window, gated on the invoice actually being overdue', async () => {
  const sql = cronSql();
  await invoke(sql, { headers: { authorization: `Bearer ${CRON_SECRET}` }, env: { ...PROD_ENV, CRON_SECRET } });
  const graceQuery = sql.calls.find(c => c.text.includes("SET standing = 'GRACE'")).text;
  assert.match(graceQuery, /grace_started_at = now\(\)/);
  assert.match(graceQuery, /grace_ends_at = now\(\) \+ interval '30 days'/);
  assert.match(graceQuery, /i\.due_at < now\(\)/);
  assert.match(graceQuery, /m\.standing = 'ACTIVE'/);
});

test('the RESTRICTED transition only fires once the grace window itself has elapsed, never immediately on due date', async () => {
  const sql = cronSql();
  await invoke(sql, { headers: { authorization: `Bearer ${CRON_SECRET}` }, env: { ...PROD_ENV, CRON_SECRET } });
  const restrictQuery = sql.calls.find(c => c.text.includes("SET standing = 'RESTRICTED'")).text;
  assert.match(restrictQuery, /standing = 'GRACE' AND grace_ends_at <= now\(\)/);
});

test('never auto-advances a membership to SUSPENDED', async () => {
  const sql = cronSql();
  await invoke(sql, { headers: { authorization: `Bearer ${CRON_SECRET}` }, env: { ...PROD_ENV, CRON_SECRET } });
  for (const call of sql.calls) assert.doesNotMatch(call.text, /SET standing = 'SUSPENDED'/);
});

test('every bulk transition writes an application_access_audit row in the same statement', async () => {
  const sql = cronSql();
  await invoke(sql, { headers: { authorization: `Bearer ${CRON_SECRET}` }, env: { ...PROD_ENV, CRON_SECRET } });
  const graceQuery = sql.calls.find(c => c.text.includes("SET standing = 'GRACE'")).text;
  const restrictQuery = sql.calls.find(c => c.text.includes("SET standing = 'RESTRICTED'")).text;
  assert.match(graceQuery, /INSERT INTO application_access_audit/);
  assert.match(graceQuery, /MEMBERSHIP_GRACE_STARTED/);
  assert.match(restrictQuery, /INSERT INTO application_access_audit/);
  assert.match(restrictQuery, /MEMBERSHIP_RESTRICTED/);
});

test('DATABASE_URL missing fails closed', async () => {
  const out = res();
  await handler(req({ authorization: `Bearer ${CRON_SECRET}` }), out, { env: { ...PROD_ENV, CRON_SECRET }, now: NOW });
  assert.equal(out.r.statusCode, 503);
  assert.equal(out.r.body.error, 'DATABASE_URL_MISSING');
});
