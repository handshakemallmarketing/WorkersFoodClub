# SW1-RC3 — Production Identity & Live-Provider Activation Falsification

Status: GO_RC3_READINESS_ACTIVATIONS_WITHHELD
Parent release: `SW1-RC2`
Starting main commit: `eb191168ec121b6d4dfde9acbfc0db3e7b43f06e`
Reviewed candidate: `a4ddbd08430a6293b622c84db950fd224fa36caa`
Final review: `docs/traceability/SW1-RC3-final-review-2026-09-14.json`

## 1. Purpose

SW1-RC3 is the production-activation gate that follows the merged `GO_RC2` evidence baseline. RC2 proved the application inside a Vercel Preview + Neon PostgreSQL + Paystack test-mode envelope. It did **not** authorize live funds and did **not** prove a production identity provider.

RC3 exists to falsify the proposition that the exact production deployment can safely bind authenticated users to canonical participants/operators and, if separately authorized, can activate the live payment provider without weakening the constitutional authority, idempotency, evidence, durability, privacy, title/risk, and recovery guarantees already proven in SW0/SW1.

The bounded RC3 readiness claim is now green. This verdict does **not** authorize persistent Production application access, live funds, or Paystack live mode. Those capabilities remain separately withheld.

## 2. Non-negotiable starting constraints

- Live member funds remain unauthorized.
- Production payment-provider credentials must not be used merely to make a test pass.
- Production authentication must not reuse the Preview shared-HMAC token mechanism.
- UI role names, email addresses, provider claims, or frontend state must not become canonical authority by convention.
- A production identity must resolve to an explicit application principal and an authorized canonical actor/participant before any consequential command executes.
- Existing Preview authentication must remain available only in non-production environments and must continue to fail closed in production.
- Provider callbacks remain evidence only; they do not self-authorize canonical economic effects.
- No release-index advancement is authorized by this RC3 readiness review alone.

## 3. Required production identity contract

The production API authentication seam must verify, at minimum:

1. issuer — token is issued by the configured production identity authority;
2. audience — token is intended for the WorkersFoodClub API;
3. signature — token signature verifies against the configured trusted key set;
4. temporal validity — `exp`, `nbf`/equivalent and clock skew are enforced;
5. stable subject — an immutable provider subject identifies the authenticated identity;
6. application binding — provider subject resolves to a governed WorkersFoodClub principal/participant/operator record;
7. scope/permission — requested API action requires an explicit application permission, not merely provider login;
8. actor binding — body/query/path actor substitutions cannot override the authenticated application actor;
9. revocation/disablement — disabled or unbound principals fail closed even when the upstream token is cryptographically valid;
10. logging hygiene — tokens, secrets, sensitive identity payloads and provider credentials never enter application logs.

Production routes consume a provider-neutral application principal contract. Provider-specific JWT/OIDC details remain behind the authentication adapter and do not become canonical domain semantics.

## 4. Required negative tests

RC3 demonstrated the required fail-closed matrix, including:

- missing Authorization header;
- malformed token;
- bad signature;
- wrong issuer;
- wrong audience;
- expired/not-yet-valid token;
- valid upstream identity with no application binding;
- valid member identity requesting operator scope;
- actor substitution attempts;
- disabled application principal;
- Preview HMAC token presented to production;
- Production access kill-switch denial before OIDC verification;
- sensitive token/claim/provider material absent from runtime logs.

## 5. Live-provider activation contract

The live-payment portion of RC3 remains separately withheld. When a live production-provider envelope is later authorized, the gate must establish:

- exact production provider/account/environment;
- live webhook authenticity against the production secret without exposing it;
- provider reference uniqueness;
- reconciliation after timeout/unknown outcome;
- duplicate webhook/retry idempotency;
- refund retry/idempotency;
- no canonical economic effect from unauthenticated provider traffic;
- no implicit switch from test to live mode;
- explicit kill switch / rollback path;
- minimal-value controlled transaction only after explicit live-funds authorization.

