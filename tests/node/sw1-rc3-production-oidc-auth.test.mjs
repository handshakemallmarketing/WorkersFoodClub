import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signData } from 'node:crypto';

import {
  readProductionOidcConfig,
  verifyProductionOidcRequest,
  verifyProductionOidcToken,
} from '../../lib/production-oidc-auth.js';

const NOW = Date.parse('2026-09-12T11:20:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const ISSUER = 'https://id.example.test/';
const AUDIENCE = 'workers-food-club-api';
const JWKS_URI = 'https://id.example.test/.well-known/jwks.json';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'rc3-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';
const JWKS = { keys: [jwk] };

const config = {
  issuer: ISSUER,
  audience: AUDIENCE,
  jwksUri: JWKS_URI,
};

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function token(overrides = {}, headerOverrides = {}) {
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: jwk.kid, ...headerOverrides });
  const payload = encode({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'oidc|member-001',
    exp: NOW_SEC + 300,
    iat: NOW_SEC - 5,
    scope: 'attacker-controlled-scope',
    'https://foodclub.example/actor_id': 'attacker-controlled-actor',
    ...overrides,
  });
  const signature = signData('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function forgeSignature(jwt) {
  const [header, payload, signaturePart] = jwt.split('.');
  const signature = Buffer.from(signaturePart, 'base64url');
  signature[0] ^= 0x01;
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

const resolveJwks = async () => JWKS;

test('RC3 production OIDC config fails closed when incomplete', () => {
  const result = readProductionOidcConfig({
    OIDC_ISSUER: ISSUER,
    OIDC_AUDIENCE: AUDIENCE,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PRODUCTION_AUTH_NOT_CONFIGURED');
});

test('RC3 production OIDC config no longer requires actor or scope claim names', () => {
  const result = readProductionOidcConfig({
    OIDC_ISSUER: ISSUER,
    OIDC_AUDIENCE: AUDIENCE,
    OIDC_JWKS_URI: JWKS_URI,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.config, { issuer: ISSUER, audience: AUDIENCE, jwksUri: JWKS_URI });
});

test('RC3 production OIDC config rejects non-HTTPS trust anchors', () => {
  const result = readProductionOidcConfig({
    OIDC_ISSUER: 'http://id.example.test/',
    OIDC_AUDIENCE: AUDIENCE,
    OIDC_JWKS_URI: JWKS_URI,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PRODUCTION_AUTH_CONFIG_INVALID');
});

test('RC3 production OIDC rejects missing bearer', async () => {
  const result = await verifyProductionOidcToken({ token: null, now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'AUTHENTICATION_REQUIRED');
});

test('RC3 production OIDC rejects malformed JWT', async () => {
  const result = await verifyProductionOidcToken({ token: 'not-a-jwt', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_INVALID');
});

test('RC3 production OIDC rejects unsupported algorithm before claims are trusted', async () => {
  const result = await verifyProductionOidcToken({ token: token({}, { alg: 'HS256' }), now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_ALGORITHM_OR_KEY_INVALID');
});

test('RC3 production OIDC rejects forged signature before issuer/audience/time evaluation', async () => {
  const forged = forgeSignature(token({ iss: 'https://evil.example/', aud: 'wrong-api', exp: NOW_SEC - 60 }));
  const result = await verifyProductionOidcToken({ token: forged, now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_SIGNATURE_INVALID');
});

test('RC3 production OIDC rejects wrong issuer after signature verification', async () => {
  const result = await verifyProductionOidcToken({ token: token({ iss: 'https://evil.example/' }), now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_ISSUER_INVALID');
});

test('RC3 production OIDC rejects wrong audience after signature verification', async () => {
  const result = await verifyProductionOidcToken({ token: token({ aud: 'wrong-api' }), now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_AUDIENCE_INVALID');
});

test('RC3 production OIDC rejects expired token after signature verification', async () => {
  const result = await verifyProductionOidcToken({ token: token({ exp: NOW_SEC - 60 }), now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_EXPIRED_OR_NOT_YET_VALID');
});

test('RC3 production OIDC requires stable subject', async () => {
  const result = await verifyProductionOidcToken({ token: token({ sub: '' }), now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_SUBJECT_INVALID');
});

test('RC3 production OIDC ignores IdP actor and scope claims as application authority', async () => {
  const result = await verifyProductionOidcToken({
    token: token({
      scope: 'operator:everything',
      'https://foodclub.example/actor_id': 'operator:attacker',
    }),
    now: NOW,
    config,
    jwksResolver: resolveJwks,
  });
  assert.equal(result.ok, true);
  assert.equal(result.principal.subject, 'oidc|member-001');
  assert.equal(result.principal.issuer, ISSUER);
  assert.equal(result.principal.expiresAt, NOW_SEC + 300);
  assert.equal('actorId' in result.principal, false);
  assert.equal('scopes' in result.principal, false);
});

test('RC3 production request verifier is disabled outside production', async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    const result = await verifyProductionOidcRequest({ headers: { authorization: `Bearer ${token()}` } }, 'member:orders.read', undefined, { now: NOW, jwksResolver: resolveJwks });
    assert.equal(result.error, 'PRODUCTION_AUTH_DISABLED_OUTSIDE_PRODUCTION');
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
