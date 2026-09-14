import { createHmac } from 'node:crypto';

const FINGERPRINT_LABEL = 'wfc-preview-api-auth-fingerprint-v1';

function fingerprint(secret) {
  return createHmac('sha256', secret)
    .update(FINGERPRINT_LABEL)
    .digest('hex')
    .slice(0, 24);
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  if (process.env.VERCEL_ENV === 'production') {
    return res.status(403).json({ ok: false, error: 'PREVIEW_AUTH_FINGERPRINT_DISABLED_IN_PRODUCTION' });
  }

  const secret = process.env.PREVIEW_API_AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    return res.status(503).json({ ok: false, error: 'PREVIEW_AUTH_NOT_CONFIGURED' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    algorithm: 'HMAC-SHA256',
    label: FINGERPRINT_LABEL,
    fingerprint: fingerprint(secret),
    secretExposed: false,
  });
}
