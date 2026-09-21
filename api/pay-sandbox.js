import { requireApplicationAuth } from '../lib/application-auth.js';

const PREVIEW_PARTICIPANT_ID = 'preview:member:001';

/**
 * UC-08 payment qualification is ratified as offer-specific through
 * demand_qualification_bps, but the current PostgreSQL write sequence is not
 * transactionally atomic. Keep the mutation unavailable until payment,
 * qualification, command, aggregate-version, and event persistence share one
 * serializable transaction with replay repair and concurrency proof.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  if (process.env.VERCEL_ENV === 'production') {
    return res.status(403).json({
      ok: false,
      error: 'SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION',
    });
  }

  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(403).json({
      ok: false,
      error: 'SANDBOX_PAYMENT_REQUIRES_PREVIEW',
    });
  }

  const principal = await requireApplicationAuth(
    req,
    res,
    'member:payment.execute',
    PREVIEW_PARTICIPANT_ID,
  );
  if (!principal) return;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    ok: false,
    error: 'PREVIEW_PAYMENT_ATOMICITY_NOT_CERTIFIED',
  });
}
