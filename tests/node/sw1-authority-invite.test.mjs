import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import inviteHandler from '../../api/authority-invite.js';
import { signEmployeeSessionToken } from '../../lib/employee-session.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const EMPLOYEE_SESSION_SECRET = 'a'.repeat(32);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'authority-invite-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

const OIDC_ENV = {
  PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
  OIDC_ISSUER: 'https://identity.example.test/',
  OIDC_AUDIENCE: 'workers-food-club-api',
  OIDC_JWKS_URI: 'https://identity.example.test/.well-known/jwks.json',
};

function oidcToken({ sub = 'oidc|inviter', iatSecondsAgo = 5 } = {}) {
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

function fakeSql({ binding = { participant_id: 'participant:inviter', state: 'ACTIVE' }, session = { session_id: 'sess-1' }, inviterActiveGrants = [] } = {}) {
  const inserts = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM application_identity_binding')) return binding ? [binding] : [];
    if (text.includes('FROM employee_session')) return session ? [session] : [];
    if (text.includes('FROM application_authority_grant')) return inviterActiveGrants;
    if (text.includes('INSERT INTO authority_invitation')) { inserts.push({ table: 'authority_invitation', values }); return []; }
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
  sql.inserts = inserts;
  return sql;
}

function validSessionToken(participantId = 'participant:inviter') {
  return signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET, 'sess-1');
}

test('authority-invite rejects non-POST methods', async () => {
  const res = response();
  await inviteHandler(request('GET'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('authority-invite fails closed when production access is disabled', async () => {
  const res = response();
  await inviteHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { actions: ['authority:admin'] } }), res, {
    ...productionOptions,
    env: { ...OIDC_ENV, PRODUCTION_APPLICATION_ACCESS_ENABLED: 'false' },
    sql: fakeSql(),
  });
  assert.equal(res.result.statusCode, 503);
  assert.equal(res.result.body.error, 'PRODUCTION_APPLICATION_ACCESS_DISABLED');
});

test('authority-invite rejects a non-fresh step-up token', async () => {
  const res = response();
  await inviteHandler(request('POST', { token: oidcToken({ iatSecondsAgo: 45 * 60 }), employeeSession: validSessionToken(), body: { actions: ['authority:admin'] } }), res, {
    ...productionOptions,
    sql: fakeSql(),
  });
  assert.equal(res.result.statusCode, 401);
  assert.equal(res.result.body.error, 'AUTHORITY_INVITE_STEP_UP_NOT_FRESH');
});

test('authority-invite rejects a request with no actions', async () => {
  const res = response();
  await inviteHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { actions: [] } }), res, {
    ...productionOptions,
    sql: fakeSql(),
  });
  assert.equal(res.result.statusCode, 400);
  assert.equal(res.result.body.error, 'ACTIONS_REQUIRED');
});

test('authority-invite requires a live employee session even with a fresh OIDC token', async () => {
  const res = response();
  await inviteHandler(request('POST', { token: oidcToken(), body: { actions: ['authority:admin'] } }), res, {
    ...productionOptions,
    sql: fakeSql(),
  });
  assert.equal(res.result.statusCode, 401);
  assert.equal(res.result.body.error, 'EMPLOYEE_SESSION_REQUIRED');
});

test('authority-invite refuses to let an Admin invite another Admin', async () => {
  const res = response();
  await inviteHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { actions: ['authority:admin'] } }), res, {
    ...productionOptions,
    sql: fakeSql({ inviterActiveGrants: [{ grant_id: 'grant:1', grantor_id: 'participant:system', actor_id: 'participant:inviter', actions: ['authority:admin'], valid_from: NOW_ISO() }] }),
  });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'ONLY_OWNER_MAY_GRANT_ADMIN');
});

test('authority-invite creates a bounded invitation and returns the raw token exactly once', async () => {
  const sql = fakeSql({ inviterActiveGrants: [{ grant_id: 'grant:1', grantor_id: 'participant:system', actor_id: 'participant:inviter', actions: ['authority:owner'], valid_from: NOW_ISO() }] });
  const res = response();
  await inviteHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { actions: ['authority:admin'] } }), res, {
    ...productionOptions,
    sql,
  });

  assert.equal(res.result.statusCode, 201);
  assert.equal(res.result.body.ok, true);
  assert.equal(typeof res.result.body.token, 'string');
  assert.equal(typeof res.result.body.invitationId, 'string');
  assert.equal(typeof res.result.body.expiresAt, 'string');

  const insert = sql.inserts.find((i) => i.table === 'authority_invitation');
  assert.ok(insert);
  assert.equal(insert.values[0], res.result.body.invitationId);
  assert.equal(insert.values[1], 'participant:inviter');
  assert.deepEqual(insert.values[2], ['authority:admin']);
  assert.notEqual(insert.values[4], res.result.body.token, 'only the digest, never the raw token, is persisted');
});

function NOW_ISO() {
  return new Date(NOW - 60_000).toISOString();
}
