import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import cancelHandler from '../../api/authority-invite-cancel.js';
import { signEmployeeSessionToken } from '../../lib/employee-session.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const EMPLOYEE_SESSION_SECRET = 'd'.repeat(32);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'authority-invite-cancel-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

const OIDC_ENV = {
  PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
  OIDC_ISSUER: 'https://identity.example.test/',
  OIDC_AUDIENCE: 'workers-food-club-api',
  OIDC_JWKS_URI: 'https://identity.example.test/.well-known/jwks.json',
};

function oidcToken({ sub = 'oidc|caller', iatSecondsAgo = 5 } = {}) {
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
  return signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET, 'sess-cancel-1');
}

function fakeSql({
  binding = { participant_id: 'participant:caller', state: 'ACTIVE' },
  session = { session_id: 'sess-cancel-1' },
  invitation = { invitation_id: 'invitation:1', inviter_id: 'participant:caller', state: 'INVITED' },
  callerOwnerGrants = [],
  cancelSucceeds = true,
} = {}) {
  const updates = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM application_identity_binding')) return binding ? [binding] : [];
    if (text.includes('FROM employee_session')) return session ? [session] : [];
    if (text.includes('FROM authority_invitation') && text.includes('SELECT invitation_id, inviter_id, state')) return invitation ? [invitation] : [];
    if (text.includes('FROM application_authority_grant')) return callerOwnerGrants;
    if (text.includes('UPDATE authority_invitation')) { updates.push({ values }); return cancelSucceeds ? [{ invitation_id: 'invitation:1' }] : []; }
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
  sql.updates = updates;
  return sql;
}

test('authority-invite-cancel rejects non-POST methods', async () => {
  const res = response();
  await cancelHandler(request('GET'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('authority-invite-cancel requires an invitationId', async () => {
  const res = response();
  await cancelHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: {} }), res, { ...productionOptions, sql: fakeSql() });
  assert.equal(res.result.statusCode, 400);
  assert.equal(res.result.body.error, 'INVITATION_ID_REQUIRED');
});

test('authority-invite-cancel returns 404 for an unknown invitation', async () => {
  const res = response();
  await cancelHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { invitationId: 'invitation:missing' } }), res, {
    ...productionOptions,
    sql: fakeSql({ invitation: null }),
  });
  assert.equal(res.result.statusCode, 404);
  assert.equal(res.result.body.error, 'INVITATION_NOT_FOUND');
});

test('authority-invite-cancel refuses a caller who is neither the inviter nor an Owner', async () => {
  const res = response();
  await cancelHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { invitationId: 'invitation:1' } }), res, {
    ...productionOptions,
    sql: fakeSql({ invitation: { invitation_id: 'invitation:1', inviter_id: 'participant:someone-else', state: 'INVITED' }, callerOwnerGrants: [] }),
  });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'ONLY_INVITER_OR_OWNER_MAY_CANCEL');
});

test('authority-invite-cancel lets an Owner cancel someone else\'s invitation', async () => {
  const res = response();
  await cancelHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { invitationId: 'invitation:1' } }), res, {
    ...productionOptions,
    sql: fakeSql({
      invitation: { invitation_id: 'invitation:1', inviter_id: 'participant:someone-else', state: 'INVITED' },
      callerOwnerGrants: [{ actions: ['authority:owner'] }],
    }),
  });
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.cancelled, true);
});

test('authority-invite-cancel rejects cancelling an already-accepted invitation', async () => {
  const res = response();
  await cancelHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { invitationId: 'invitation:1' } }), res, {
    ...productionOptions,
    sql: fakeSql({ invitation: { invitation_id: 'invitation:1', inviter_id: 'participant:caller', state: 'ACCEPTED' } }),
  });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'INVITATION_NOT_CANCELLABLE');
});

test('authority-invite-cancel lets the original inviter cancel their own pending invitation', async () => {
  const sql = fakeSql();
  const res = response();
  await cancelHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { invitationId: 'invitation:1' } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.cancelled, true);
  assert.equal(sql.updates.length, 1);
  assert.equal(sql.updates[0].values[1], 'participant:caller');
});
