# SW1-RC3 — Release Ratification & Index Advancement Gate

Status: IN_PROGRESS_REMEDIATION_AND_EXACT_HEAD_CONFORMANCE
Parent release: `SW1-RC2`
Merged RC3 main commit: `fba4bdcca19146ebea12e0e56517c912a49d3699`
RC3 readiness verdict: `GO_RC3_READINESS_ACTIVATIONS_WITHHELD`

## Purpose

This is the separate governance step required after RC3 readiness and merge. It exists to decide whether the bounded SW1-RC3 evidence baseline may become the canonical release-index head. It is not a Production-access activation and it is not a live-payment activation.

## Non-negotiable boundaries

- `PRODUCTION_APPLICATION_ACCESS_ENABLED` remains false unless separately authorized.
- Production application access remains OFF/fail-closed.
- Live funds remain unauthorized.
- Paystack live mode remains unauthorized.
- Live Paystack credentials must not be created, read, provisioned, synchronized, or used in this gate.
- Live merchant webhook authenticity remains a future live-activation requirement.
- Ratifying SW1-RC3 as an evidence baseline does not authorize persistent Production access or live economic effect.

## Verified post-merge baseline

- `main` is the RC3 merge commit `fba4bdcca19146ebea12e0e56517c912a49d3699`.
- Post-merge constitutional conformance #1522 succeeded on that exact merge commit.
- Vercel Production deployment `dpl_4FWSxkHj7B6xjB5yXBRxAZnUKSKB` is READY from that exact merge commit.
- Canonical alias is `https://workers-food-club-chi.vercel.app`.
- `/api/member-orders` returns HTTP 503 `PRODUCTION_APPLICATION_ACCESS_DISABLED`.
- Neon project `Food Club`, branch `production` (`br-winter-poetry-ae8qho57`), is the current default/primary database branch.
- The canonical release index still has `head=SW1-RC2`, as required because the RC3 review explicitly withheld index-advance authority.

## Post-merge adversarial review remediation

A focused review of the production-facing HTTP, database-reproducibility and identity seams found concrete issues that must be closed before ratification:

1. `RC3-POSTMERGE-REFUND-RACE-001` — `api/authorize-refund.js` lacked `23505` uniqueness-race recovery. Remediated with winning-row reread/idempotent success semantics and regression proof.
2. `RC3-POSTMERGE-SCHEMA-001` — the seven deployed `preview_*` runtime tables were not reproducible from version-controlled migrations. Remediated by read-only Neon schema reconciliation and migration `009_preview_runtime_schema.sql`.
3. `RC3-POSTMERGE-MIGRATION-HARNESS-001` — clean PostgreSQL conformance executed only through migration 007 even though 008 existed. Remediated by executing 008 and 009 and asserting preview table/refund uniqueness structure.
4. `RC3-POSTMERGE-SCOPE-FAMILY-001` — unsupported future scope families could rely on flat binding scopes without a family-specific deep authority check. Remediated by explicit fail-closed `AUTHORIZATION_SCOPE_FAMILY_UNSUPPORTED` behavior plus regression test.

Machine-readable evidence: `docs/traceability/SW1-RC3-post-merge-review-remediation-2026-09-14.json`.

## Ratification preconditions

Before release-index advancement, all of the following must be true on the exact ratification candidate head:

1. constitutional conformance succeeds;
2. fresh PostgreSQL migration execution succeeds through `009_preview_runtime_schema.sql`;
3. refund race/idempotency regression proof succeeds;
4. unsupported scope families fail closed;
5. Vercel exact-head deployment boundary checks succeed;
6. Production canonical route remains fail-closed;
7. no live-funds or Paystack-live authorization has been introduced;
8. no unresolved P0/P1 finding remains for the bounded non-live-funds RC3 baseline.

## Authorized advancement when green

Only after all preconditions pass, this gate may:

- create `evidence/releases/SW1-RC3.json` describing the bounded ratified release;
- advance `docs/traceability/release-index.json` from `SW1-RC2` to `SW1-RC3`;
- advance `docs/traceability/matrix.json` slice to `SW1-RC3` and extend only evidence mappings actually supported by RC3/post-merge proof;
- rerun exact-head constitutional conformance;
- verify Production remains OFF/fail-closed after the index-advancement commit.

The release evidence must explicitly preserve:

- Production application access: NOT AUTHORIZED / OFF;
- live funds: NOT AUTHORIZED;
- Paystack live mode: NOT AUTHORIZED;
- live merchant webhook authenticity: NOT PROVEN;
- test-mode refund completion: NOT CLAIMED where the observed provider refund remained PENDING.

## Exit

A green exit is `GO_SW1_RC3_RELEASE_BASELINE_RATIFIED_ACTIVATIONS_WITHHELD`.

That verdict advances constitutional evidence bookkeeping only. It creates no authority to enable Production application access, use live Paystack credentials, or move live member funds.
