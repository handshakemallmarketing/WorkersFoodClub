import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import bootstrapHandler from '../../api/owner-bootstrap.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'owner-bootstrap-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

const OIDC_ENV = {
  PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
  OIDC_ISSUER: 'https://identity.example.test/',
  OIDC_AUDIENCE: 'workers-food-club-api',
  OIDC_JWKS_URI: 'https://identity.example.test/.well-known/jwks.json',
};

function oidcToken({ sub = 'oidc|willie', iatSecondsAgo = 5 } = {}) {
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

function fakeSql({ existingOwnerGrants = [], binding = null } = {}) {
  const inserts = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM application_authority_grant')) return existingOwnerGrants;
    if (text.includes('INSERT INTO application_participant')) { inserts.push({ table: 'application_participant', values }); return []; }
    if (text.includes('FROM application_identity_binding')) return binding ? [binding] : [];
    if (text.includes('INSERT INTO application_authority_grant')) { inserts.push({ table: 'application_authority_grant', values }); return []; }
    if (text.includes('INSERT INTO application_identity_binding')) { inserts.push({ table: 'application_identity_binding', values }); return []; }
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
  sql.inserts = inserts;
  return sql;
}

test('owner-bootstrap rejects non-POST methods', async () => {
  const res = response();
  await bootstrapHandler(request('GET'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('owner-bootstrap fails closed when production access is disabled', async () => {
  const res = response();
  await bootstrapHandler(request('POST', oidcToken()), res, { ...productionOptions, env: { ...OIDC_ENV, PRODUCTION_APPLICATION_ACCESS_ENABLED: 'false' }, sql: fakeSql() });
  assert.equal(res.result.statusCode, 503);
  assert.equal(res.result.body.error, 'PRODUCTION_APPLICATION_ACCESS_DISABLED');
});

test('owner-bootstrap rejects a non-fresh step-up token even though it is otherwise a valid credential', async () => {
  const res = response();
  await bootstrapHandler(request('POST', oidcToken({ iatSecondsAgo: 45 * 60 })), res, { ...productionOptions, sql: fakeSql() });
  assert.equal(res.result.statusCode, 401);
  assert.equal(res.result.body.error, 'OWNER_BOOTSTRAP_STEP_UP_NOT_FRESH');
});

test('owner-bootstrap refuses to run a second time once any active Owner grant exists, and writes nothing', async () => {
  const sql = fakeSql({ existingOwnerGrants: [{ grant_id: 'grant:existing-owner' }] });
  const res = response();
  await bootstrapHandler(request('POST', oidcToken()), res, { ...productionOptions, sql });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'OWNER_ALREADY_BOOTSTRAPPED');
  assert.equal(sql.inserts.length, 0);
});

test('owner-bootstrap creates a new participant, identity binding, and Owner grant on first run', async () => {
  const sql = fakeSql({ existingOwnerGrants: [], binding: null });
  const res = response();
  await bootstrapHandler(request('POST', oidcToken({ sub: 'oidc|willie-real' })), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 201);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.reusedExistingIdentityBinding, false);
  assert.equal(typeof res.result.body.participantId, 'string');
  assert.equal(typeof res.result.body.grantId, 'string');

  const participantInserts = sql.inserts.filter((i) => i.table === 'application_participant');
  // system-bootstrap participant + the new person participant ('PERSON'/'ACTIVE' are literal SQL text, not interpolated)
  assert.equal(participantInserts.length, 2);
  assert.equal(participantInserts[0].values[0], 'participant:system-bootstrap');
  assert.equal(participantInserts[1].values[0], res.result.body.participantId);

  const grantInsert = sql.inserts.find((i) => i.table === 'application_authority_grant');
  assert.ok(grantInsert);
  assert.equal(grantInsert.values[0], res.result.body.grantId);
  assert.equal(grantInsert.values[1], 'participant:system-bootstrap');
  assert.equal(grantInsert.values[2], res.result.body.participantId);
  assert.equal(grantInsert.values[3], 'authority:owner');

  const bindingInsert = sql.inserts.find((i) => i.table === 'application_identity_binding');
  assert.ok(bindingInsert);
  assert.equal(bindingInsert.values[1], OIDC_ENV.OIDC_ISSUER);
  assert.equal(bindingInsert.values[2], 'oidc|willie-real');
  assert.equal(bindingInsert.values[3], res.result.body.participantId);
});

test('owner-bootstrap reuses an existing ACTIVE identity binding instead of creating a duplicate participant or binding', async () => {
  const sql = fakeSql({
    existingOwnerGrants: [],
    binding: { participant_id: 'participant:already-bound', state: 'ACTIVE' },
  });
  const res = response();
  await bootstrapHandler(request('POST', oidcToken()), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 201);
  assert.equal(res.result.body.reusedExistingIdentityBinding, true);
  assert.equal(res.result.body.participantId, 'participant:already-bound');

  // Only the system-bootstrap participant upsert -- no new person participant, no new binding row.
  const participantInserts = sql.inserts.filter((i) => i.table === 'application_participant');
  assert.equal(participantInserts.length, 1);
  assert.equal(participantInserts[0].values[0], 'participant:system-bootstrap');
  assert.equal(sql.inserts.some((i) => i.table === 'application_identity_binding'), false);

  const grantInsert = sql.inserts.find((i) => i.table === 'application_authority_grant');
  assert.equal(grantInsert.values[2], 'participant:already-bound');
});

test('owner-bootstrap refuses a disabled existing identity binding', async () => {
  const sql = fakeSql({ existingOwnerGrants: [], binding: { participant_id: 'participant:1', state: 'DISABLED' } });
  const res = response();
  await bootstrapHandler(request('POST', oidcToken()), res, { ...productionOptions, sql });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'APPLICATION_PRINCIPAL_DISABLED');
});
