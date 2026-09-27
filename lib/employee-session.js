import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const TOKEN_VERSION = 'wfc-employee-v1';

/**
 * How old a fresh re-authentication's own token may be when presented to mint
 * an employee session. This is the "verify again" step: a token minted from
 * the member session hours ago must not be reusable to silently step up.
 * A small negative allowance absorbs clock skew between this server and the
 * issuer, mirroring the skew tolerance already used for ordinary verification.
 */
export const FRESH_STEP_UP_MAX_AGE_SECONDS = 90;
export const FRESH_STEP_UP_CLOCK_SKEW_SECONDS = 30;

export const EMPLOYEE_SESSION_TTL_SECONDS = 20 * 60;

function sign(secret, sessionId) {
  return createHmac('sha256', secret).update(`${TOKEN_VERSION}.${sessionId}`).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function generateSessionId() {
  return randomUUID();
}

export function signEmployeeSessionToken(secret, sessionId) {
  return `${TOKEN_VERSION}.${sessionId}.${sign(secret, sessionId)}`;
}

/**
 * Signature-only check: confirms the token was minted by this server and
 * extracts the session id it references. Never sufficient on its own --
 * the caller must still look up that session id and confirm it is
 * unexpired and unrevoked. A signed reference is not a self-contained
 * credential; it only resists forgery and enumeration of session ids.
 */
export function verifyEmployeeSessionTokenShape(secret, token) {
  if (typeof secret !== 'string' || secret.length < 32) return null;
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const [, sessionId, suppliedSignature] = parts;
  if (!sessionId || !suppliedSignature) return null;
  const expected = sign(secret, sessionId);
  if (!safeEqual(suppliedSignature, expected)) return null;
  return sessionId;
}

export function extractEmployeeSessionToken(req) {
  const value = req?.headers?.['x-employee-session'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * True only for a Google ID token issued essentially right now -- the actual
 * "verify again" enforcement. A token that was merely still unexpired (Google
 * ID tokens live ~1 hour) does not prove the person re-authenticated just now.
 */
export function isFreshStepUp(tokenIssuedAtSeconds, nowMs = Date.now()) {
  if (!Number.isInteger(tokenIssuedAtSeconds)) return false;
  const ageSeconds = Math.floor(nowMs / 1000) - tokenIssuedAtSeconds;
  return ageSeconds >= -FRESH_STEP_UP_CLOCK_SKEW_SECONDS && ageSeconds <= FRESH_STEP_UP_MAX_AGE_SECONDS;
}
