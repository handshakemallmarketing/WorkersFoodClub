import { createPublicKey, verify as verifySignature } from 'node:crypto';

const CLOCK_SKEW_SECONDS = 30;
const JWKS_CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

function b64json(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function bearer(req) {
  const value = typeof req?.headers?.authorization === 'string'
    ? req.headers.authorization
    : '';
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(value);
  return match?.[1] ?? null;
}

function audienceMatches(actual, expected) {
  if (typeof actual === 'string') return actual === expected;
  return Array.isArray(actual) && actual.includes(expected);
}

function fail(status, error) {
  return Object.freeze({ ok: false, status, error });
}

export function readProductionOidcConfig(env = process.env) {
  const issuer = env.OIDC_ISSUER;
  const audience = env.OIDC_AUDIENCE;
  const jwksUri = env.OIDC_JWKS_URI;

  if (![issuer, audience, jwksUri].every((v) => typeof v === 'string' && v.length > 0)) {
    return fail(503, 'PRODUCTION_AUTH_NOT_CONFIGURED');
  }

  let parsedIssuer;
  let parsedJwks;
  try {
    parsedIssuer = new URL(issuer);
    parsedJwks = new URL(jwksUri);
  } catch {
    return fail(503, 'PRODUCTION_AUTH_CONFIG_INVALID');
  }

  if (parsedIssuer.protocol !== 'https:' || parsedJwks.protocol !== 'https:') {
    return fail(503, 'PRODUCTION_AUTH_CONFIG_INVALID');
  }

  return Object.freeze({
    ok: true,
    config: Object.freeze({ issuer, audience, jwksUri }),
  });
}

async function defaultJwksResolver(jwksUri, now = Date.now()) {
  const cached = cache.get(jwksUri);
  if (cached && cached.expiresAt > now) return cached.value;

  const response = await fetch(jwksUri, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error('JWKS_FETCH_FAILED');

  const value = await response.json();
  if (!value || !Array.isArray(value.keys)) throw new Error('JWKS_INVALID');

  cache.set(jwksUri, { value, expiresAt: now + JWKS_CACHE_MS });
  return value;
}

/**
 * Verify external OIDC identity only.
 *
 * Trust ordering is deliberate:
 * 1. Parse only enough untrusted JWT material to select an allowed algorithm/kid.
 * 2. Resolve the configured JWKS key and verify the signature.
 * 3. Only after signature verification, trust issuer/audience/time/subject claims.
 *
 * Application actor identity and authorization scopes are NOT accepted from IdP
 * claims here. They are resolved by the server-side application binding store.
 */
export async function verifyProductionOidcToken({
  token,
  now = Date.now(),
  config,
  jwksResolver = defaultJwksResolver,
}) {
  if (typeof token !== 'string') return fail(401, 'AUTHENTICATION_REQUIRED');

  const parts = token.split('.');
  if (parts.length !== 3) return fail(401, 'TOKEN_INVALID');

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = b64json(headerPart);
  if (!header) return fail(401, 'TOKEN_INVALID');
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0) {
    return fail(401, 'TOKEN_ALGORITHM_OR_KEY_INVALID');
  }

  let jwks;
  try {
    jwks = await jwksResolver(config.jwksUri, now);
  } catch {
    return fail(503, 'PRODUCTION_AUTH_KEY_LOOKUP_FAILED');
  }

  const matches = jwks.keys.filter((key) => key?.kid === header.kid && key?.kty === 'RSA');
  if (matches.length !== 1) return fail(401, 'TOKEN_KEY_INVALID');

  let publicKey;
  try {
    publicKey = createPublicKey({ key: matches[0], format: 'jwk' });
  } catch {
    return fail(401, 'TOKEN_KEY_INVALID');
  }

  const signed = Buffer.from(`${headerPart}.${payloadPart}`, 'utf8');
  let signature;
  try {
    signature = Buffer.from(signaturePart, 'base64url');
  } catch {
    return fail(401, 'TOKEN_INVALID');
  }

  if (!verifySignature('RSA-SHA256', signed, publicKey, signature)) {
    return fail(401, 'TOKEN_SIGNATURE_INVALID');
  }

  const claims = b64json(payloadPart);
  if (!claims) return fail(401, 'TOKEN_INVALID');

  const nowSeconds = Math.floor(now / 1000);
  if (claims.iss !== config.issuer) return fail(401, 'TOKEN_ISSUER_INVALID');
  if (!audienceMatches(claims.aud, config.audience)) return fail(401, 'TOKEN_AUDIENCE_INVALID');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) return fail(401, 'TOKEN_SUBJECT_INVALID');
  if (!Number.isInteger(claims.exp) || claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS) {
    return fail(401, 'TOKEN_EXPIRED_OR_NOT_YET_VALID');
  }
  if (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS)) {
    return fail(401, 'TOKEN_EXPIRED_OR_NOT_YET_VALID');
  }
  if (claims.iat !== undefined && (!Number.isInteger(claims.iat) || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS)) {
    return fail(401, 'TOKEN_EXPIRED_OR_NOT_YET_VALID');
  }

  return Object.freeze({
    ok: true,
    principal: Object.freeze({
      subject: claims.sub,
      issuer: claims.iss,
      expiresAt: claims.exp,
    }),
  });
}

export async function verifyProductionOidcRequest(
  req,
  _requiredScope,
  _expectedActorId,
  options = {},
) {
  if (process.env.VERCEL_ENV !== 'production') {
    return fail(403, 'PRODUCTION_AUTH_DISABLED_OUTSIDE_PRODUCTION');
  }

  const configResult = readProductionOidcConfig(options.env || process.env);
  if (!configResult.ok) return configResult;

  return verifyProductionOidcToken({
    token: bearer(req),
    now: options.now ?? Date.now(),
    config: configResult.config,
    jwksResolver: options.jwksResolver,
  });
}
