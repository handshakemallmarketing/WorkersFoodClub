import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import startHandler from '../../api/enrollment-verify-start.js';

function response() {
  const result = { statusCode: null, body: null };
  return { result, setHeader() {}, status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } };
}

test('enrollment verification fails closed before persistence when no deliverable phone exists', async () => {
  let queried = false;
  const out = response();
  await startHandler({ method: 'POST', body: { fullName: 'Email Only', governmentEmployer: 'GHS' } }, out, {
    env: { VERCEL_ENV: 'preview' },
    sql: async () => { queried = true; return []; },
  });
  assert.equal(out.result.statusCode, 400);
  assert.equal(out.result.body.error, 'SMS_RECIPIENT_INVALID');
  assert.equal(queried, false);
});

test('enrollment verification rejects a non-normalizable phone before persistence', async () => {
  let queried = false;
  const out = response();
  await startHandler({ method: 'POST', body: { fullName: 'Bad Phone', governmentEmployer: 'GHS', phone: 'abc' } }, out, {
    env: { VERCEL_ENV: 'preview' }, sql: async () => { queried = true; return []; },
  });
  assert.equal(out.result.statusCode, 400);
  assert.equal(out.result.body.error, 'SMS_RECIPIENT_INVALID');
  assert.equal(queried, false);
});

test('enrollment verification resolves a Ghana local phone to canonical E.164 form before duplicate matching', async () => {
  const calls = [];
  const sql = async (strings, ...args) => {
    calls.push(...args);
    const text = strings.join('?');
    if (text.includes('record_rate_limit_event')) return [{ allowed: true, current_count: 1 }];
    if (text.includes('resolve_enrollment_contact')) return [{ route: 'NEW', application_id: 'application:test', membership_id: null }];
    if (text.includes('create_enrollment_verification_challenge')) return [{ challenge_id: 'enrollment-challenge:test' }];
    throw new Error('UNEXPECTED_QUERY: ' + text);
  };
  const out = response();
  await startHandler({ method: 'POST', body: { fullName: 'Valid Phone', governmentEmployer: 'GHS', phone: '024 123 4567' } }, out, {
    env: { VERCEL_ENV: 'preview' }, sql, code: 123456, deliverChallenge: async () => {},
  });
  assert.equal(out.result.statusCode, 200);
  assert.ok(calls.includes('+233241234567'));
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
