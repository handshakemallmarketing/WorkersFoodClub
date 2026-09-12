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
const ACTOR_CLAIM = 'https://foodclub.example/actor_id';
const SCOPE_CLAIM = 'scope';

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
  actorClaim: ACTOR_CLAIM,
  scopeClaim: SCOPE_CLAIM,
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
    scope: 'member:orders.read',
    [ACTOR_CLAIM]: 'member:001',
    ...overrides,
  });
  const signature = signData('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
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

test('RC3 production OIDC config rejects non-HTTPS trust anchors', () => {
  const result = readProductionOidcConfig({
    OIDC_ISSUER: 'http://id.example.test/',
    OIDC_AUDIENCE: AUDIENCE,
    OIDC_JWKS_URI: JWKS_URI,
    OIDC_ACTOR_CLAIM: ACTOR_CLAIM,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PRODUCTION_AUTH_CONFIG_INVALID');
});

test('RC3 production OIDC rejects missing bearer', async () => {
  const result = await verifyProductionOidcToken({ token: null, requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'AUTHENTICATION_REQUIRED');
});

test('RC3 production OIDC rejects malformed JWT', async () => {
  const result = await verifyProductionOidcToken({ token: 'not-a-jwt', requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_INVALID');
});

test('RC3 production OIDC rejects wrong issuer', async () => {
  const result = await verifyProductionOidcToken({ token: token({ iss: 'https://evil.example/' }), requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_ISSUER_INVALID');
});

test('RC3 production OIDC rejects wrong audience', async () => {
  const result = await verifyProductionOidcToken({ token: token({ aud: 'wrong-api' }), requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_AUDIENCE_INVALID');
});

test('RC3 production OIDC rejects expired token', async () => {
  const result = await verifyProductionOidcToken({ token: token({ exp: NOW_SEC - 60 }), requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_EXPIRED_OR_NOT_YET_VALID');
});

test('RC3 production OIDC rejects unsupported algorithm', async () => {
  const result = await verifyProductionOidcToken({ token: token({}, { alg: 'HS256' }), requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_ALGORITHM_OR_KEY_INVALID');
});

test('RC3 production OIDC rejects forged signature', async () => {
  const valid = token();
  const forged = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;
  const result = await verifyProductionOidcToken({ token: forged, requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'TOKEN_SIGNATURE_INVALID');
});

test('RC3 production OIDC rejects valid subject without application actor binding', async () => {
  const result = await verifyProductionOidcToken({ token: token({ [ACTOR_CLAIM]: undefined }), requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'APPLICATION_ACTOR_BINDING_REQUIRED');
});

test('RC3 production OIDC rejects wrong scope', async () => {
  const result = await verifyProductionOidcToken({ token: token({ scope: 'member:offers.read' }), requiredScope: 'member:orders.read', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'AUTHORIZATION_SCOPE_REQUIRED');
});

test('RC3 production OIDC rejects authenticated actor substitution', async () => {
  const result = await verifyProductionOidcToken({ token: token({ [ACTOR_CLAIM]: 'member:other' }), requiredScope: 'member:orders.read', expectedActorId: 'member:001', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.error, 'AUTHENTICATED_ACTOR_MISMATCH');
});

test('RC3 production OIDC accepts valid bounded principal', async () => {
  const result = await verifyProductionOidcToken({ token: token(), requiredScope: 'member:orders.read', expectedActorId: 'member:001', now: NOW, config, jwksResolver: resolveJwks });
  assert.equal(result.ok, true);
  assert.equal(result.principal.subject, 'oidc|member-001');
  assert.equal(result.principal.actorId, 'member:001');
  assert.deepEqual(result.principal.scopes, ['member:orders.read']);
});

test('RC3 production request verifier is disabled outside production', async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    const result = await verifyProductionOidcRequest({ headers: { authorization: `Bearer ${token()}` } }, 'member:orders.read', 'member:001', { now: NOW, jwksResolver: resolveJwks });
    assert.equal(result.error, 'PRODUCTION_AUTH_DISABLED_OUTSIDE_PRODUCTION');
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
