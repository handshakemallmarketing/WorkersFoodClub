import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';

import { readProductionOidcConfig, verifyProductionOidcToken } from '../../lib/production-oidc-auth.js';
import { productionApplicationAccessEnabled, requireProductionApplicationAccess } from '../../lib/production-access-policy.js';

const issuer = 'https://accounts.google.com';
const audience = 'workers-food-club-production';
const jwksUri = 'https://example.invalid/jwks';
const now = Date.UTC(2026, 8, 14, 20, 0, 0);
const nowSeconds = Math.floor(now / 1000);
const authorizedSha = 'e67bf163db4bf87317766b1c58da84ea076de76f';
const unauthorizedSha = '1d01dfbffc9ee8eb977f925278d384dde2a9c3c0';

function fixture(kid = 'fixture-key') {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  return { privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' }, kid };
}
function jwt({ privateKey, kid, claims, alg = 'RS256' }) {
  const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT', kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}
function claims(overrides = {}) {
  return { iss: issuer, aud: audience, sub: 'fixture-member-subject', iat: nowSeconds - 60, exp: nowSeconds + 3600, ...overrides };
}
const config = { issuer, audience, jwksUri };

test('Production access fails closed unless the switch and exact authorized runtime SHA agree', () => {
  assert.equal(productionApplicationAccessEnabled({}), false);
  assert.equal(productionApplicationAccessEnabled({ PRODUCTION_APPLICATION_ACCESS_ENABLED: 'false' }), false);
  assert.equal(productionApplicationAccessEnabled({ PRODUCTION_APPLICATION_ACCESS_ENABLED: 'TRUE' }), false);
  assert.deepEqual(requireProductionApplicationAccess({}), { ok: false, status: 503, error: 'PRODUCTION_APPLICATION_ACCESS_DISABLED' });

  assert.equal(productionApplicationAccessEnabled({ PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true', VERCEL_ENV: 'preview' }), true);

  const enabledWithoutSha = { PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true', VERCEL_ENV: 'production' };
  assert.equal(productionApplicationAccessEnabled(enabledWithoutSha), false);
  assert.deepEqual(requireProductionApplicationAccess(enabledWithoutSha), {
    ok: false,
    status: 503,
    error: 'PRODUCTION_APPLICATION_ACCESS_SHA_UNVERIFIED',
  });

  const malformedAuthorization = {
    PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
    VERCEL_ENV: 'production',
    PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA: 'main',
    VERCEL_GIT_COMMIT_SHA: authorizedSha,
  };
  assert.equal(productionApplicationAccessEnabled(malformedAuthorization), false);
  assert.equal(requireProductionApplicationAccess(malformedAuthorization).error, 'PRODUCTION_APPLICATION_ACCESS_SHA_UNVERIFIED');

  const mismatchedRelease = {
    PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
    VERCEL_ENV: 'production',
    PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA: authorizedSha,
    VERCEL_GIT_COMMIT_SHA: unauthorizedSha,
  };
  assert.equal(productionApplicationAccessEnabled(mismatchedRelease), false);
  assert.deepEqual(requireProductionApplicationAccess(mismatchedRelease), {
    ok: false,
    status: 503,
    error: 'PRODUCTION_APPLICATION_ACCESS_SHA_UNAUTHORIZED',
  });

  const exactAuthorizedRelease = {
    PRODUCTION_APPLICATION_ACCESS_ENABLED: 'true',
    VERCEL_ENV: 'production',
    PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA: authorizedSha,
    VERCEL_GIT_COMMIT_SHA: authorizedSha,
  };
  assert.equal(productionApplicationAccessEnabled(exactAuthorizedRelease), true);
  assert.deepEqual(requireProductionApplicationAccess(exactAuthorizedRelease), { ok: true });
});

test('Production OIDC configuration remains HTTPS and complete', () => {
  assert.equal(readProductionOidcConfig({}).ok, false);
  assert.equal(readProductionOidcConfig({ OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience, OIDC_JWKS_URI: 'http://example.invalid/jwks' }).ok, false);
  assert.equal(readProductionOidcConfig({ OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience, OIDC_JWKS_URI: jwksUri }).ok, true);
});

test('deterministic signed fixture proves Production OIDC verifier without a human token secret', async () => {
  const key = fixture();
  const result = await verifyProductionOidcToken({ token: jwt({ ...key, claims: claims() }), now, config, jwksResolver: async () => ({ keys: [key.jwk] }) });
  assert.equal(result.ok, true);
  assert.equal(result.principal.subject, 'fixture-member-subject');
  assert.equal(result.principal.issuer, issuer);
});

test('forged signature is rejected', async () => {
  const trusted = fixture('shared-kid');
  const attacker = fixture('shared-kid');
  const result = await verifyProductionOidcToken({ token: jwt({ privateKey: attacker.privateKey, kid: attacker.kid, claims: claims() }), now, config, jwksResolver: async () => ({ keys: [trusted.jwk] }) });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'TOKEN_SIGNATURE_INVALID');
});

test('expired, not-yet-valid, wrong issuer, wrong audience and unsupported algorithm are rejected', async () => {
  const key = fixture();
  const resolver = async () => ({ keys: [key.jwk] });
  for (const [overrides, expected] of [
    [{ exp: nowSeconds - 31 }, 'TOKEN_EXPIRED_OR_NOT_YET_VALID'],
    [{ nbf: nowSeconds + 31 }, 'TOKEN_EXPIRED_OR_NOT_YET_VALID'],
    [{ iss: 'https://evil.example' }, 'TOKEN_ISSUER_INVALID'],
    [{ aud: 'wrong-audience' }, 'TOKEN_AUDIENCE_INVALID'],
  ]) {
    const result = await verifyProductionOidcToken({ token: jwt({ ...key, claims: claims(overrides) }), now, config, jwksResolver: resolver });
    assert.equal(result.ok, false);
    assert.equal(result.error, expected);
  }
  const unsupportedResult = await verifyProductionOidcToken({ token: jwt({ ...key, claims: claims(), alg: 'HS256' }), now, config, jwksResolver: resolver });
  assert.equal(unsupportedResult.ok, false);
  assert.equal(unsupportedResult.error, 'TOKEN_ALGORITHM_OR_KEY_INVALID');
});

test('unknown key id is rejected', async () => {
  const signer = fixture('signer');
  const trusted = fixture('trusted');
  const result = await verifyProductionOidcToken({ token: jwt({ ...signer, claims: claims() }), now, config, jwksResolver: async () => ({ keys: [trusted.jwk] }) });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'TOKEN_KEY_INVALID');
});
