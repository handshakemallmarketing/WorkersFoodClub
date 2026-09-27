import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import revokeHandler from '../../api/authority-revoke.js';
import { signEmployeeSessionToken } from '../../lib/employee-session.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const EMPLOYEE_SESSION_SECRET = 'b'.repeat(32);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'authority-revoke-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

const OIDC_ENV = {
  PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
  OIDC_ISSUER: 'https://identity.example.test/',
  OIDC_AUDIENCE: 'workers-food-club-api',
  OIDC_JWKS_URI: 'https://identity.example.test/.well-known/jwks.json',
};

function oidcToken({ sub = 'oidc|revoker', iatSecondsAgo = 5 } = {}) {
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

function request(method, { token, employeeSession, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (employeeSession) headers['x-employee-session'] = employeeSession;
  return { method, headers, body };
}

const productionOptions = {
  now: NOW,
  env: OIDC_ENV,
  production: { now: NOW, env: OIDC_ENV, jwksResolver: async () => ({ keys: [jwk] }) },
  employeeSessionSecret: EMPLOYEE_SESSION_SECRET,
};

test.beforeEach(() => {
  process.env.VERCEL_ENV = 'production';
});

function validSessionToken() {
  return signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET, 'sess-revoke-1');
}

function activeGrantRow(overrides = {}) {
  return {
    grant_id: 'grant:target',
    grantor_id: 'participant:system',
    actor_id: 'participant:target-actor',
    actions: ['some:operator-action'],
    target_prefix: null,
    valid_from: new Date(NOW - 60_000).toISOString(),
    valid_until: null,
    revoked_at: null,
    parent_grant_id: null,
    ...overrides,
  };
}

function fakeSql({
  binding = { participant_id: 'participant:revoker', state: 'ACTIVE' },
  session = { session_id: 'sess-revoke-1' },
  target = activeGrantRow(),
  revokerActiveGrants = [activeGrantRow({ grant_id: 'grant:revoker-admin', actor_id: 'participant:revoker', actions: ['authority:admin'] })],
  ownerGrants = [activeGrantRow({ grant_id: 'grant:owner-1', actor_id: 'participant:the-owner', actions: ['authority:owner'] })],
  updateAffects = true,
} = {}) {
  const updates = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('UPDATE application_authority_grant')) { updates.push({ values }); return updateAffects ? [{ grant_id: values[2] ?? 'grant:target' }] : []; }
    if (text.includes('FROM application_identity_binding')) return binding ? [binding] : [];
    if (text.includes('FROM employee_session')) return session ? [session] : [];
    if (text.includes('WHERE grant_id=') && text.includes('FROM application_authority_grant')) return target ? [target] : [];
    if (text.includes('=ANY(actions)')) return ownerGrants;
    if (text.includes('FROM application_authority_grant')) return revokerActiveGrants;
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
  sql.updates = updates;
  return sql;
}

test('authority-revoke rejects non-POST methods', async () => {
  const res = response();
  await revokeHandler(request('GET'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('authority-revoke requires a grantId in the body', async () => {
  const res = response();
  await revokeHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: {} }), res, { ...productionOptions, sql: fakeSql() });
  assert.equal(res.result.statusCode, 400);
  assert.equal(res.result.body.error, 'GRANT_ID_REQUIRED');
});

test('authority-revoke requires a live employee session', async () => {
  const res = response();
  await revokeHandler(request('POST', { token: oidcToken(), body: { grantId: 'grant:target' } }), res, { ...productionOptions, sql: fakeSql() });
  assert.equal(res.result.statusCode, 401);
  assert.equal(res.result.body.error, 'EMPLOYEE_SESSION_REQUIRED');
});

test('authority-revoke returns 404 for an unknown grant', async () => {
  const res = response();
  await revokeHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { grantId: 'grant:missing' } }), res, {
    ...productionOptions,
    sql: fakeSql({ target: null }),
  });
  assert.equal(res.result.statusCode, 404);
  assert.equal(res.result.body.error, 'GRANT_NOT_FOUND');
});

test('authority-revoke is idempotent for an already-revoked grant', async () => {
  const res = response();
  await revokeHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { grantId: 'grant:target' } }), res, {
    ...productionOptions,
    sql: fakeSql({ target: activeGrantRow({ revoked_at: new Date(NOW - 1000).toISOString() }) }),
  });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.alreadyRevoked, true);
});

test('authority-revoke refuses to let an Admin revoke an Owner grant', async () => {
  const res = response();
  await revokeHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { grantId: 'grant:target' } }), res, {
    ...productionOptions,
    sql: fakeSql({ target: activeGrantRow({ actions: ['authority:owner'] }) }),
  });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'ONLY_OWNER_MAY_REVOKE_OWNER');
});

test('authority-revoke protects the last active Owner grant even from another Owner', async () => {
  const res = response();
  const target = activeGrantRow({ grant_id: 'grant:owner-1', actions: ['authority:owner'], actor_id: 'participant:the-owner' });
  await revokeHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { grantId: 'grant:owner-1' } }), res, {
    ...productionOptions,
    sql: fakeSql({
      target,
      revokerActiveGrants: [activeGrantRow({ grant_id: 'grant:revoker-owner', actor_id: 'participant:revoker', actions: ['authority:owner'] })],
      ownerGrants: [target],
    }),
  });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'LAST_OWNER_PROTECTED');
});

test('authority-revoke lets an Admin revoke an ordinary operator grant and records who revoked it', async () => {
  const sql = fakeSql();
  const res = response();
  await revokeHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { grantId: 'grant:target' } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.alreadyRevoked, false);

  assert.equal(sql.updates.length, 1);
  assert.equal(sql.updates[0].values[1], 'participant:revoker');
});
