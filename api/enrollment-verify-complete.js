import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { requireProductionApplicationAccess } from '../lib/production-access-policy.js';
import { ensureAnnualMembershipInvoice } from '../lib/membership-annual-invoice.js';

const sha = v => createHash('sha256').update(String(v)).digest('hex');
const newPrimaryMemberId = () => String(randomInt(100000000000,1000000000000));
function access(env) { if ((env.VERCEL_ENV || 'unknown') === 'preview') return { ok: true }; return requireProductionApplicationAccess(env); }

/** Handles both a new/resumed enrollment verification (`enrollment-challenge:` prefix,
 * provisions membership on first success) and an already-numbered member's sign-in
 * challenge (`challenge:` prefix, delegates to the same function member-auth-verify.js
 * uses) behind one endpoint, so the client never learns which case it was in. */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' }); }
  const env = options.env || process.env, a = access(env);
  if (!a.ok) return res.status(a.status).json({ ok: false, error: a.error });

  const challengeId = String(req.body?.challengeId || ''), code = String(req.body?.code || '').trim();
  if (!challengeId || !/^[0-9]{6}$/.test(code)) return res.status(400).json({ ok: false, error: 'CHALLENGE_AND_CODE_REQUIRED' });

  try {
    let sql = options.sql;
    if (!sql) { if (!env.DATABASE_URL) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' }); const { neon } = await import('@neondatabase/serverless'); sql = neon(env.DATABASE_URL, { fetchOptions: { signal: AbortSignal.timeout(4000) } }); }
    const now = new Date(Number(options.now ?? Date.now())).toISOString();
    const sessionToken = `wfc_${randomBytes(32).toString('base64url')}`, sessionId = `member-session:${sha(sessionToken)}`;
    const sessionExpiresAt = new Date(Number(options.now ?? Date.now()) + 12 * 60 * 60 * 1000).toISOString();
    const codeHash = sha(code);

    if (challengeId.startsWith('enrollment-challenge:')) {
      const participantId = `participant:${randomUUID()}`, membershipId = `membership:${randomUUID()}`;
      const publicMemberId = options.newPrimaryMemberId ? String(options.newPrimaryMemberId()) : newPrimaryMemberId();
      const rows = await sql`SELECT * FROM verify_and_provision_enrollment(${challengeId},${codeHash},${now},${participantId},${membershipId},${publicMemberId},${sessionId},${sessionExpiresAt})`;
      if (rows.length !== 1) return res.status(401).json({ ok: false, error: 'CHALLENGE_INVALID' });
      const r = rows[0];
      if (r.challenge_state !== 'USED') {
        return res.status(Number(r.challenge_attempts) >= 5 || r.challenge_state === 'REVOKED' ? 429 : 401)
          .json({ ok: false, error: Number(r.challenge_attempts) >= 5 || r.challenge_state === 'REVOKED' ? 'CHALLENGE_LOCKED' : 'CHALLENGE_INVALID' });
      }
      res.setHeader('Cache-Control', 'no-store');
      const membershipIdStr = String(r.membership_id), publicMemberIdStr = String(r.public_member_id);
      const base = { ok: true, sessionToken, expiresAt: sessionExpiresAt, accessState: 'MEMBERSHIP_PAYMENT_REQUIRED', publicMemberId: publicMemberIdStr, membershipId: membershipIdStr, idempotent: r.idempotent === true || String(r.idempotent) === 'true' };
      try {
        const invoice = await ensureAnnualMembershipInvoice({ sql, membershipId: membershipIdStr, publicMemberId: publicMemberIdStr, now: options.now ?? Date.now(), env, amountMinor: options.annualFeeMinor });
        return res.status(200).json({ ...base, subscriptionInvoicePending: false, invoiceId: invoice.invoiceId, invoiceState: invoice.state, invoiceAmountMinor: invoice.amountMinor, invoiceCurrency: invoice.currency, dueAt: invoice.dueAt });
      } catch (invoiceError) {
        const billingError = String(invoiceError?.code || 'ANNUAL_SUBSCRIPTION_INVOICE_FAILED').replace(/[^A-Z0-9_]/gi, '_').slice(0, 80);
        console.error('Enrollment verified but annual invoice pending', { membershipId: membershipIdStr, publicMemberId: publicMemberIdStr, code: invoiceError?.code, message: invoiceError?.message });
        return res.status(200).json({ ...base, subscriptionInvoicePending: true, billingStatus: 'PENDING_RETRY', billingError });
      }
    }

    // Existing-member challenge: identical semantics to api/member-auth-verify.js.
    const rows = await sql`SELECT * FROM verify_member_auth_challenge(${challengeId},${codeHash},${now},${sessionId},${sessionExpiresAt})`;
    if (rows.length !== 1) return res.status(401).json({ ok: false, error: 'CHALLENGE_INVALID' });
    const r = rows[0];
    if (String(r.code_hash) !== codeHash) {
      return res.status(Number(r.attempts) >= 5 || String(r.state) === 'REVOKED' ? 429 : 401)
        .json({ ok: false, error: Number(r.attempts) >= 5 || String(r.state) === 'REVOKED' ? 'CHALLENGE_LOCKED' : 'CHALLENGE_INVALID' });
    }
    const membershipState = String(r.membership_state), standing = String(r.standing);
    const preSettlement = membershipState === 'INACTIVE' && standing === 'INITIAL_FEE_DUE';
    const normalMember = membershipState === 'ACTIVE' && ['ACTIVE', 'GRACE'].includes(standing);
    if (!preSettlement && !normalMember) return res.status(403).json({ ok: false, error: 'MEMBERSHIP_NOT_AUTHENTICATABLE' });
    if (String(r.session_id) !== sessionId) throw Object.assign(new Error('MEMBER_SESSION_NOT_CREATED'), { code: 'MEMBER_SESSION_NOT_CREATED' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, sessionToken, expiresAt: sessionExpiresAt, accessState: preSettlement ? 'MEMBERSHIP_PAYMENT_REQUIRED' : 'MEMBER_AUTHENTICATED' });
  } catch (error) {
    console.error('Enrollment verify complete failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'ENROLLMENT_VERIFY_COMPLETE_FAILED' });
  }
}
