import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import applyHandler from '../../api/membership-apply.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'membership-apply-test-key';
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

function request(method, { token, body } = {}) {
  return { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
}

const productionOptions = { now: NOW, env: OIDC_ENV, production: { now: NOW, env: OIDC_ENV, jwksResolver: async () => ({ keys: [jwk] }) } };

test.beforeEach(() => {
  process.env.VERCEL_ENV = 'production';
});

function fakeSql({ binding = null, membership = null, existingApplication = null } = {}) {
  const inserts = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM application_identity_binding')) return binding ? [binding] : [];
    if (text.includes('FROM application_membership')) return membership ? [membership] : [];
    if (text.includes('FROM membership_application')) return existingApplication ? [existingApplication] : [];
    if (text.includes('INSERT INTO membership_application')) { inserts.push({ table: 'membership_application', values }); return []; }
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
  sql.inserts = inserts;
  return sql;
}

test('membership-apply rejects non-POST methods', async () => {
  const res = response();
  await applyHandler(request('GET'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('membership-apply refuses someone who is already an active member', async () => {
  const res = response();
  await applyHandler(request('POST', { token: oidcToken(), body: {} }), res, {
    ...productionOptions,
    sql: fakeSql({ binding: { participant_id: 'participant:member-1', state: 'ACTIVE' }, membership: { state: 'ACTIVE' } }),
  });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'ALREADY_A_MEMBER');
});

test('membership-apply refuses someone who is already a suspended (still current) member', async () => {
  const res = response();
  await applyHandler(request('POST', { token: oidcToken(), body: {} }), res, {
    ...productionOptions,
    sql: fakeSql({ binding: { participant_id: 'participant:member-1', state: 'ACTIVE' }, membership: { state: 'SUSPENDED' } }),
  });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'ALREADY_A_MEMBER');
});

test('membership-apply creates a new application and trims the contact note', async () => {
  const sql = fakeSql();
  const res = response();
  await applyHandler(request('POST', { token: oidcToken(), body: { contactNote: '  hello there  ' } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 201);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.state, 'SUBMITTED');
  assert.equal(res.result.body.alreadySubmitted, false);
  const insert = sql.inserts.find((i) => i.table === 'membership_application');
  assert.equal(insert.values[3], 'hello there');
});

test('membership-apply is idempotent when an application is already pending', async () => {
  const sql = fakeSql({ existingApplication: { application_id: 'application:existing-1' } });
  const res = response();
  await applyHandler(request('POST', { token: oidcToken(), body: {} }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.applicationId, 'application:existing-1');
  assert.equal(res.result.body.alreadySubmitted, true);
  assert.equal(sql.inserts.length, 0);
});
