import { normalizeSmsRecipient } from './member-auth-challenge-delivery.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || !emailPattern.test(raw)) throw Object.assign(new Error('EMAIL_INVALID'), { code: 'EMAIL_INVALID' });
  return raw;
}

/** Normalizes the applicant-chosen channel/destination. Throws CHANNEL_INVALID or the
 * relevant *_INVALID code; never reveals whether the destination is already registered. */
export function normalizeEnrollmentContact(channel, destination, env = process.env) {
  const upperChannel = String(channel || '').toUpperCase();
  if (!['EMAIL', 'PHONE'].includes(upperChannel)) {
    throw Object.assign(new Error('CHANNEL_INVALID'), { code: 'CHANNEL_INVALID' });
  }
  if (upperChannel === 'EMAIL') return { channel: 'EMAIL', normalized: normalizeEmail(destination) };
  const normalized = normalizeSmsRecipient(destination, { defaultCountryCode: String(env.MEMBER_PHONE_DEFAULT_COUNTRY_CODE || '233') });
  return { channel: 'PHONE', normalized };
}

/** Best-effort client IP for rate limiting only; never used for identity or authorization. */
export function requestRateLimitKey(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
}
