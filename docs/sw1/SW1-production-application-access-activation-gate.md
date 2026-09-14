# SW1 — Production Application Access Activation Gate

Status: PRE_AUTHORIZATION_READINESS
Parent evidence baseline: `SW1-RC3`
Starting main commit: `5bb24c8ab7ae4af8febc97fd7a1109991731125f`

## Purpose

This is the separate deliberate authorization gate required by SW1-RC3 before persistent Production application access may be enabled.

It is **not** an RC4 gate and it does **not** authorize Paystack live mode, live member funds, live Paystack credentials, or any other live economic effect.

## Current authorization boundary

Until a separate explicit Production-access authorization is recorded:

- `PRODUCTION_APPLICATION_ACCESS_ENABLED` remains `false`;
- the canonical Production application remains fail-closed;
- `/api/member-orders` must continue to return HTTP 503 `PRODUCTION_APPLICATION_ACCESS_DISABLED`;
- live funds remain unauthorized;
- Paystack live mode remains unauthorized;
- live Paystack credentials must not be created, read, provisioned, synchronized, or used;
- no Production deployment may be created with persistent application access enabled.

The user instruction to continue work on this gate is authorization to prepare and falsify activation readiness only. It is not itself authorization to turn Production access on.

## Verified starting baseline

At gate creation:

1. `main` is `5bb24c8ab7ae4af8febc97fd7a1109991731125f`, the merge of PR #53;
2. constitutional-conformance run #1584 (`34829783606`) succeeded on that exact commit;
3. Vercel status for that exact commit is green;
4. the canonical release index has `head=SW1-RC3`;
5. the canonical Production route `/api/member-orders` returns HTTP 503 `PRODUCTION_APPLICATION_ACCESS_DISABLED`;
6. RC3 production OIDC/JWKS identity verification, application binding, negative authorization, log hygiene, and rollback behavior were already runtime-proven;
7. live funds and Paystack live mode remain explicitly withheld.

## Preconditions before any enablement authorization can be executed

All of the following must be true on the exact activation candidate:

1. constitutional conformance succeeds;
2. exact-head Vercel deployment status is green;
3. Production database/binding dependencies are ready and no schema drift blocker exists;
4. Production OIDC configuration is complete and uses the governed application-principal binding path;
5. controlled member and operator identities needed for post-enable smoke tests are known and governed;
6. disabled/unbound/escalation denial paths remain covered by executable tests;
7. a rollback deployment/path with `PRODUCTION_APPLICATION_ACCESS_ENABLED=false` is ready and has been proven;
8. runtime-log inspection remains free of bearer tokens, provider subjects, issuer configuration, secrets, or sensitive claims;
9. no unresolved P0/P1 finding exists for Production application access;
10. live funds remain unauthorized and no Paystack-live configuration is introduced.

## Pre-authorization work permitted by this gate

Before explicit activation authorization, this branch may:

- inspect current Production behavior and configuration metadata without exposing secrets;
- add or strengthen tests and observability needed for activation falsification;
- create an activation runbook and machine-readable evidence package;
- rehearse rollback with application access disabled;
- validate exact-head deployment behavior while the kill switch remains OFF;
- prepare, but not execute, an enablement procedure.

## Explicit authorization required to enable Production access

Persistent Production application access may only be enabled after an explicit instruction whose substance unambiguously authorizes enabling Production application access.

Examples of sufficient authorization include: `Enable Production application access` or `Authorize Production application access activation`.

Generic continuation instructions such as `Next`, `Go`, `continue`, or `proceed` authorize readiness work only and must not be interpreted as permission to flip the Production access switch.

## Activation execution contract after explicit authorization

Once explicit authorization exists, the activation must be bounded and reversible:

1. freeze the exact reviewed candidate SHA;
2. verify all required checks are green on that exact SHA;
3. deploy Production with `PRODUCTION_APPLICATION_ACCESS_ENABLED=true` without changing Paystack/live-funds posture;
4. confirm the kill-switch denial has disappeared only because the switch is enabled;
5. verify unauthenticated access fails with the authentication boundary rather than executing commands;
6. verify a governed member identity can access only member-authorized routes and cannot obtain operator authority;
7. verify a governed operator identity can access only explicitly granted operator scopes;
8. verify unbound, disabled, actor-substitution, and scope-escalation cases remain denied;
9. inspect runtime logs for secret/token/claim leakage;
10. on any unexpected result, immediately restore a deployment with `PRODUCTION_APPLICATION_ACCESS_ENABLED=false` and re-prove HTTP 503 fail-closed behavior.

## Exit verdicts

Before explicit authorization, the strongest permitted verdict is:

`READY_FOR_EXPLICIT_PRODUCTION_ACCESS_AUTHORIZATION`

After an explicitly authorized, successful activation and post-enable falsification, the gate may record:

`GO_PRODUCTION_APPLICATION_ACCESS_ENABLED_LIVE_FUNDS_WITHHELD`

A failure at any activation criterion requires:

`NO_GO_PRODUCTION_APPLICATION_ACCESS_ROLLED_BACK`

None of these verdicts authorizes Paystack live mode or live member funds.
