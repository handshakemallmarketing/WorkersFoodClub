import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

const TOKEN_VERSION = 'wfc-preview-v1';
const CLOCK_SKEW_SECONDS = 30;
const MAX_TTL_SECONDS = 15 * 60;

function encode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeEqual(a, b) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(secret, payloadPart) {
  return createHmac('sha256', secret)
    .update(`${TOKEN_VERSION}.${payloadPart}`)
    .digest('base64url');
}

export function verifyPreviewApiToken(req, requiredScope, now = Date.now()) {
  if (process.env.VERCEL_ENV === 'production') {
    return Object.freeze({
      ok: false,
      status: 403,
      error: 'PREVIEW_AUTH_DISABLED_IN_PRODUCTION'
    });
  }

  const secret = process.env.PREVIEW_API_AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    return Object.freeze({
      ok: false,
      status: 503,
      error: 'PREVIEW_AUTH_NOT_CONFIGURED'
    });
  }

  const authorization =
    typeof req.headers?.authorization === 'string'
      ? req.headers.authorization
      : '';

  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
  if (!match) {
    return Object.freeze({
      ok: false,
      status: 401,
      error: 'AUTHENTICATION_REQUIRED'
    });
  }

  const parts = match[1].split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return Object.freeze({
      ok: false,
      status: 401,
      error: 'TOKEN_INVALID'
    });
  }

  const [, payloadPart, suppliedSignature] = parts;
  const expectedSignature = sign(secret, payloadPart);

  if (!safeEqual(suppliedSignature, expectedSignature)) {
    return Object.freeze({
      ok: false,
      status: 401,
      error: 'TOKEN_INVALID'
    });
  }

  let claims;
  try {
    claims = JSON.parse(decode(payloadPart));
  } catch {
    return Object.freeze({
      ok: false,
      status: 401,
      error: 'TOKEN_INVALID'
    });
  }

  const nowSeconds = Math.floor(now / 1000);

  if (
    !claims ||
    typeof claims.sub !== 'string' ||
    typeof claims.actorId !== 'string' ||
    !Array.isArray(claims.scopes) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp)
  ) {
    return Object.freeze({
      ok: false,
      status: 401,
      error: 'TOKEN_CLAIMS_INVALID'
    });
  }

  if (
    claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS ||
    claims.iat > nowSeconds + CLOCK_SKEW_SECONDS
  ) {
    return Object.freeze({
      ok: false,
      status: 401,
      error: 'TOKEN_EXPIRED_OR_NOT_YET_VALID'
    });
  }

  if (
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > MAX_TTL_SECONDS
  ) {
    return Object.freeze({
      ok: false,
      status: 401,
      error: 'TOKEN_TTL_INVALID'
    });
  }

  if (!claims.scopes.includes(requiredScope)) {
    return Object.freeze({
      ok: false,
      status: 403,
      error: 'AUTHORIZATION_SCOPE_REQUIRED'
    });
  }

  return Object.freeze({
    ok: true,
    principal: Object.freeze({
      subject: claims.sub,
      actorId: claims.actorId,
      scopes: Object.freeze([...claims.scopes]),
      issuedAt: claims.iat,
      expiresAt: claims.exp,
    }),
  });
}

export function requirePreviewApiAuth(
  req,
  res,
  requiredScope,
  expectedActorId,
  now = Date.now()
) {
  const result = verifyPreviewApiToken(req, requiredScope, now);

  if (!result.ok) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).json({
      ok: false,
      error: result.error
    });
    return null;
  }

  if (
    expectedActorId !== undefined &&
    result.principal.actorId !== expectedActorId
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).json({
      ok: false,
      error: 'AUTHENTICATED_ACTOR_MISMATCH'
    });
    return null;
  }

  return result.principal;
}

export function mintPreviewApiToken({
  secret,
  subject,
  actorId,
  scopes,
  issuedAt,
  expiresAt,
}) {
  const payload = JSON.stringify({
    sub: subject,
    actorId,
    scopes,
    iat: issuedAt,
    exp: expiresAt,
  });

  const payloadPart = encode(payload);
  return `${TOKEN_VERSION}.${payloadPart}.${sign(secret, payloadPart)}`;
}
