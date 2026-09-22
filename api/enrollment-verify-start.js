import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { createMemberChallengeDelivery } from '../lib/member-auth-challenge-delivery.js';
import { normalizeEnrollmentContact, requestRateLimitKey } from '../lib/enrollment-verification.js';

const sha = v => createHash('sha256').update(String(v)).digest('hex');
const clean = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
function access(env) { if ((env.VERCEL_ENV || 'unknown') === 'preview') return { ok: true }; return requireProductionApplicationAccess(env); }
function challengeCode(env, options) {
  if (options.code !== undefined) return String(options.code);
  const preview = (env.VERCEL_ENV || '') === 'preview', expose = env.MEMBER_AUTH_PREVIEW_EXPOSE_CODE === 'true', fixed = String(env.MEMBER_AUTH_PREVIEW_FIXED_OTP || '').trim();
  if (preview && expose && /^\d{6}$/.test(fixed)) return fixed;
  return String(randomInt(100000, 1000000));
}

/** Uniform generic response regardless of new/resumed/already-a-member outcome (anti-enumeration). */
function genericSent(res, extra = {}) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, message: 'If these details are eligible for enrollment, a verification code has been sent.', ...extra });
}

export default async function handler(req, res, options = {}) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' }); }
  const env = options.env || process.env, a = access(env);
  if (!a.ok) return res.status(a.status).json({ ok: false, error: a.error });

  const fullName = clean(req.body?.fullName, 200);
  const governmentEmployer = clean(req.body?.governmentEmployer, 240);
  const channel = String(req.body?.channel || 'PHONE').toUpperCase();
  const campaignToken = clean(req.body?.campaignToken, 200);
  if (!fullName) return res.status(400).json({ ok: false, error: 'FULL_NAME_REQUIRED' });
  if (channel !== 'PHONE') return res.status(409).json({ ok: false, error: 'VERIFICATION_CHANNEL_UNAVAILABLE' });

  const destination = req.body?.destination ?? (channel === 'PHONE' ? req.body?.phone : req.body?.email);
  let contact;
  try { contact = normalizeEnrollmentContact(channel, destination, env); }
  catch (e) { return res.status(400).json({ ok: false, error: String(e?.code || 'CONTACT_INVALID') }); }

  const connectionString = options.databaseUrl || env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) { const { neon } = await import('@neondatabase/serverless'); sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(5000) } }); }
    const now = options.now ?? Date.now(), nowIso = new Date(now).toISOString();

    // Multi-level rate limiting: fail closed silently (uniform response either way).
    const ip = requestRateLimitKey(req);
    const ipLimit = await sql`SELECT allowed FROM record_rate_limit_event(${`rl:${randomUUID()}`},'ENROLLMENT_START_IP',${ip},3600,30,${nowIso})`;
    const destLimit = await sql`SELECT allowed FROM record_rate_limit_event(${`rl:${randomUUID()}`},'VERIFICATION_SEND_PHONE',${contact.normalized},900,5,${nowIso})`;
    const rateLimited = ipLimit[0]?.allowed !== true || destLimit[0]?.allowed !== true;

    let campaignId = null;
    if (campaignToken) {
      const campaigns = await sql`SELECT campaign_id FROM enrollment_campaign WHERE campaign_token=${campaignToken} AND active LIMIT 1`;
      if (campaigns.length !== 1) return res.status(400).json({ ok: false, error: 'CAMPAIGN_TOKEN_INVALID' });
      campaignId = String(campaigns[0].campaign_id);
    }
    if (!governmentEmployer && !campaignId) return res.status(400).json({ ok: false, error: 'GOVERNMENT_EMPLOYER_REQUIRED' });

    if (rateLimited) return genericSent(res);

    const applicationId = `application:${randomUUID()}`;
    let resolved;
    try {
      resolved = await sql`SELECT route,application_id,membership_id FROM resolve_enrollment_contact(${applicationId},${fullName},${governmentEmployer},${campaignId},${contact.channel},${contact.normalized},${nowIso})`;
    } catch (resolveError) {
      const code = String(resolveError?.message || '').includes('ENROLLMENT_CAMPAIGN_CLOSED') ? 'ENROLLMENT_CAMPAIGN_CLOSED'
        : String(resolveError?.message || '').includes('ENROLLMENT_CAMPAIGN_FULL') ? 'ENROLLMENT_CAMPAIGN_FULL' : null;
      if (code) return res.status(409).json({ ok: false, error: code });
      throw resolveError;
    }
    if (resolved.length !== 1) return genericSent(res);
    const { route, application_id: resolvedApplicationId, membership_id: resolvedMembershipId } = resolved[0];

    const code = challengeCode(env, options);
    const codeHash = sha(code);
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    let challengeId, created;

    if (route === 'EXISTING_MEMBER') {
      challengeId = `challenge:${randomBytes(16).toString('hex')}`;
      created = await sql`SELECT challenge_id FROM create_member_auth_challenge(${challengeId},${String(resolvedMembershipId)},${contact.channel},${sha(contact.normalized)},${codeHash},${expiresAt})`;
    } else {
      challengeId = `enrollment-challenge:${randomBytes(16).toString('hex')}`;
      created = await sql`SELECT challenge_id FROM create_enrollment_verification_challenge(${challengeId},${String(resolvedApplicationId)},${contact.channel},${sha(contact.normalized)},${codeHash},${expiresAt})`;
    }
    if (created.length !== 1) return genericSent(res);

    const previewExpose = (env.VERCEL_ENV || '') === 'preview' && env.MEMBER_AUTH_PREVIEW_EXPOSE_CODE === 'true';
    try {
      const deliver = options.deliverChallenge || (previewExpose ? null : createMemberChallengeDelivery({ sql, env, fetchImpl: options.fetchImpl || fetch }));
      if (deliver) await deliver({ channel: contact.channel, destination: contact.normalized, code });
      else if (!previewExpose) throw Object.assign(new Error('CHALLENGE_DELIVERY_NOT_CONFIGURED'), { code: 'CHALLENGE_DELIVERY_NOT_CONFIGURED' });
    } catch (deliveryError) {
      console.error('Enrollment verification delivery failed', { route, code: deliveryError?.code, message: deliveryError?.message });
      return genericSent(res);
    }
    return genericSent(res, { challengeId, expiresAt, ...(previewExpose ? { previewCode: code } : {}) });
  } catch (error) {
    console.error('Enrollment verification start failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'ENROLLMENT_VERIFY_START_FAILED' });
  }
}
