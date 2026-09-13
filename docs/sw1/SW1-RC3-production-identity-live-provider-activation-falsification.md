# SW1-RC3 — Production Identity & Live-Provider Activation Falsification

Status: OPEN_NO_GO
Parent release: `SW1-RC2`
Starting main commit: `eb191168ec121b6d4dfde9acbfc0db3e7b43f06e`

## 1. Purpose

SW1-RC3 is the production-activation gate that follows the merged `GO_RC2` evidence baseline. RC2 proved the application inside a Vercel Preview + Neon PostgreSQL + Paystack test-mode envelope. It did **not** authorize live funds and did **not** prove a production identity provider.

RC3 exists to falsify the proposition that the exact production deployment can safely bind authenticated users to canonical participants/operators and, if separately authorized, can activate the live payment provider without weakening the constitutional authority, idempotency, evidence, durability, privacy, title/risk, and recovery guarantees already proven in SW0/SW1.

RC3 is **NO_GO** until every blocking criterion below is closed with exact-head executable or inspectable evidence.

## 2. Non-negotiable starting constraints

- Live member funds remain unauthorized at RC3 entry.
- Production payment-provider credentials must not be used merely to make a test pass.
- Production authentication must not reuse the Preview shared-HMAC token mechanism.
- UI role names, email addresses, provider claims, or frontend state must not become canonical authority by convention.
- A production identity must resolve to an explicit application principal and an authorized canonical actor/participant before any consequential command executes.
- Existing Preview authentication must remain available only in non-production environments and must continue to fail closed in production.
- Provider callbacks remain evidence only; they do not self-authorize canonical economic effects.
- No release-index advancement occurs until the final RC3 review is green.

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

Production routes must consume a provider-neutral application principal contract. Provider-specific JWT/OIDC details belong behind an authentication adapter and must not leak into canonical domain semantics.

## 4. Required negative tests

At minimum RC3 must demonstrate:

- missing Authorization header -> fail closed;
- malformed token -> fail closed;
- bad signature -> fail closed;
- wrong issuer -> fail closed;
- wrong audience -> fail closed;
- expired/not-yet-valid token -> fail closed;
- valid upstream identity with no application binding -> fail closed;
- valid member identity requesting operator scope -> fail closed;
- valid operator identity attempting a different canonical actor -> fail closed;
- valid token with body participant substitution -> authenticated binding wins or request fails closed;
- disabled principal -> fail closed;
- Preview HMAC token presented to production -> fail closed;
- production token presented to Preview must not silently gain Preview authority unless explicitly supported and tested;
- sensitive token/claim/provider material absent from runtime logs.

## 5. Live-provider activation contract

The payment portion of RC3 remains blocked until a separately configured production-provider envelope is available. When activated for proof, the gate must establish:

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

A production deployment being `READY` on Vercel is not evidence that live payments are authorized.

## 6. RC3 blocking register

### RC3-AUTH-001 — Production token verification
OPEN. Current runtime intentionally disables Preview auth in production; no production identity verifier has yet been proven.

### RC3-BIND-001 — Principal-to-canonical-actor binding
OPEN. Current protected pilot routes still use hard-coded Preview actor IDs. Production must resolve authenticated subjects to governed application actors and prohibit substitution.

### RC3-ENV-001 — Production auth configuration isolation
OPEN. Production issuer/audience/key configuration must be explicit, environment-isolated, validated, and fail closed when incomplete.

### RC3-LOG-001 — Production identity logging hygiene
OPEN. Runtime evidence must prove no bearer token, provider secret, raw identity payload, or sensitive claim set is emitted.

### RC3-PAY-001 — Live-provider activation proof
OPEN / LIVE FUNDS NOT AUTHORIZED. Paystack has been proven only in test mode under RC2.

### RC3-ROLLBACK-001 — Production activation rollback/kill-switch rehearsal
OPEN. Authentication/provider activation must have a tested bounded rollback path that does not rewrite canonical history.

### RC3-REHEARSAL-001 — Exact-head production adversarial rehearsal
OPEN. Final production candidate must pass the required negative identity tests and the already-established payment/replay/durability checks on the exact reviewed head.

## 7. Exit criteria

RC3 may be declared `GO_RC3` only when:

1. all RC3 blockers are CLOSED with evidence;
2. production identity is cryptographically verified and application-bound;
3. no hard-coded Preview actor is relied upon for production authority;
4. exact-head canon, traceability, typecheck, full tests, kernel tests, PostgreSQL durability/backup/restore and adapter-race checks pass;
5. Vercel production deployment of the exact candidate is READY;
6. production negative-authentication matrix passes;
7. runtime-log inspection passes;
8. payment production envelope is either proven under explicitly authorized live-funds conditions or remains separately withheld with `liveFundsAuthorized=false`;
9. zero unresolved P0/P1 findings remain for the authorization actually claimed;
10. a final machine-readable RC3 review records exact commit, environment, identity-provider envelope, payment-provider envelope, limitations and verdict.

`GO_RC3` must state separately whether production application access is authorized and whether live funds are authorized. Those are distinct decisions.