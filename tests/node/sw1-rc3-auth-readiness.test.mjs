import test from 'node:test';
import assert from 'node:assert/strict';
import dbHealth from '../../api/db-health.js';

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
  'PRODUCTION_APPLICATION_ACCESS_ENABLED',
  'OIDC_ISSUER',
  'OIDC_AUDIENCE',
  'OIDC_JWKS_URI',
  'DATABASE_URL',
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

async function runWithEnv(values, request = { method: 'GET', url: '/api/db-health?probe=identity-readiness' }) {
  const original = snapshotEnv();
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, values);
    const res = response();
    await dbHealth(request, res);
    return res.result;
  } finally {
    restoreEnv(original);
  }
}

test('RC3 auth readiness reports Production identity unconfigured without exposing values', async () => {
  const result = await runWithEnv({
    VERCEL_ENV: 'production',
    PRODUCTION_APPLICATION_ACCESS_ENABLED: 'false',
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    ok: true,
    environment: 'production',
    authenticationMode: 'OIDC',
    productionApplicationAccessEnabled: false,
    oidcConfigured: false,
    applicationBindingStoreConfigured: false,
    identityRuntimeReady: false,
    liveFundsAuthorized: false,
  });
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(JSON.stringify(result.body).includes('issuer.example.test'), false);
});

test('RC3 auth readiness stays false when OIDC and database exist but access kill switch is disabled', async () => {
  const result = await runWithEnv({
    VERCEL_ENV: 'production',
    PRODUCTION_APPLICATION_ACCESS_ENABLED: 'false',
    OIDC_ISSUER: 'https://issuer.example.test/',
    OIDC_AUDIENCE: 'workers-food-club-api',
    OIDC_JWKS_URI: 'https://issuer.example.test/.well-known/jwks.json',
    DATABASE_URL: 'postgres://secret.example.test/foodclub',
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.oidcConfigured, true);
  assert.equal(result.body.applicationBindingStoreConfigured, true);
  assert.equal(result.body.productionApplicationAccessEnabled, false);
  assert.equal(result.body.identityRuntimeReady, false);

  const serialized = JSON.stringify(result.body);
  assert.equal(serialized.includes('issuer.example.test'), false);
  assert.equal(serialized.includes('postgres://'), false);
});

test('RC3 auth readiness becomes true only when OIDC, binding store and explicit access gate are all present', async () => {
  const result = await runWithEnv({
    VERCEL_ENV: 'production',
    PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
    OIDC_ISSUER: 'https://issuer.example.test/',
    OIDC_AUDIENCE: 'workers-food-club-api',
    OIDC_JWKS_URI: 'https://issuer.example.test/.well-known/jwks.json',
    DATABASE_URL: 'postgres://secret.example.test/foodclub',
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.identityRuntimeReady, true);
  assert.equal(result.body.liveFundsAuthorized, false);
});

test('RC3 auth readiness preserves Preview behavior', async () => {
  const result = await runWithEnv({ VERCEL_ENV: 'preview' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.authenticationMode, 'PREVIEW');
  assert.equal(result.body.identityRuntimeReady, true);
  assert.equal(result.body.productionApplicationAccessEnabled, false);
  assert.equal(result.body.liveFundsAuthorized, false);
});

test('RC3 auth readiness only permits GET', async () => {
  const result = await runWithEnv({}, { method: 'POST', url: '/api/db-health?probe=identity-readiness' });
  assert.equal(result.statusCode, 405);
  assert.equal(result.body?.error, 'METHOD_NOT_ALLOWED');
  assert.equal(result.headers.allow, 'GET');
});
