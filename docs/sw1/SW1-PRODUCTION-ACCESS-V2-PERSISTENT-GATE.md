# SW1 — Production Access v2 Persistent Gate

Status: IMPLEMENTATION_IN_PROGRESS

## Purpose

Remove short-lived human Google ID tokens from deployment and recovery control without weakening Production request authentication or application authorization.

## Invariants

1. Production request authentication remains Google OIDC RS256/JWKS verification with configured issuer, audience, time validity, and subject checks.
2. Application actor identity and scopes remain server-side binding/authority decisions; IdP claims do not grant application authority.
3. `PRODUCTION_APPLICATION_ACCESS_ENABLED` is durable Production configuration. Once governed authorization is active, ordinary Production deployments inherit the authorized value rather than resetting it.
4. CI/deployment must not depend on reusable or manually refreshed end-user Google ID tokens.
5. Deterministic cryptographic fixtures may prove verifier behavior in CI, but may not substitute for application binding/authority checks or create Production identities.
6. Runtime smoke proof must establish enabled boundary behavior without privileged human bearer-token secrets: unauthenticated protected route returns 401 rather than 503; build identity is observable; Production mutation routes remain disabled by policy.
7. A separate emergency containment path must persist `PRODUCTION_APPLICATION_ACCESS_ENABLED=false`, redeploy fail-closed, and prove canonical 503.
8. Restoring `true` requires the existing bounded governed Production-application-access authorization to be active and unrevoked. It does not authorize payment mutation.
9. Paystack live mode, live funds, live credentials, and live provider transactions remain unauthorized.

## Gate separation

Deployment authorization is infrastructure governance. Google ID tokens are user-session credentials. They MUST NOT be used as durable deployment authorization artifacts.

The Production gate therefore has three independent layers:

- **Governed configuration:** durable authorization evidence controls whether Production application access may be enabled.
- **Runtime authentication:** each request is independently authenticated by OIDC/JWKS and resolved through application-owned bindings.
- **Containment:** an independent kill switch can force Production application access OFF without changing OIDC or payment configuration.

## Required proof before recovery

- constitutional/conformance CI green on the implementation head;
- deterministic OIDC verifier tests cover valid, forged, expired, wrong issuer, wrong audience, and wrong subject/key cases;
- application principal-binding/authority tests remain green;
- no workflow dependency on `RC3_PRODUCTION_MEMBER_TOKEN` or `RC3_PRODUCTION_OPERATOR_TOKEN` for Production deployment/recovery;
- governed authorization evidence is checked before persisting `true`;
- canonical Production route proves 401 unauthenticated after recovery;
- canonical build identity matches the deployed candidate;
- emergency OFF path remains independently executable and proves 503;
- no Paystack-live or live-funds configuration is changed.

## Decision boundary

No new user decision is required to implement and falsify this gate. The standing authorization to enable Production application access remains the authority for recovery. Any proposal to enable Paystack live mode, authorize live funds, change the bound Production operator identity, or broaden Production mutation authority requires a separate explicit decision.