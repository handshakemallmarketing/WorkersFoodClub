# SW1-RC3 — Release Ratification & Index Advancement Gate

Status: IN_PROGRESS
Parent canonical release head: `SW1-RC2`
RC3 merged implementation commit: `fba4bdcca19146ebea12e0e56517c912a49d3699`
RC3 final readiness verdict: `GO_RC3_READINESS_ACTIVATIONS_WITHHELD`

## Purpose

This gate is the separate governance step required after the RC3 readiness review and merge. It decides whether the bounded RC3 evidence may become the new canonical release-index head. It does not repeat RC3 falsification and it does not authorize Production application access, Paystack live mode, live funds, or live credential provisioning.

## Preconditions

All of the following must remain true on the exact candidate used for ratification:

1. `main` contains RC3 merge commit `fba4bdcca19146ebea12e0e56517c912a49d3699`.
2. Mandatory post-merge constitutional conformance is green on that commit.
3. The Vercel Production deployment for that commit is `READY`.
4. The canonical Production alias remains fail-closed: `/api/member-orders` returns HTTP 503 `PRODUCTION_APPLICATION_ACCESS_DISABLED`.
5. Neon Production remains reachable/ready without schema mutation being required for ratification.
6. No unresolved P0 or P1 finding exists for the bounded RC3 authorization actually claimed.
7. No live Paystack secret is created, read, provisioned, or used by this gate.
8. Live funds and Paystack live mode remain unauthorized.

## Ratification artifacts

The gate will add `evidence/releases/SW1-RC3.json` only after the exact-head ratification checks are green. That release record must preserve the RC3 limitations verbatim in substance, including:

- Production application access remains OFF/fail-closed.
- Live funds remain unauthorized.
- Paystack live mode remains unauthorized.
- Live merchant webhook authenticity remains unproven.
- The TEST refund observation remained `PENDING`; refund completion is not claimed.

After the release record exists, `docs/traceability/release-index.json` may advance from `SW1-RC2` to `SW1-RC3`, and `docs/traceability/matrix.json` must advance its `slice` to the same value so `scripts/check-traceability.mjs` remains internally consistent.

## Required exact-head checks before advancement

- constitutional-conformance: SUCCESS
- release evidence references the correct merged RC3 implementation and final-review artifacts
- release index evidence list has no duplicates and exactly matches `evidence/releases/*.json`
- traceability matrix slice equals release-index head
- no safety-boundary mutation is introduced
- Vercel Production still fails closed on the canonical member route

## Authorization boundary

Passing this gate authorizes only canonical evidence-baseline advancement to `SW1-RC3`.

It does **not** authorize:

- setting `PRODUCTION_APPLICATION_ACCESS_ENABLED=true`;
- persistent Production member/operator access;
- Paystack live credentials;
- Paystack live mode;
- live member funds;
- a controlled live transaction.

Any such activation remains a separate deliberate authorization with its own evidence package.

## Current observed state

Post-merge status is recorded in `docs/traceability/SW1-RC3-post-merge-work-status-2026-09-14.json`. The release index has intentionally not been changed by the gate-definition step.
