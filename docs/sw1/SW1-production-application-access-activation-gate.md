# SW1 — Production Application Access Activation Gate

Status: ACTIVATED_AND_FALSIFIED
Parent evidence baseline: `SW1-RC3`
Starting main commit: `5bb24c8ab7ae4af8febc97fd7a1109991731125f`
Activation candidate: `81ca013cc8f6706bc4aeee6669345ff1fb7b3755`

## Purpose

This is the separate deliberate authorization gate required by SW1-RC3 before persistent Production application access may be enabled.

It is **not** an RC4 gate and it does **not** authorize Paystack live mode, live member funds, live Paystack credentials, or any other live economic effect.

## Governed authorization

Production application access was explicitly authorized and recorded as a bounded governance action in `docs/governance/PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json`.

The authorization is constrained to:

- actor: `participant:willie-adofo`;
- action: `EnableProductionApplicationAccess`;
- environment: `production`;
- repository: `handshakemallmarketing/WorkersFoodClub`;
- exact candidate SHA: `81ca013cc8f6706bc4aeee6669345ff1fb7b3755`;
- live funds: **not authorized**;
- Paystack live mode: **not authorized**;
- live Paystack credentials: **not authorized**;
- payment or fulfillment mutation authority: **not granted**.

This authorization is independent of, and does not widen, `TRANSFER_POLICY_GOVERNANCE-v1`.

## Verified activation result

GitHub Actions Production application access activation run #11 (`34902403050`) succeeded.

Production deployment:

`https://workers-food-club-relw3ycdp-food-club.vercel.app`

Canonical Production alias:

`https://workers-food-club-chi.vercel.app`

The activation workflow proved all of the following before recording success:

1. the controlled member token subject was `105166970902157294779`;
2. the controlled operator token subject was `100561209688774684064`;
3. governed activation evidence matched the exact action, environment, repository, and candidate SHA;
4. the immutable Production deployment reported runtime commit SHA `81ca013cc8f6706bc4aeee6669345ff1fb7b3755`;
5. the canonical Production alias reported that same runtime SHA before authorization-boundary falsification;
6. unauthenticated member access returned HTTP 401;
7. the governed member route returned HTTP 200;
8. member-to-operator escalation returned HTTP 403;
9. operator-to-member escalation returned HTTP 403;
10. the governed operator route returned HTTP 200;
11. `/api/commit-sandbox` returned HTTP 403;
12. `/api/pay-sandbox` returned HTTP 403;
13. `/api/fulfillment-ready` returned HTTP 403;
14. `/api/authorize-refund` returned HTTP 403;
15. `/api/complete-refund` returned HTTP 403;
16. the canonical Production alias still reported the exact candidate runtime SHA after falsification;
17. rollback was not invoked because every activation criterion passed.

Constitutional-conformance run #1608 (`34902402983`) also succeeded on activation-control head `92099dae6a956a4e002ca8218eb7e189163e2d4b`.

## Current Production authorization boundary

Production application access is enabled under the bounded authorization above.

The following remain explicitly withheld:

- live funds;
- Paystack live mode;
- creation, reading, provisioning, synchronization, or use of live Paystack credentials;
- Production payment, refund, fulfillment, or other live economic mutation authority.

Any future request to cross one of those boundaries requires a separate explicit governance action and fresh falsification evidence.

## Fail-closed rollback contract

The activation workflow retains an automatic failure path. Any failed post-enable falsification redeploys the same prebuilt candidate with `PRODUCTION_APPLICATION_ACCESS_ENABLED=false` and polls the canonical alias until HTTP 503 with `PRODUCTION_APPLICATION_ACCESS_DISABLED` is re-proven.

That rollback path was repeatedly runtime-proven during failed activation attempts before the successful activation.

## Final verdict

`GO_PRODUCTION_APPLICATION_ACCESS_ENABLED_LIVE_FUNDS_WITHHELD`

This verdict authorizes Production application access only. It does not authorize Paystack live mode, live member funds, or live Paystack credentials.
