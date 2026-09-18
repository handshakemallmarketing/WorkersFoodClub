import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import redeemHandler from '../../api/authority-invite-redeem.js';
import { hashInvitationToken } from '../../lib/authority-invitation.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const RAW_TOKEN = 'test-raw-invitation-token';
const TOKEN_DIGEST = hashInvitationToken(RAW_TOKEN);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'authority-invite-redeem-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

const OIDC_ENV = {
  PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
  OIDC_ISSUER: 'https://identity.example.test/',
  OIDC_AUDIENCE: 'workers-food-club-api',
  OIDC_JWKS_URI: 'https://identity.example.test/.well-known/jwks.json',
};

function oidcToken({ sub = 'oidc|invitee', iatSecondsAgo = 5 } = {}) {
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

function futureIso(msFromNow = 60_000) {
  return new Date(NOW + msFromNow).toISOString();
}

function fakeSql({
  invitation = { invitation_id: 'invitation:1', inviter_id: 'participant:inviter', actions: ['authority:admin'], target_prefix: null, state: 'INVITED', expires_at: futureIso() },
  binding = null,
  inviterActiveGrants = [{ grant_id: 'grant:1', grantor_id: 'participant:system', actor_id: 'participant:inviter', actions: ['authority:owner'], valid_from: new Date(NOW - 60_000).toISOString() }],
  claimSucceeds = true,
} = {}) {
  const inserts = [];
  const updates = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM authority_invitation')) return invitation ? [invitation] : [];
    if (text.includes('FROM application_identity_binding')) return binding ? [binding] : [];
    if (text.includes('FROM application_authority_grant')) return inviterActiveGrants;
    if (text.includes('INSERT INTO application_participant')) { inserts.push({ table: 'application_participant', values }); return []; }
    if (text.includes('INSERT INTO application_authority_grant')) { inserts.push({ table: 'application_authority_grant', values }); return []; }
    if (text.includes('INSERT INTO application_identity_binding')) { inserts.push({ table: 'application_identity_binding', values }); return []; }
    if (text.includes('UPDATE authority_invitation')) { updates.push({ table: 'authority_invitation', values }); return claimSucceeds ? [{ invitation_id: 'invitation:1' }] : []; }
    if (text.includes('UPDATE application_authority_grant')) { updates.push({ table: 'application_authority_grant', values }); return []; }
    throw new Error(`UNEXPECTED_QUERY: ${text}`);
  };
  sql.inserts = inserts;
  sql.updates = updates;
  return sql;
}

test('authority-invite-redeem rejects non-POST methods', async () => {
  const res = response();
  await redeemHandler(request('GET'), res, {});
  assert.equal(res.result.statusCode, 405);
});

test('authority-invite-redeem requires a token in the body', async () => {
  const res = response();
  await redeemHandler(request('POST', { token: oidcToken(), body: {} }), res, { ...productionOptions, sql: fakeSql() });
  assert.equal(res.result.statusCode, 400);
  assert.equal(res.result.body.error, 'TOKEN_REQUIRED');
});

test('authority-invite-redeem rejects an unknown token', async () => {
  const res = response();
  await redeemHandler(request('POST', { token: oidcToken(), body: { token: RAW_TOKEN } }), res, { ...productionOptions, sql: fakeSql({ invitation: null }) });
  assert.equal(res.result.statusCode, 404);
  assert.equal(res.result.body.error, 'INVITATION_NOT_FOUND');
});

test('authority-invite-redeem rejects an already-accepted invitation', async () => {
  const res = response();
  await redeemHandler(request('POST', { token: oidcToken(), body: { token: RAW_TOKEN } }), res, {
    ...productionOptions,
    sql: fakeSql({ invitation: { invitation_id: 'invitation:1', inviter_id: 'participant:inviter', actions: ['authority:admin'], target_prefix: null, state: 'ACCEPTED', expires_at: futureIso() } }),
  });
  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'INVITATION_ALREADY_ACCEPTED');
});

test('authority-invite-redeem rejects an expired invitation', async () => {
  const res = response();
  await redeemHandler(request('POST', { token: oidcToken(), body: { token: RAW_TOKEN } }), res, {
    ...productionOptions,
    sql: fakeSql({ invitation: { invitation_id: 'invitation:1', inviter_id: 'participant:inviter', actions: ['authority:admin'], target_prefix: null, state: 'INVITED', expires_at: new Date(NOW - 1000).toISOString() } }),
  });
  assert.equal(res.result.statusCode, 410);
  assert.equal(res.result.body.error, 'INVITATION_EXPIRED');
});

test('authority-invite-redeem refuses redemption if the inviter has since lost the authority to grant it', async () => {
  const res = response();
  await redeemHandler(request('POST', { token: oidcToken(), body: { token: RAW_TOKEN } }), res, {
    ...productionOptions,
    sql: fakeSql({ inviterActiveGrants: [] }),
  });
  assert.equal(res.result.statusCode, 403);
  assert.equal(res.result.body.error, 'ONLY_OWNER_MAY_GRANT_ADMIN');
  assert.equal(res.result.body.ok, false);
});

test('authority-invite-redeem creates a new participant, grant, and identity binding, then marks the invitation ACCEPTED', async () => {
  const sql = fakeSql();
  const res = response();
  await redeemHandler(request('POST', { token: oidcToken({ sub: 'oidc|new-admin' }), body: { token: RAW_TOKEN } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 201);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.reusedExistingIdentityBinding, false);

  const grantInsert = sql.inserts.find((i) => i.table === 'application_authority_grant');
  assert.ok(grantInsert);
  assert.equal(grantInsert.values[1], 'participant:inviter');
  assert.equal(grantInsert.values[2], res.result.body.participantId);
  assert.deepEqual(grantInsert.values[3], ['authority:admin']);
  assert.equal(grantInsert.values[6], 'grant:1', 'parent_grant_id records the inviter grant that qualified them');

  const claim = sql.updates.find((u) => u.table === 'authority_invitation');
  assert.ok(claim);
  assert.equal(claim.values[1], res.result.body.participantId);
  assert.equal(claim.values[2], res.result.body.grantId);
});

test('authority-invite-redeem reuses an existing ACTIVE identity binding instead of creating a duplicate participant', async () => {
  const sql = fakeSql({ binding: { participant_id: 'participant:already-bound', state: 'ACTIVE' } });
  const res = response();
  await redeemHandler(request('POST', { token: oidcToken(), body: { token: RAW_TOKEN } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 201);
  assert.equal(res.result.body.reusedExistingIdentityBinding, true);
  assert.equal(res.result.body.participantId, 'participant:already-bound');
  assert.equal(sql.inserts.some((i) => i.table === 'application_participant'), false);
  assert.equal(sql.inserts.some((i) => i.table === 'application_identity_binding'), false);
});

test('authority-invite-redeem self-heals a lost claim race by revoking the grant it just created', async () => {
  const sql = fakeSql({ claimSucceeds: false });
  const res = response();
  await redeemHandler(request('POST', { token: oidcToken(), body: { token: RAW_TOKEN } }), res, { ...productionOptions, sql });

  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.error, 'INVITATION_ALREADY_REDEEMED');
  const revokeUpdate = sql.updates.find((u) => u.table === 'application_authority_grant');
  assert.ok(revokeUpdate, 'the just-created grant must be revoked when the invitation claim is lost');
});
