import { randomUUID } from 'node:crypto';
import { executePaystackRehearsal } from '../dist/packages/paystack-rehearsal/src/index.js';

const ACTIONS = new Set(['initiate', 'verify', 'refund', 'refund-status']);
const REFERENCE_RE = /^wfc-rc2-[A-Za-z0-9-]{8,80}$/;
const REFUND_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function fail(res, status, error) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ ok: false, error });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'METHOD_NOT_ALLOWED');
  }

  if (process.env.VERCEL_ENV !== 'preview') {
    return fail(res, 403, 'PAYSTACK_REHEARSAL_PREVIEW_ONLY');
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith('sk_test_')) {
    return fail(res, 503, 'PAYSTACK_TEST_SECRET_NOT_CONFIGURED');
  }

  const action = typeof req.body?.action === 'string' ? req.body.action : '';
  if (!ACTIONS.has(action)) return fail(res, 400, 'PAYSTACK_REHEARSAL_ACTION_INVALID');

  const input = { action };
  if (action === 'initiate') {
    input.reference = `wfc-rc2-${randomUUID()}`;
  } else if (action === 'verify' || action === 'refund') {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference : '';
    if (!REFERENCE_RE.test(reference)) return fail(res, 400, 'PAYSTACK_REHEARSAL_REFERENCE_INVALID');
    input.reference = reference;
  } else if (action === 'refund-status') {
    const refundId = typeof req.body?.refundId === 'string' ? req.body.refundId : '';
    if (!REFUND_ID_RE.test(refundId)) return fail(res, 400, 'PAYSTACK_REHEARSAL_REFUND_ID_INVALID');
    input.refundId = refundId;
  }

  try {
    const result = await executePaystackRehearsal(
      { vercelEnv: process.env.VERCEL_ENV, secretKey },
      input
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, rehearsal: result });
  } catch (error) {
    console.error('Paystack rehearsal failed', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      action,
    });
    return fail(res, 502, 'PAYSTACK_REHEARSAL_PROVIDER_FAILURE');
  }
}
