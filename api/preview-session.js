import { mintPreviewApiToken } from '../lib/preview-api-auth.js';

const PREVIEW_MEMBER_ACTOR_ID = 'preview:member:001';
const PREVIEW_OPERATOR_ACTOR_ID = 'preview:operator:001';
const TTL_SECONDS = 600;

const MEMBER_SCOPES = [
  'member:purchase.commit',
  'member:payment.execute',
  'member:fulfillment.accept',
  'member:orders.read',
  'member:notifications.read',
];

const OPERATOR_SCOPES = [
  'operator:fulfillment.manage',
  'operator:refund.authorize',
  'operator:refund.complete',
  'operator:orders.read',
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  if (process.env.VERCEL_ENV === 'production') {
    return res.status(403).json({ ok: false, error: 'PREVIEW_SESSION_DISABLED_IN_PRODUCTION' });
  }

  const secret = process.env.PREVIEW_API_AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    return res.status(503).json({ ok: false, error: 'PREVIEW_AUTH_NOT_CONFIGURED' });
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TTL_SECONDS;

  const memberToken = mintPreviewApiToken({
    secret,
    subject: 'preview-member-session',
    actorId: PREVIEW_MEMBER_ACTOR_ID,
    scopes: MEMBER_SCOPES,
    issuedAt,
    expiresAt,
  });

  const operatorToken = mintPreviewApiToken({
    secret,
    subject: 'preview-operator-session',
    actorId: PREVIEW_OPERATOR_ACTOR_ID,
    scopes: OPERATOR_SCOPES,
    issuedAt,
    expiresAt,
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    memberToken,
    operatorToken,
    expiresAt,
  });
}
