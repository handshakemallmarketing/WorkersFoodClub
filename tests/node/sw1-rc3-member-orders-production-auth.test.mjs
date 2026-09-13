import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import memberOrders from '../../api/member-orders.js';

const NOW_SEC = Math.floor(Date.now() / 1000);
const ACTOR_CLAIM = 'https://foodclub.example/actor_id';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'rc3-member-orders-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

function token(actorId = 'member:prod-001') {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://identity.example.test/',
    aud: 'workers-food-club-api',
    sub: 'oidc|member-prod-001',
    exp: NOW_SEC + 300,
    iat: NOW_SEC - 5,
    scope: 'member:orders.read',
    [ACTOR_CLAIM]: actorId,
  })).toString('base64url');
  const signature = signData('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function response() {
  const result = { statusCode: null, body: null, headers: {} };
  return {
    result,
    setHeader(name, value) {
      result.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
}

const ENV_KEYS = [
  'VERCEL_ENV',
  'DATABASE_URL',
  'PRODUCTION_APPLICATION_ACCESS_ENABLED',
  'OIDC_ISSUER',
  'OIDC_AUDIENCE',
  'OIDC_JWKS_URI',
  'OIDC_ACTOR_CLAIM',
  'OIDC_SCOPE_CLAIM',
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test('RC3 member-orders valid OIDC identity fails closed without application binding store', async () => {
  const original = snapshotEnv();
  const originalFetch = globalThis.fetch;
  try {
    process.env.VERCEL_ENV = 'production';
    process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = 'true';
    delete process.env.DATABASE_URL;
    process.env.OIDC_ISSUER = 'https://identity.example.test/';
    process.env.OIDC_AUDIENCE = 'workers-food-club-api';
    process.env.OIDC_JWKS_URI = 'https://identity.example.test/.well-known/jwks.json';
    process.env.OIDC_ACTOR_CLAIM = ACTOR_CLAIM;
    process.env.OIDC_SCOPE_CLAIM = 'scope';
    globalThis.fetch = async (url) => {
      assert.equal(String(url), process.env.OIDC_JWKS_URI);
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const res = response();
    await memberOrders({
      method: 'GET',
      headers: { authorization: `Bearer ${token()}` },
    }, res);

    assert.equal(res.result.statusCode, 503);
    assert.equal(res.result.body?.error, 'APPLICATION_BINDING_STORE_NOT_CONFIGURED');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(original);
  }
});

test('RC3 member-orders production route fails closed without OIDC configuration when access is enabled', async () => {
  const original = snapshotEnv();
  try {
    process.env.VERCEL_ENV = 'production';
    process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = 'true';
    delete process.env.DATABASE_URL;
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_AUDIENCE;
    delete process.env.OIDC_JWKS_URI;
    delete process.env.OIDC_ACTOR_CLAIM;
    delete process.env.OIDC_SCOPE_CLAIM;

    const res = response();
    await memberOrders({ method: 'GET', headers: {} }, res);

    assert.equal(res.result.statusCode, 503);
    assert.equal(res.result.body?.error, 'PRODUCTION_AUTH_NOT_CONFIGURED');
  } finally {
    restoreEnv(original);
  }
});

test('RC3 member-orders production route is blocked by rollback kill switch before auth', async () => {
  const original = snapshotEnv();
  try {
    process.env.VERCEL_ENV = 'production';
    process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = 'false';
    const res = response();
    await memberOrders({ method: 'GET', headers: { authorization: `Bearer ${token()}` } }, res);
    assert.equal(res.result.statusCode, 503);
    assert.equal(res.result.body?.error, 'PRODUCTION_APPLICATION_ACCESS_DISABLED');
  } finally {
    restoreEnv(original);
  }
});
