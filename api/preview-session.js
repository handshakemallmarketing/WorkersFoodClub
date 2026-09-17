import { mintPreviewApiToken } from '../lib/preview-api-auth.js';
import {
  OPERATOR_ADMIN_ACTOR_ID,
  OPERATOR_FINANCE_ACTOR_ID,
  OPERATOR_FULFILLMENT_ACTOR_ID,
  OPERATOR_TIER_SCOPES,
} from '../lib/operator-tiers.js';

const PREVIEW_MEMBER_ACTOR_ID = 'preview:member:001';
const TTL_SECONDS = 600;

const MEMBER_SCOPES = [
  'member:purchase.commit',
  'member:payment.execute',
  'member:fulfillment.accept',
  'member:orders.read',
  'member:notifications.read',
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

  const mintOperatorTier = (subject, actorId) => mintPreviewApiToken({
    secret,
    subject,
    actorId,
    scopes: OPERATOR_TIER_SCOPES[actorId],
    issuedAt,
    expiresAt,
  });

  const operatorTokens = {
    fulfillment: mintOperatorTier('preview-operator-fulfillment-session', OPERATOR_FULFILLMENT_ACTOR_ID),
    finance: mintOperatorTier('preview-operator-finance-session', OPERATOR_FINANCE_ACTOR_ID),
    admin: mintOperatorTier('preview-operator-session', OPERATOR_ADMIN_ACTOR_ID),
  };

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    memberToken,
    // Kept for backward compatibility with existing callers: the admin tier holds every
    // operator scope, matching what this field granted before tiers existed.
    operatorToken: operatorTokens.admin,
    operatorTokens,
    expiresAt,
  });
}
