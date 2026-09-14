import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import { requireApplicationAuth } from '../../lib/application-auth.js';

const NOW = Date.parse('2026-09-12T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const ISSUER = 'https://planted-identity-secret.example.test/';
const AUDIENCE = 'planted-workers-food-club-api';
const JWKS_URI = 'https://planted-jwks-secret.example.test/keys.json';
const SUBJECT = 'oidc|PLANTED_SUBJECT_SECRET_9911';
const BINDING = 'binding:PLANTED_BINDING_SECRET_8822';
const TOKEN_MARKER = 'PLANTED_TOKEN_SECRET_7733';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'rc3-log-hygiene-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function token(overrides = {}) {
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: jwk.kid });
  const payload = encode({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: SUBJECT,
    exp: NOW_SEC + 300,
    iat: NOW_SEC - 5,
    marker: TOKEN_MARKER,
    ...overrides,
  });
  const signature = signData('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function forge(jwt) {
  const [header, payload, signaturePart] = jwt.split('.');
  const signature = Buffer.from(signaturePart, 'base64url');
  signature[0] ^= 0x01;
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

function response() {
  const result = { statusCode: null, body: null, headers: {} };
  return {
    result,
    setHeader(name, value) { result.headers[String(name).toLowerCase()] = value; return this; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

function request(jwt) {
  return { headers: jwt ? { authorization: `Bearer ${jwt}` } : {} };
}

async function captureConsole(run) {
  const records = [];
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const capture = (...args) => records.push(args.map((v) => {
    try { return typeof v === 'string' ? v : JSON.stringify(v); }
    catch { return String(v); }
  }).join(' '));
  console.log = capture;
  console.info = capture;
  console.warn = capture;
  console.error = capture;
  try {
    await run();
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  }
  return records.join('\n');
}

const production = {
  now: NOW,
  env: {
    OIDC_ISSUER: ISSUER,
    OIDC_AUDIENCE: AUDIENCE,
    OIDC_JWKS_URI: JWKS_URI,
  },
  jwksResolver: async () => ({ keys: [jwk] }),
};

const SENSITIVE = [ISSUER, AUDIENCE, JWKS_URI, SUBJECT, BINDING, TOKEN_MARKER];

function assertNoSensitiveLog(logText, jwt) {
  assert.equal(logText.includes(jwt), false, 'full bearer token must never be logged');
  for (const marker of SENSITIVE) {
    assert.equal(logText.includes(marker), false, `sensitive marker leaked to logs: ${marker}`);
  }
}

test('RC3 production auth failures do not log bearer or identity configuration', async () => {
  const previousEnv = process.env.VERCEL_ENV;
  const previousSwitch = process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED;
  process.env.VERCEL_ENV = 'production';
  process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = 'true';
  try {
    const good = token();
    const cases = [
      { jwt: null, bindingResolver: undefined },
      { jwt: 'not-a-jwt', bindingResolver: undefined },
      { jwt: forge(good), bindingResolver: undefined },
      {
        jwt: good,
        bindingResolver: async () => ({ ok: false, status: 403, error: 'APPLICATION_IDENTITY_NOT_BOUND' }),
      },
      {
        jwt: good,
        bindingResolver: async () => ({ ok: false, status: 403, error: 'APPLICATION_IDENTITY_DISABLED', bindingId: BINDING }),
      },
    ];

    for (const item of cases) {
      const res = response();
      const logs = await captureConsole(async () => {
        await requireApplicationAuth(
          request(item.jwt),
          res,
          'member:orders.read',
          'preview:member:001',
          { production, bindingResolver: item.bindingResolver },
        );
      });
      assertNoSensitiveLog(logs, item.jwt || 'Bearer-missing-sentinel');
      assert.ok(res.result.statusCode >= 400);
    }
  } finally {
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousSwitch === undefined) delete process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED;
    else process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = previousSwitch;
  }
});

test('RC3 successful production identity binding does not log subject or binding identifiers', async () => {
  const previousEnv = process.env.VERCEL_ENV;
  const previousSwitch = process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED;
  process.env.VERCEL_ENV = 'production';
  process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = 'true';
  try {
    const jwt = token();
    const res = response();
    let principal;
    const logs = await captureConsole(async () => {
      principal = await requireApplicationAuth(
        request(jwt),
        res,
        'member:orders.read',
        'preview:member:001',
        {
          production,
          bindingResolver: async (identity, requiredScope) => ({
            ok: true,
            principal: {
              issuer: identity.issuer,
              subject: identity.subject,
              actorId: 'member:canonical-log-test',
              scopes: [requiredScope],
              bindingId: BINDING,
              expiresAt: identity.expiresAt,
            },
          }),
        },
      );
    });
    assert.equal(principal?.actorId, 'member:canonical-log-test');
    assertNoSensitiveLog(logs, jwt);
  } finally {
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousSwitch === undefined) delete process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED;
    else process.env.PRODUCTION_APPLICATION_ACCESS_ENABLED = previousSwitch;
  }
});
