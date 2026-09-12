import { requirePreviewApiAuth } from './preview-api-auth.js';
import { verifyProductionOidcRequest } from './production-oidc-auth.js';

function sendFailure(res, result) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(result.status).json({
    ok: false,
    error: result.error,
  });
  return null;
}

/**
 * Environment-aware application authentication boundary.
 *
 * Preview/non-production keeps the RC2 HMAC verifier and its explicit
 * preview actor binding. Production never falls back to Preview HMAC and
 * never treats the previewExpectedActorId as a production actor binding.
 * The production actor is resolved only from the verified OIDC token's
 * configured application actor claim.
 */
export async function requireApplicationAuth(
  req,
  res,
  requiredScope,
  previewExpectedActorId,
  options = {},
) {
  if (process.env.VERCEL_ENV !== 'production') {
    return requirePreviewApiAuth(
      req,
      res,
      requiredScope,
      previewExpectedActorId,
      options.now ?? Date.now(),
    );
  }

  const result = await verifyProductionOidcRequest(
    req,
    requiredScope,
    options.productionExpectedActorId,
    options.production || {},
  );

  if (!result.ok) return sendFailure(res, result);
  return result.principal;
}
