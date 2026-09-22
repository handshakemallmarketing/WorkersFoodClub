import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import applyHandler from '../../api/membership-apply.js';

function response() {
  const result = { statusCode: null, body: null };
  return { result, setHeader() {}, status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } };
}

test('AUTO enrollment fails closed before persistence when no deliverable phone exists', async () => {
  let queried = false;
  const out = response();
  await applyHandler({ method: 'POST', body: { fullName: 'Email Only', governmentEmployer: 'GHS', email: 'email-only@example.com' } }, out, {
    env: { VERCEL_ENV: 'preview', MEMBERSHIP_APPLICATION_REVIEW_MODE: 'AUTO' },
    sql: async () => { queried = true; return []; },
  });
  assert.equal(out.result.statusCode, 400);
  assert.equal(out.result.body.error, 'PHONE_INVALID');
  assert.equal(queried, false);
});

test('AUTO enrollment rejects a non-normalizable phone before persistence', async () => {
  let queried = false;
  const out = response();
  await applyHandler({ method: 'POST', body: { fullName: 'Bad Phone', governmentEmployer: 'GHS', phone: 'abc' } }, out, {
    env: { VERCEL_ENV: 'preview' }, sql: async () => { queried = true; return []; },
  });
  assert.equal(out.result.statusCode, 400);
  assert.equal(out.result.body.error, 'PHONE_INVALID');
  assert.equal(queried, false);
});

test('AUTO enrollment persists a Ghana local phone in canonical E.164 form', async () => {
  const values = [];
  const sql = async (strings, ...args) => {
    values.push(...args);
    const text = strings.join('?');
    if (text.includes('INSERT INTO membership_application')) {
      const membershipId = args.find(value => typeof value === 'string' && value.startsWith('membership:'));
      return [{ application_id: 'application:test', resulting_membership_id: membershipId }];
    }
    if (text.includes('WITH member AS')) {
      const membershipId = args.find(value => typeof value === 'string' && value.startsWith('membership:'));
      return [{ invoice_id: 'subscription-invoice:test', membership_id: membershipId, subscription_year: 2026, amount_minor: 12000, currency: 'GHS', state: 'OPEN', due_at: '2026-10-05T00:00:00.000Z', existing: false }];
    }
    throw new Error('UNEXPECTED_QUERY');
  };
  const out = response();
  await applyHandler({ method: 'POST', body: { fullName: 'Valid Phone', governmentEmployer: 'GHS', phone: '024 123 4567' } }, out, {
    env: { VERCEL_ENV: 'preview' }, sql, annualFeeMinor: 12000, now: Date.parse('2026-09-21T00:00:00Z'),
  });
  assert.equal(out.result.statusCode, 201);
  assert.ok(values.includes('+233241234567'));
});

test('pre-settlement member session remains authenticated but cannot gain member access', () => {
  const auth = fs.readFileSync(new URL('../../public/member-auth.js', import.meta.url), 'utf8');
  assert.match(auth, /identityVerified: authenticated/);
  assert.match(auth, /memberAccessAvailable: memberAccess/);
  assert.match(auth, /invoice: status\?\.invoice/);
  assert.match(auth, /Online subscription payment is not yet certified/);
  assert.match(auth, /token && !memberAccess/);
  assert.match(auth, /channel: 'PHONE'/);
  assert.doesNotMatch(auth, /Email verification/);
  assert.doesNotMatch(auth, /membership-subscription-payment-initiate/);
});

test('subscription-due guard recognizes the API access state exactly', () => {
  const guard = fs.readFileSync(new URL('../../public/entry-journey-guard.js', import.meta.url), 'utf8');
  assert.match(guard, /MEMBERSHIP_INACTIVE_INITIAL_FEE_DUE/);
  assert.doesNotMatch(guard, /accessState==='INACTIVE_INITIAL_FEE_DUE'/);
});
