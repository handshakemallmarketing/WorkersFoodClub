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
  'OIDC_BROWSER_PROVIDER',
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

async function run(values) {
  const original = snapshotEnv();
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, values);
    const res = response();
    await dbHealth({ method: 'GET', url: '/api/db-health?probe=auth-client-config' }, res);
    return res.result;
  } finally {
    restoreEnv(original);
  }
}

test('RC3 browser auth config is default-off and exposes no trust anchors or database secrets', async () => {
  const result = await run({ VERCEL_ENV: 'production' });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    ok: true,
    environment: 'production',
    authenticationMode: 'OIDC',
    provider: null,
    clientId: null,
    productionApplicationAccessEnabled: false,
    configured: false,
    tokenPersistence: 'MEMORY_ONLY',
    liveFundsAuthorized: false,
  });
});

test('RC3 Google browser adapter exposes only the public OAuth client ID', async () => {
  const result = await run({
    VERCEL_ENV: 'production',
    PRODUCTION_APPLICATION_ACCESS_ENABLED: 'false',
    OIDC_BROWSER_PROVIDER: 'google',
    OIDC_ISSUER: 'https://accounts.google.com',
    OIDC_AUDIENCE: 'public-client-id.apps.googleusercontent.com',
    OIDC_JWKS_URI: 'https://www.googleapis.com/oauth2/v3/certs',
    DATABASE_URL: 'postgres://private-db.example.test/foodclub',
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.provider, 'google');
  assert.equal(result.body.clientId, 'public-client-id.apps.googleusercontent.com');
  assert.equal(result.body.configured, true);
  assert.equal(result.body.productionApplicationAccessEnabled, false);
  assert.equal(result.body.tokenPersistence, 'MEMORY_ONLY');
  assert.equal(result.body.liveFundsAuthorized, false);

  const serialized = JSON.stringify(result.body);
  assert.equal(serialized.includes('accounts.google.com'), false);
  assert.equal(serialized.includes('googleapis.com'), false);
  assert.equal(serialized.includes('postgres://'), false);
});

test('RC3 unsupported browser providers fail closed', async () => {
  const result = await run({
    VERCEL_ENV: 'production',
    OIDC_BROWSER_PROVIDER: 'untrusted-provider',
    OIDC_AUDIENCE: 'public-client-id.apps.googleusercontent.com',
  });
  assert.equal(result.body.provider, null);
  assert.equal(result.body.clientId, null);
  assert.equal(result.body.configured, false);
});

test('RC3 Preview does not require browser identity configuration', async () => {
  const result = await run({ VERCEL_ENV: 'preview' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.authenticationMode, 'PREVIEW');
  assert.equal(result.body.provider, null);
  assert.equal(result.body.productionApplicationAccessEnabled, false);
  assert.equal(result.body.liveFundsAuthorized, false);
});
