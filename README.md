# Food Club Ghana — SW0-09
Actual Fulfilled Economics, Benchmark & Savings Ledger — v0.8.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-08 Exception, Remedy & Completion  
**Status:** PARTIAL GREEN — final transaction savings and structural-advantage distinctions are executable; projection rebuild, remaining P0 controls and durable persistence remain open.

## What changed
- Added versioned governed benchmark methods bounded by specification, quantity, place, service level, time, normalization rule, availability rule and qualifying observation evidence.
- Benchmark valuation now requires an executable alternative and cannot cite evidence outside the governed observation set.
- Added actual fulfilled member economics with goods outlay, mandatory charges, refunds and evidence lineage.
- Added a signed savings ledger so positive, zero and negative savings are all representable and preserved.
- Savings corrections are additive through explicit `supersedes`; prior savings entries remain intact.
- Added purpose-specific cost bases with declared method version and evidence-backed cost components.
- Added structural-advantage assessment that keeps subsidy, promotion, cross-subsidy and grant support separate from risk-adjusted system cost.
- Advanced INV-012, INV-013 and INV-014 to PARTIAL_GREEN and strengthened INV-024.
- Advanced FX-013 benchmark cherry-pick, FX-014 hidden negative savings and FX-015 supplier-promo laundering to GREEN.

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
SW0-09 does **not** claim overall SW0 conformance. Savings is derived only from a governed comparable benchmark and actual fulfilled member economics. Mandatory charges are included, refunds require recomputation, unfavorable savings remain visible, and non-structural support cannot be relabeled as structural advantage.

Still intentionally open: INV-015 bounded future price-protection promises, INV-016/017/018 capital/security controls, INV-022 return-to-stock quality gating, projection rebuild/freshness, durable database economics persistence and full adversarial closure.

## Next slice
**SW0-10 — Projection & Rebuild Slice**: make inventory, fulfillment, savings and member operational views disposable/rebuildable from canonical sources, prove drop/rebuild equivalence, expose freshness/lineage, and advance INV-029 without granting projections write authority.
