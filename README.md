# Food Club Ghana — SW0-10
Projection & Rebuild Slice — v0.9.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-09 Actual Fulfilled Economics, Benchmark & Savings Ledger  
**Status:** PARTIAL GREEN — material operational views are disposable/rebuildable with freshness and lineage; remaining constitutional RED frontier and durable persistence remain open.

## What changed
- Added an ordered canonical record log used only as projection input authority.
- Added rebuildable member, inventory, fulfillment and savings operational views.
- Proved deterministic drop/rebuild equivalence from the same canonical source sequence.
- Added projection checkpoints exposing source count, latest canonical sequence and rebuild time.
- Added stale-view detection instead of silently presenting stale projection state as current truth.
- Added row-level source-record lineage.
- Rebuilt inventory availability preserves quality gating: quarantined quantity remains unavailable.
- Rebuilt savings preserves signed negative values and additive correction lineage.
- Projection rebuild/drop operations cannot mutate or manufacture canonical records.
- Advanced INV-029 to PARTIAL_GREEN and strengthened INV-002, INV-009 and INV-024.

## Local proof
```bash
pnpm install --frozen-lockfile
pnpm canon:check
pnpm traceability:check
pnpm typecheck
pnpm test
pnpm test:kernel
```

## Constitutional status
SW0-10 does **not** claim overall SW0 conformance. Operational views are explicitly subordinate to canonical history: they can be deleted and reconstructed, disclose freshness/lineage, and have no path to rewrite canonical source records.

Still intentionally open: durable database canonical/event persistence, distributed projection checkpoint locking, remaining P0/P1 RED invariants, remaining adversarial fixtures and release-candidate clean-room proof.

## Next slice
**SW0-11 — Constitutional RED Frontier Closure**: close the remaining release-blocking physical provenance, returns-quality, liquidity/security/collateral, future-price-promise and evidence/decision-governance invariants before final conformance hardening and RC review.
