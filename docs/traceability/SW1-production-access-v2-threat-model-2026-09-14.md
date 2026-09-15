# Production Access v2 threat model

The redesign removes an availability hazard without converting availability into an authentication bypass.

## Threats and controls

**Expired/stale human canary token blocks recovery.** Removed: deployment/recovery has no end-user bearer-token dependency.

**Persistent access switch accidentally resets on later deployment.** Controlled: `true` is project-level Production configuration and recovery builds only after independently pulling/re-reading it.

**Access switch accidentally enables anonymous access.** Controlled: switch gates application availability only; protected routes still execute OIDC authentication. Canonical smoke proof requires unauthenticated 401, never 200.

**Forged identity accepted because CI no longer calls Google with a human token.** Controlled: deterministic RSA fixtures exercise the same Production verifier implementation for valid signatures, forged signatures, unknown keys, expiration, issuer, audience, and algorithm rejection. Runtime authentication continues against configured Google JWKS.

**IdP claims grant application authority.** Not changed: application principal binding/authority remains server-owned and separate from OIDC identity verification.

**Recovery broadens economic authority.** Prohibited: authorization evidence must explicitly withhold live funds, Paystack live, live credentials, and payment/fulfillment mutation authority.

**Recovery deploy fails after persistent ON is written.** Controlled: any post-deploy proof failure forces project-level OFF, redeploys, and re-proves canonical 503.

**Recovery workflow itself is unavailable.** Independent containment workflow remains capable of forcing OFF without member/operator identity tokens.

## Residual runtime proof

A real interactive Google login remains appropriate for periodic end-to-end IdP integration proof and user acceptance, but it is not a durable infrastructure credential and is not a prerequisite for every Production deployment.