Current proof is intentionally bounded to real Paystack TEST mode. A Production deployment being `READY` on Vercel is not evidence that live payments are authorized.

## 6. RC3 blocking register — final disposition

### RC3-AUTH-001 — Production token verification
CLOSED_RUNTIME_PROVEN. Google OIDC RS256/JWKS verification, issuer/audience/time validation, missing-bearer denial and provider-neutral principal resolution were exercised in the bounded Production identity rehearsal.

### RC3-BIND-001 — Principal-to-canonical-actor binding
CLOSED_RUNTIME_PROVEN. Verified Google subjects resolve through the application-owned binding store to durable application participants and governed authority. Valid-but-unbound identity, member-to-operator escalation and disabled application principal cases fail closed.

### RC3-ENV-001 — Production auth configuration isolation
CLOSED_RUNTIME_PROVEN. Production OIDC trust configuration and the Production Neon binding store were exercised under the bounded Production envelope and fail closed when incomplete.

### RC3-LOG-001 — Production identity logging hygiene
CLOSED_RUNTIME_PROVEN. Runtime inspection found route/status metadata without bearer token material, Google subject, issuer value or provider secret material.

### RC3-PAY-001 — Live-provider activation proof
CLOSED_RUNTIME_PROVEN_LIVE_ACTIVATION_WITHHELD for the authorization actually claimed. Real Paystack TEST mode proved GHS 1.00 initiation, provider confirmation, delayed transaction re-query, refund creation and repeated refund-status re-query. Executable tests cover exact raw-body HMAC-SHA512 verification, bad-signature/tamper rejection, reference binding, retry/idempotency semantics and test/live credential separation. Live merchant webhook delivery, live credentials and live funds remain deliberately unclaimed and unauthorized.

### RC3-ROLLBACK-001 — Production activation rollback/kill-switch rehearsal
CLOSED_RUNTIME_PROVEN. Production application access rollback is proven. Final reviewed candidate deployment `dpl_CuXVr8MjtDYo76RAuEspbf4DBd66` is `READY` with application access explicitly disabled; the canonical member-orders route returns HTTP 503 `PRODUCTION_APPLICATION_ACCESS_DISABLED`.

### RC3-REHEARSAL-001 — Exact-head production adversarial rehearsal
CLOSED_RUNTIME_PROVEN. The bounded Production identity rehearsal, exact-head conformance, binding integrity, runtime-log inspection, fail-closed restoration and exact-candidate Production canary all passed for the bounded readiness claim.

## 7. Exit criteria — final assessment

RC3 readiness satisfies the exit criteria for the authorization actually claimed:

1. all RC3 blockers are CLOSED with evidence;
2. production identity is cryptographically verified and application-bound;
3. no hard-coded Preview actor is relied upon for production authority;
4. exact-head conformance gates passed on reviewed candidate `a4ddbd08430a6293b622c84db950fd224fa36caa`;
5. Vercel Production deployment `dpl_CuXVr8MjtDYo76RAuEspbf4DBd66` of that exact candidate is `READY`;
6. the production negative-authentication matrix passed;
7. runtime-log inspection passed;
8. the payment envelope is runtime-proven in Paystack TEST mode while live activation remains separately withheld with `liveFundsAuthorized=false`;
9. zero unresolved P0/P1 findings remain for the bounded readiness authorization actually claimed;
10. `docs/traceability/SW1-RC3-final-review-2026-09-14.json` records the exact commit, environment, identity envelope, payment envelope, limitations and verdict.

## 8. Final authorization statement

`GO_RC3_READINESS_ACTIVATIONS_WITHHELD` means the RC3 production-readiness falsification gate has passed for the bounded non-live-funds envelope.

It does **not** authorize turning on persistent Production application access. `PRODUCTION_APPLICATION_ACCESS_ENABLED` remains OFF/fail-closed pending a separate deliberate authorization.

It does **not** authorize live member funds or Paystack live mode. Future live activation requires the separately governed evidence package defined above.

The release index remains unchanged by this review unless and until the release/merge governance step is separately authorized.
