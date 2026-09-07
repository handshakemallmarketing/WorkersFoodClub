# Food Club Ghana — SW0-02
Kernel Types, Authority-Aware Command Boundary, Event/Evidence Contracts & First Executable Conformance Proofs — v0.1.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-01A v0.0.1  
**Status:** PARTIAL GREEN — kernel infrastructure proven; commerce/physical/fulfillment/economics invariants remain deliberately open.

## What changed
- Implemented typed representations for all 14 canonical kernel concepts.
- Added Quantity/Unit and Money/Currency value types; physical subtraction rejects negative truth.
- Added bounded Authority grants, execution-time evaluation, revocation and quantity limits.
- Added semantic CommandEnvelope and effect-idempotent CommandBus.
- Added append-only Event/Evidence contracts and additive correction lineage.
- Added executable Node test proofs for INV-001, INV-007, INV-024, INV-027 and FX-020.
- Expanded traceability so all 30 invariant identities now have a machine-readable mapping, with unimplemented items explicitly PENDING rather than silently absent.

## Local proof without third-party test packages
```bash
npm run conformance
```
The kernel proof uses global/local TypeScript plus Node's built-in test runner. The Vitest frontier remains available after dependency install.

## Constitutional status
This slice does **not** claim SW0 conformance. It proves infrastructure-level invariants only. Demand/obligation, inventory allocation, fulfillment, savings, liquidity/security and migration fixtures remain for subsequent slices.

## Next slice
**SW0-03 — Authority & Command Execution Kernel hardening**: durable idempotency semantics, expected-version concurrency, constraint/hold evaluation, attributed rejected-command evidence, and authority matrix fixtures including AI/delegated actors.
