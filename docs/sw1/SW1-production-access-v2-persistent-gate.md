# SW1 — Production Access v2 Persistent Gate

Status: IMPLEMENTATION CANDIDATE

## Purpose

Replace deployment-time dependence on short-lived human Google ID tokens with a durable, governed Production application-access configuration while preserving request-time OIDC/JWKS authentication and server-side application principal authorization.

## Constitutional boundaries

- Existing explicit authorization to enable Production application access remains the authority for this gate.
- Production request authentication remains fail-closed and MUST continue to verify the configured external OIDC issuer, audience, JWKS signature, token time validity, and subject.
- Application actor identity and scopes remain server-side bindings; IdP claims do not grant application authority.
- Production application access and live economic authority are separate controls.
- Paystack live mode is NOT authorized.
- Live funds are NOT authorized.
- Live Paystack credentials are NOT authorized and MUST NOT be read, provisioned, or used by this gate.

## V2 control model

1. `PRODUCTION_APPLICATION_ACCESS_ENABLED` is durable Production project configuration, not an ephemeral per-deployment override.
2. A Production deployment inherits that durable configuration. Deployments MUST NOT silently reset an already-authorized state.
3. Deployment/recovery does not require reusable or manually refreshed human Google ID tokens in GitHub Actions secrets.
4. CI proves the OIDC verifier and authorization boundary deterministically with cryptographically valid test fixtures and server-side binding fixtures.
5. Runtime Production proves the public fail-closed boundary without privileged human credentials:
   - switch OFF => protected application route returns 503 `PRODUCTION_APPLICATION_ACCESS_DISABLED`;
   - switch ON => unauthenticated protected application route returns 401;
   - malformed/invalid bearer credentials return 401.
6. Actual interactive Google authentication remains an end-user/session concern and may be periodically end-to-end tested independently of deployment.
7. An independent emergency disable path MUST persist `PRODUCTION_APPLICATION_ACCESS_ENABLED=false` before/while deploying containment and MUST re-prove canonical 503.

## Activation / persistence proof

Before declaring V2 recovered:

- governed authorization evidence is valid and unrevoked;
- durable Production switch is persisted as `true`;
- a fresh Production deployment inherits the switch without a per-deploy override;
- canonical protected route converges to 401 unauthenticated, not 503;
- canonical runtime SHA matches the deployed candidate;
- deterministic OIDC/authz suite is green;
- all consequential economic mutation routes remain unavailable under the existing no-live-economic-effect policy;
- a subsequent ordinary Git-integrated Production deployment does not reset the switch.

Any unexpected activation or persistence result requires immediate durable switch `false` and canonical 503 re-proof.

## Non-goals

This gate does not authorize or implement Paystack live mode, live funds, live credentials, live merchant activation, or a live provider transaction.
