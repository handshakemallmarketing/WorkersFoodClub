import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSessionId,
  signEmployeeSessionToken,
  verifyEmployeeSessionTokenShape,
  extractEmployeeSessionToken,
  isFreshStepUp,
  FRESH_STEP_UP_MAX_AGE_SECONDS,
} from '../../lib/employee-session.js';

const SECRET = 'employee-session-test-secret-0123456789-abcdefghijklmnop';

test('generateSessionId produces distinct, well-formed ids', () => {
  const a = generateSessionId();
  const b = generateSessionId();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f-]{36}$/);
});

test('a signed token verifies back to its exact session id', () => {
  const sessionId = generateSessionId();
  const token = signEmployeeSessionToken(SECRET, sessionId);
  assert.equal(verifyEmployeeSessionTokenShape(SECRET, token), sessionId);
});

test('token verification fails closed on tampering, wrong secret, and malformed input', () => {
  const sessionId = generateSessionId();
  const token = signEmployeeSessionToken(SECRET, sessionId);
  const [version, id, signature] = token.split('.');

  assert.equal(verifyEmployeeSessionTokenShape(SECRET, `${version}.${generateSessionId()}.${signature}`), null);
  assert.equal(verifyEmployeeSessionTokenShape('a-completely-different-secret-0123456789', token), null);
  assert.equal(verifyEmployeeSessionTokenShape(SECRET, `wfc-employee-v2.${id}.${signature}`), null);
  assert.equal(verifyEmployeeSessionTokenShape(SECRET, 'not-a-real-token'), null);
  assert.equal(verifyEmployeeSessionTokenShape(SECRET, undefined), null);
  assert.equal(verifyEmployeeSessionTokenShape('too-short', token), null);
});

test('extractEmployeeSessionToken reads the dedicated header only', () => {
  assert.equal(extractEmployeeSessionToken({ headers: { 'x-employee-session': 'abc' } }), 'abc');
  assert.equal(extractEmployeeSessionToken({ headers: {} }), null);
  assert.equal(extractEmployeeSessionToken({ headers: { authorization: 'Bearer abc' } }), null);
  assert.equal(extractEmployeeSessionToken({}), null);
});

test('isFreshStepUp accepts only a token issued essentially now, not merely unexpired', () => {
  const nowMs = Date.parse('2026-09-17T12:00:00Z');
  const nowSeconds = Math.floor(nowMs / 1000);

  assert.equal(isFreshStepUp(nowSeconds, nowMs), true);
  assert.equal(isFreshStepUp(nowSeconds - FRESH_STEP_UP_MAX_AGE_SECONDS, nowMs), true);
  assert.equal(isFreshStepUp(nowSeconds - FRESH_STEP_UP_MAX_AGE_SECONDS - 1, nowMs), false);
  // A Google ID token issued 45 minutes ago is still unexpired but is not a fresh re-authentication.
  assert.equal(isFreshStepUp(nowSeconds - 45 * 60, nowMs), false);
  assert.equal(isFreshStepUp(nowSeconds + 20, nowMs), true, 'small clock skew ahead is tolerated');
  assert.equal(isFreshStepUp(nowSeconds + 60, nowMs), false, 'a token from the future beyond skew tolerance is rejected');
  assert.equal(isFreshStepUp(undefined, nowMs), false);
  assert.equal(isFreshStepUp(NaN, nowMs), false);
});
