import { randomUUID } from 'node:crypto';
import { executePaystackRehearsal } from '../dist/packages/paystack-rehearsal/src/index.js';
import { PaystackWebhookVerifier } from '../dist/packages/pilot-payments/src/paystack.js';

const ACTIONS = new Set(['initiate', 'verify', 'refund', 'refund-status']);
const REFERENCE_RE = /^wfc-rc2-[A-Za-z0-9-]{8,80}$/;
const REFUND_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_BODY_BYTES = 1024 * 1024;

export const config = {
  api: {
    bodyParser: false,
  },
};

function fail(res, status, error) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ ok: false, error });
}

async function readRawBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > MAX_BODY_BYTES) {
      const error = new Error('REQUEST_BODY_TOO_LARGE');
      error.code = 'REQUEST_BODY_TOO_LARGE';
      throw error;
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(rawBody) {
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    const error = new Error('REQUEST_BODY_INVALID');
    error.code = 'REQUEST_BODY_INVALID';
    throw error;
  }
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

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    if (error?.code === 'REQUEST_BODY_TOO_LARGE') {
      return fail(res, 413, 'REQUEST_BODY_TOO_LARGE');
    }
    return fail(res, 400, 'REQUEST_BODY_INVALID');
  }

  /*
   * Real Paystack webhook boundary.
   *
   * IMPORTANT:
   * Verification occurs against the exact raw request body before JSON
   * semantics are trusted. Do not JSON.stringify() a parsed object here.
   */
  const signatureHeader = req.headers['x-paystack-signature'];
  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;

  if (typeof signature === 'string' && signature.length > 0) {
    try {
      const verifier = new PaystackWebhookVerifier(secretKey);
      const verified = verifier.verify({ rawBody, signature });

      res.setHeader('Cache-Control', 'no-store');

      return res.status(200).json({
        ok: true,
        webhook: {
          provider: 'PAYSTACK',
          providerReference: verified.providerReference,
          rawStatus: verified.rawStatus,
          status: verified.status,
          statusMappingVersion: verified.statusMappingVersion,
          amount: {
            minor: verified.amount.minor.toString(),
            currency: verified.amount.currency,
          },
          occurredAt: verified.occurredAt,
          authenticity: 'HMAC_SHA512_VERIFIED',
        },
      });
    } catch (error) {
      console.warn('Paystack webhook rejected', {
        name: error?.name,
        message: error?.message,
      });

      if (error?.message === 'PAYMENT_WEBHOOK_SIGNATURE_INVALID') {
        return fail(res, 401, 'PAYSTACK_WEBHOOK_SIGNATURE_INVALID');
      }

      if (error?.message === 'PAYSTACK_WEBHOOK_EVENT_NOT_SUPPORTED') {
        return fail(res, 400, 'PAYSTACK_WEBHOOK_EVENT_NOT_SUPPORTED');
      }

      return fail(res, 400, 'PAYSTACK_WEBHOOK_INVALID');
    }
  }

  /*
   * Existing RC2 provider-rehearsal control path.
   * Body parsing is now explicit because automatic Vercel parsing is disabled.
   */
  let body;
  try {
    body = parseJson(rawBody);
  } catch {
    return fail(res, 400, 'REQUEST_BODY_INVALID');
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!ACTIONS.has(action)) {
    return fail(res, 400, 'PAYSTACK_REHEARSAL_ACTION_INVALID');
  }

  const input = { action };

  if (action === 'initiate') {
    input.reference = `wfc-rc2-${randomUUID()}`;
  } else if (action === 'verify' || action === 'refund') {
    const reference = typeof body.reference === 'string' ? body.reference : '';
    if (!REFERENCE_RE.test(reference)) {
      return fail(res, 400, 'PAYSTACK_REHEARSAL_REFERENCE_INVALID');
    }
    input.reference = reference;
  } else if (action === 'refund-status') {
    const refundId = typeof body.refundId === 'string' ? body.refundId : '';
    if (!REFUND_ID_RE.test(refundId)) {
      return fail(res, 400, 'PAYSTACK_REHEARSAL_REFUND_ID_INVALID');
    }
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
