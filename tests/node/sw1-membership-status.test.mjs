import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import statusHandler from '../../api/membership-status.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'membership-status-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

const OIDC_ENV = {
  PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
  OIDC_ISSUER: 'https://identity.example.test/',
  OIDC_AUDIENCE: 'workers-food-club-api',
  OIDC_JWKS_URI: 'https://identity.example.test/.well-known/jwks.json',
};

function oidcToken({ sub = 'oidc|applicant', iatSecondsAgo = 5 } = {}) {
  const iat = NOW_SEC - iatSecondsAgo;
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iss: OIDC_ENV.OIDC_ISSUER, aud: OIDC_ENV.OIDC_AUDIENCE, sub, exp: NOW_SEC + 3300, iat })).toString('base64url');
  const s = signData('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url');
  return `${h}.${p}.${s}`;
}

function response() {
  const result = { statusCode: null, body: null, headers: {} };
  return {
    result,
    setHeader(n, v) { result.headers[String(n).toLowerCase()] = v; return this; },
    status(c) { result.statusCode = c; return this; },
    json(b) { result.body = b; return this; },
  };
}

function request(method, token) {
  return { method, headers: token ? { authorization: `Bearer ${token}` } : {} };
}

const productionOptions = { now: NOW, env: OIDC_ENV, production: { now: NOW, env: OIDC_ENV, jwksResolver: async () => ({ keys: [jwk] }) } };

test.beforeEach(() => {
  process.env.VERCEL_ENV = 'production';
});

function fakeSql({ binding = null, membership = null, application = null } = {}) {
  return async (strings) => {
    const text = strings.join('?');
    if (text.includes('FROM application_identity_binding')) return binding ? [binding] : [];
    if (text.includes('FROM application_membership')) return membership ? [membership] : [];
    if (text.includes('FROM membership_application')) return application ? [application] : [];
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
}

test('membership-status rejects non-GET methods', async () => {
  const res = response();
  await statusHandler(request('POST'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('membership-status fails closed when production access is disabled', async () => {
  const res = response();
  await statusHandler(request('GET', oidcToken()), res, { ...productionOptions, env: { ...OIDC_ENV, PRODUCTION_APPLICATION_ACCESS_ENABLED: 'false' }, sql: fakeSql() });
  assert.equal(res.result.statusCode, 503);
});

test('membership-status reports no membership and no pending application for a brand-new identity', async () => {
  const res = response();
  await statusHandler(request('GET', oidcToken()), res, { ...productionOptions, sql: fakeSql() });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.membershipState, null);
  assert.equal(res.result.body.hasPendingApplication, false);
});

test('membership-status reports ACTIVE membership for a bound member', async () => {
  const res = response();
  await statusHandler(request('GET', oidcToken()), res, {
    ...productionOptions,
    sql: fakeSql({ binding: { participant_id: 'participant:member-1', state: 'ACTIVE' }, membership: { state: 'ACTIVE' } }),
  });
  assert.equal(res.result.body.membershipState, 'ACTIVE');
});

test('membership-status reports SUSPENDED membership rather than treating it as no membership', async () => {
  const res = response();
  await statusHandler(request('GET', oidcToken()), res, {
    ...productionOptions,
    sql: fakeSql({ binding: { participant_id: 'participant:member-1', state: 'ACTIVE' }, membership: { state: 'SUSPENDED' } }),
  });
  assert.equal(res.result.body.membershipState, 'SUSPENDED');
});

test('membership-status reports a pending application', async () => {
  const res = response();
  await statusHandler(request('GET', oidcToken()), res, {
    ...productionOptions,
    sql: fakeSql({ application: { application_id: 'application:1' } }),
  });
  assert.equal(res.result.body.hasPendingApplication, true);
});
