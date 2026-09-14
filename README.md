# Food Club Ghana — SW0-11
Constitutional RED Frontier Closure — v0.10.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-10 Projection & Rebuild  
**Status:** PARTIAL GREEN — every INV-001..INV-030 now has at least partial executable proof; remaining work is depth, adversarial closure, durability and release-candidate validation.

## What changed
- Added explicit supply facts so capability, capacity, offer, available supply and owned inventory cannot collapse into one state.
- Added equivalent-obligation sourcing comparisons while preserving ABSTAIN as a valid decision.
- Added evidence-backed physical transformations with input/output lot ancestry and conservation through explicit loss.
- Added return-to-stock quality gating: returned goods remain unavailable until a governed accepted quality determination exists.
- Added governed reserve designation and release with purpose, policy, evidence, authority and retained-floor constraints.
- Added fully bounded future-price-promise envelopes covering specification, quantity, place, time, rule, conditions, authority and evidence.
- Added liquidity/headroom and maturity hard constraints that override attractive expected returns.
- Added explicit security-interest visibility and cumulative collateral-capacity checks preventing unauthorized double pledge.
- Added epistemic-kind separation for observation/assertion/inference/model output and source-independence checks.
- Added explicit contradiction records and reconstructible material decision records preserving model version, inputs, assumptions, alternatives, constraints, authority and evidence.
- Advanced the final RED invariants INV-005,006,007,008,011,015,016,017,018,022,023,025,026 to PARTIAL_GREEN.
- Advanced FX-006, FX-007, FX-017, FX-018, FX-021, FX-023 and FX-024 to GREEN.

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
SW0-11 does **not** claim SW0 release readiness. `PARTIAL_GREEN` means executable proof exists for the bounded in-memory kernel scenario; it does not imply durable database enforcement, distributed concurrency safety, complete provider anti-corruption, migration safety or production authorization.

Ten adversarial fixtures remain RED: FX-001, FX-002, FX-003, FX-004, FX-005, FX-010, FX-012, FX-016, FX-022 and FX-025.

## Next slice
**SW0-12 — Adversarial & Durability Conformance Hardening**: close the remaining FX register, introduce durable persistence/transactional concurrency where required, prove provider semantic anti-corruption and migration unknown-preservation, then prepare SW0-RC1 independent clean-room review.
