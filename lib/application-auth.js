import { requirePreviewApiAuth } from './preview-api-auth.js';
import { verifyProductionOidcRequest } from './production-oidc-auth.js';
import { resolveApplicationPrincipal } from './application-principal-binding.js';

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
 * preview actor binding. Production never falls back to Preview HMAC.
 * Production first verifies OIDC identity and provider claims, then resolves
 * the canonical application actor and governed scopes from the server-side
 * application identity binding store. IdP actor/scopes are not authoritative
 * application bindings.
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

  const verified = await verifyProductionOidcRequest(
    req,
    requiredScope,
    undefined,
    options.production || {},
  );
  if (!verified.ok) return sendFailure(res, verified);

  const resolver = options.bindingResolver || resolveApplicationPrincipal;
  const bound = await resolver(
    {
      issuer: verified.principal.issuer,
      subject: verified.principal.subject,
      expiresAt: verified.principal.expiresAt,
    },
    requiredScope,
    options.binding || {},
  );
  if (!bound.ok) return sendFailure(res, bound);
  return bound.principal;
}
