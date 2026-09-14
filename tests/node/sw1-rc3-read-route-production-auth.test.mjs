import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import memberNotifications from '../../api/member-notifications.js';
import operatorOrders from '../../api/operator-orders.js';

const NOW_SEC = Math.floor(Date.now() / 1000);
const ACTOR_CLAIM = 'https://foodclub.example/actor_id';
const ISSUER = 'https://identity.example.test/';
const AUDIENCE = 'workers-food-club-api';
const JWKS_URI = 'https://identity.example.test/.well-known/jwks.json';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'rc3-read-routes-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

function token({ actorId, scope, subject }) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: subject,
    exp: NOW_SEC + 300,
    iat: NOW_SEC - 5,
    scope,
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

async function withProductionOidc(run) {
  const original = snapshotEnv();
  const originalFetch = globalThis.fetch;
  try {
    process.env.VERCEL_ENV = 'production';
    process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = 'true';
    delete process.env.DATABASE_URL;
    process.env.OIDC_ISSUER = ISSUER;
    process.env.OIDC_AUDIENCE = AUDIENCE;
    process.env.OIDC_JWKS_URI = JWKS_URI;
    delete process.env.OIDC_ACTOR_CLAIM;
    delete process.env.OIDC_SCOPE_CLAIM;
    globalThis.fetch = async (url) => {
      assert.equal(String(url), JWKS_URI);
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(original);
  }
}

test('RC3 member-notifications valid OIDC identity fails closed without application binding store', async () => {
  await withProductionOidc(async () => {
    const res = response();
    await memberNotifications({
      method: 'GET',
      headers: {
        authorization: `Bearer ${token({
          actorId: 'member:prod-notifications-001',
          scope: 'member:notifications.read',
          subject: 'oidc|member-prod-notifications-001',
        })}`,
      },
    }, res);

    assert.equal(res.result.statusCode, 503);
    assert.equal(res.result.body?.error, 'APPLICATION_BINDING_STORE_NOT_CONFIGURED');
  });
});

test('RC3 IdP scope claim is not application authority', async () => {
  await withProductionOidc(async () => {
    const res = response();
    await memberNotifications({
      method: 'GET',
      headers: {
        authorization: `Bearer ${token({
          actorId: 'operator:attacker-selected',
          scope: 'operator:everything',
          subject: 'oidc|member-prod-notifications-001',
        })}`,
      },
    }, res);

    // The OIDC layer authenticates only issuer+subject. Application authority
    // must come from the server-side binding store, which is deliberately absent.
    assert.equal(res.result.statusCode, 503);
    assert.equal(res.result.body?.error, 'APPLICATION_BINDING_STORE_NOT_CONFIGURED');
  });
});

test('RC3 operator-orders valid OIDC identity fails closed without application binding store', async () => {
  await withProductionOidc(async () => {
    const res = response();
    await operatorOrders({
      method: 'GET',
      headers: {
        authorization: `Bearer ${token({
          actorId: 'operator:prod-001',
          scope: 'operator:orders.read',
          subject: 'oidc|operator-prod-001',
        })}`,
      },
    }, res);

    assert.equal(res.result.statusCode, 503);
    assert.equal(res.result.body?.error, 'APPLICATION_BINDING_STORE_NOT_CONFIGURED');
  });
});

test('RC3 production read routes are disabled by rollback kill switch before OIDC', async () => {
  const original = snapshotEnv();
  try {
    process.env.VERCEL_ENV = 'production';
    process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = 'false';
    const res = response();
    await operatorOrders({
      method: 'GET',
      headers: {
        authorization: `Bearer ${token({
          actorId: 'operator:prod-001',
          scope: 'operator:orders.read',
          subject: 'oidc|operator-prod-001',
        })}`,
      },
    }, res);
    assert.equal(res.result.statusCode, 503);
    assert.equal(res.result.body?.error, 'PRODUCTION_APPLICATION_ACCESS_DISABLED');
  } finally {
    restoreEnv(original);
  }
});
