import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import decideHandler from '../../api/membership-application-decide.js';
import { signEmployeeSessionToken } from '../../lib/employee-session.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const EMPLOYEE_SESSION_SECRET = 'e'.repeat(32);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'membership-decide-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

const OIDC_ENV = {
  PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
  OIDC_ISSUER: 'https://identity.example.test/',
  OIDC_AUDIENCE: 'workers-food-club-api',
  OIDC_JWKS_URI: 'https://identity.example.test/.well-known/jwks.json',
};

function oidcToken({ sub = 'oidc|owner', iatSecondsAgo = 5 } = {}) {
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
  return signEmployeeSessionToken(EMPLOYEE_SESSION_SECRET, 'sess-decide-1');
}

function fakeSql({
  callerBinding = { participant_id: 'participant:owner-1', state: 'ACTIVE' },
  session = { session_id: 'sess-decide-1' },
  callerGrants = [{ actions: ['authority:owner'] }],
  application = { application_id: 'application:1', issuer: 'https://identity.example.test/', subject: 'oidc|applicant', state: 'SUBMITTED' },
  applicantBinding = null,
  rejectSucceeds = true,
  claimSucceeds = true,
} = {}) {
  const inserts = [];
  const updates = [];
  let identityBindingCallCount = 0;
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM application_identity_binding')) {
      identityBindingCallCount += 1;
      return identityBindingCallCount === 1 ? (callerBinding ? [callerBinding] : []) : (applicantBinding ? [applicantBinding] : []);
    }
    if (text.includes('FROM employee_session')) return session ? [session] : [];
    if (text.includes('FROM application_authority_grant')) return callerGrants;
    if (text.includes('SELECT application_id, issuer, subject, state')) return application ? [application] : [];
    if (text.includes('INSERT INTO application_participant')) { inserts.push({ table: 'application_participant', values }); return []; }
    if (text.includes('INSERT INTO application_identity_binding')) { inserts.push({ table: 'application_identity_binding', values }); return []; }
    if (text.includes('UPDATE application_identity_binding')) { updates.push({ table: 'application_identity_binding_update', values }); return []; }
    if (text.includes('INSERT INTO application_membership')) { inserts.push({ table: 'application_membership', values }); return []; }
    if (text.includes('UPDATE membership_application') && text.includes("REJECTED")) { updates.push({ table: 'membership_application_reject', values }); return rejectSucceeds ? [{ application_id: 'application:1' }] : []; }
    if (text.includes('UPDATE membership_application') && text.includes('APPROVED')) { updates.push({ table: 'membership_application_approve', values }); return claimSucceeds ? [{ application_id: 'application:1' }] : []; }
    if (text.includes('UPDATE application_membership')) { updates.push({ table: 'application_membership_update', values }); return []; }
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
  sql.inserts = inserts;
  sql.updates = updates;
  return sql;
}

test('membership-application-decide rejects non-POST methods', async () => {
  const res = response();
  await decideHandler(request('GET'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('membership-application-decide requires a valid decision value', async () => {
  const res = response();
  await decideHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { applicationId: 'application:1', decision: 'MAYBE' } }), res, { ...productionOptions, sql: fakeSql() });
  assert.equal(res.result.statusCode, 400);
  assert.equal(res.result.body.error, 'DECISION_MUST_BE_APPROVE_OR_REJECT');
});

test('membership-application-decide refuses an ordinary Operator caller', async () => {
  const res = response();
  await decideHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { applicationId: 'application:1', decision: 'APPROVE' } }), res, {
    ...productionOptions,
    sql: fakeSql({ callerGrants: [{ actions: ['operator:orders.read'] }] }),
  });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'MEMBERSHIP_DECISION_REQUIRES_OWNER_OR_ADMIN');
});

test('membership-application-decide returns 404 for an unknown application', async () => {
  const res = response();
  await decideHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { applicationId: 'application:missing', decision: 'APPROVE' } }), res, {
    ...productionOptions,
    sql: fakeSql({ application: null }),
  });
  assert.equal(res.result.statusCode, 404);
});

test('membership-application-decide rejects deciding an already-decided application', async () => {
  const res = response();
  await decideHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { applicationId: 'application:1', decision: 'APPROVE' } }), res, {
    ...productionOptions,
    sql: fakeSql({ application: { application_id: 'application:1', issuer: 'x', subject: 'y', state: 'APPROVED' } }),
  });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'APPLICATION_NOT_DECIDABLE');
});

test('membership-application-decide REJECT marks the application rejected with the decider recorded', async () => {
  const sql = fakeSql();
  const res = response();
  await decideHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { applicationId: 'application:1', decision: 'REJECT' } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.decision, 'REJECT');
  const reject = sql.updates.find((u) => u.table === 'membership_application_reject');
  assert.ok(reject);
  assert.equal(reject.values[1], 'participant:owner-1');
});

test('membership-application-decide APPROVE creates a new participant, binding, and ACTIVE membership', async () => {
  const sql = fakeSql();
  const res = response();
  await decideHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { applicationId: 'application:1', decision: 'APPROVE' } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.decision, 'APPROVE');
  assert.equal(typeof res.result.body.participantId, 'string');
  assert.equal(typeof res.result.body.membershipId, 'string');

  const membershipInsert = sql.inserts.find((i) => i.table === 'application_membership');
  assert.ok(membershipInsert);
  assert.equal(membershipInsert.values[1], res.result.body.participantId);
  assert.deepEqual(membershipInsert.values[3], ['application:1']);

  const bindingInsert = sql.inserts.find((i) => i.table === 'application_identity_binding');
  assert.ok(bindingInsert);
  assert.deepEqual(bindingInsert.values[4], ['member:purchase.commit', 'member:payment.execute', 'member:fulfillment.accept', 'member:orders.read', 'member:notifications.read', 'member:engagement.survey']);

  const approve = sql.updates.find((u) => u.table === 'membership_application_approve');
  assert.ok(approve);
  assert.equal(approve.values[2], res.result.body.membershipId);
});

test('membership-application-decide APPROVE reuses an already-bound applicant instead of creating a duplicate participant', async () => {
  const sql = fakeSql({ applicantBinding: { participant_id: 'participant:already-bound', state: 'ACTIVE' } });
  const res = response();
  await decideHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { applicationId: 'application:1', decision: 'APPROVE' } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.participantId, 'participant:already-bound');
  assert.equal(sql.inserts.some((i) => i.table === 'application_participant'), false);
  assert.equal(sql.inserts.some((i) => i.table === 'application_identity_binding'), false);
  assert.ok(sql.updates.find((u) => u.table === 'application_identity_binding_update'));
});

test('membership-application-decide APPROVE self-heals a lost claim race by ending the membership it just created', async () => {
  const sql = fakeSql({ claimSucceeds: false });
  const res = response();
  await decideHandler(request('POST', { token: oidcToken(), employeeSession: validSessionToken(), body: { applicationId: 'application:1', decision: 'APPROVE' } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'APPLICATION_ALREADY_DECIDED');
  assert.ok(sql.updates.find((u) => u.table === 'application_membership_update'));
});
