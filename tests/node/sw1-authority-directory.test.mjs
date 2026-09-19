import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import directoryHandler from '../../api/authority-directory.js';
import { signEmployeeSessionToken } from '../../lib/employee-session.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const EMPLOYEE_SESSION_SECRET = 'c'.repeat(32);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'authority-directory-test-key';
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

function request(method, { token, employeeSession } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (employeeSession) headers['x-employee-session'] = employeeSession;
  return { method, headers };
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
  return signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET, 'sess-directory-1');
}

function fakeSql({
  binding = { participant_id: 'participant:caller', state: 'ACTIVE' },
  session = { session_id: 'sess-directory-1' },
  callerGrants = [{ actions: ['authority:owner'] }],
  grants = [],
  invitations = [],
  membershipApplications = [],
} = {}) {
  return async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM application_identity_binding')) return binding ? [binding] : [];
    if (text.includes('FROM employee_session')) return session ? [session] : [];
    if (text.includes('WHERE actor_id=') && text.includes('FROM application_authority_grant')) return callerGrants;
    if (text.includes('FROM application_authority_grant')) return grants;
    if (text.includes('FROM authority_invitation')) return invitations;
    if (text.includes('FROM membership_application')) return membershipApplications;
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
}

test('authority-directory rejects non-GET methods', async () => {
  const res = response();
  await directoryHandler(request('POST'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('authority-directory requires a live employee session', async () => {
  const res = response();
  await directoryHandler(request('GET', { token: oidcToken() }), res, { ...productionOptions, sql: fakeSql() });
  assert.equal(res.result.statusCode, 401);
  assert.equal(res.result.body.error, 'EMPLOYEE_SESSION_REQUIRED');
});

test('authority-directory refuses an ordinary Operator caller', async () => {
  const res = response();
  await directoryHandler(request('GET', { token: oidcToken(), employeeSession: validSessionToken() }), res, {
    ...productionOptions,
    sql: fakeSql({ callerGrants: [{ actions: ['operator:orders.read'] }] }),
  });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'AUTHORITY_DIRECTORY_REQUIRES_OWNER_OR_ADMIN');
});

test('authority-directory returns the caller tier, grants, and invitations for an Owner', async () => {
  const res = response();
  await directoryHandler(request('GET', { token: oidcToken(), employeeSession: validSessionToken() }), res, {
    ...productionOptions,
    sql: fakeSql({
      grants: [
        { grant_id: 'grant:1', grantor_id: 'participant:system', actor_id: 'participant:caller', actions: ['authority:owner'], target_prefix: null, valid_from: new Date(NOW - 1000).toISOString(), valid_until: null, revoked_at: null, revoked_by: null, parent_grant_id: null },
      ],
      invitations: [
        { invitation_id: 'invitation:1', inviter_id: 'participant:caller', actions: ['authority:admin'], target_prefix: null, state: 'INVITED', invited_at: new Date(NOW - 1000).toISOString(), expires_at: new Date(NOW + 60_000).toISOString(), accepted_at: null, accepted_by: null, resulting_grant_id: null, revoked_at: null, revoked_by: null },
      ],
    }),
  });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.self.tier, 'OWNER');
  assert.equal(res.result.body.self.participantId, 'participant:caller');
  assert.equal(res.result.body.grants.length, 1);
  assert.equal(res.result.body.grants[0].tier, 'OWNER');
  assert.equal(res.result.body.invitations.length, 1);
  assert.equal(res.result.body.invitations[0].state, 'INVITED');
});

test('authority-directory returns pending membership applications for review', async () => {
  const res = response();
  await directoryHandler(request('GET', { token: oidcToken(), employeeSession: validSessionToken() }), res, {
    ...productionOptions,
    sql: fakeSql({
      membershipApplications: [
        { application_id: 'application:1', issuer: 'https://accounts.google.com', subject: 'oidc|applicant', contact_note: 'please', state: 'SUBMITTED', submitted_at: new Date(NOW - 1000).toISOString(), decided_at: null, decided_by: null, resulting_membership_id: null },
      ],
    }),
  });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.membershipApplications.length, 1);
  assert.equal(res.result.body.membershipApplications[0].state, 'SUBMITTED');
  assert.equal(res.result.body.membershipApplications[0].contactNote, 'please');
});
