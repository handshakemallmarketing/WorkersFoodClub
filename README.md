# Food Club Ghana — SW0-08
Exception, Remedy & Completion Slice — v0.7.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-07B Kernel Integrity & Conformance Harness Hardening  
**Status:** PARTIAL GREEN — exception/remedy/substitution semantics are executable; returns, savings and durable settlement remain open.

## What changed
- Preserved rejected member acceptance as zero conforming performed quantity rather than forcing a false delivery state.
- Added evidence-backed SHORTFALL, REJECTION, SUBSTITUTION_REQUIRED and DISPUTE exception records.
- Added refund, replacement and remedy-credit obligations linked to the original purchase obligation and exception.
- Kept performed quantity separate from remedied quantity in completion projections, so a refund never masquerades as delivery.
- Added material-substitution controls that preserve the original specification and require equivalence evidence, member consent and economic recomputation before resolution.
- Added quantity guards against exception overstatement, remedy overallocation, remedy overcompletion and obligation overresolution.
- Classified remedy credit explicitly as `REMEDY_CREDIT_NOT_STORED_VALUE`; no wallet or lending semantics are introduced.
- Added effect-idempotent refund retry proof through CommandBus.
- Advanced INV-021 to PARTIAL_GREEN and strengthened INV-019, INV-020 and INV-027.
- Advanced adversarial fixtures FX-008, FX-009 and FX-011 to GREEN.

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
SW0-08 does **not** claim overall SW0 conformance. A completed obligation may now be reconstructed as performed quantity plus separately governed remedy quantity; the system never relabels a refund, replacement or credit as original conforming delivery.

Still intentionally open: INV-022 returned-goods quality re-entry, durable database remedy persistence, external refund-provider integration, title/risk-transfer policy, stored-value/credit products, and final savings economics.

## Next slice
**SW0-09 — Actual Fulfilled Economics, Benchmark & Savings Ledger Slice**: compute final member savings only from actual fulfilled/remedied economics against a governed comparable benchmark, preserve zero/negative savings, and prevent promotion/subsidy from masquerading as structural advantage.
