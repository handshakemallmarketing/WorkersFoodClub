# Food Club Ghana — SW0-03
Authority & Command Execution Kernel Hardening — v0.2.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-02 v0.1.0-alpha.1  
**Status:** PARTIAL GREEN — authority and command-execution semantics hardened; database-backed durability and commerce-domain invariants remain open.

## What changed
- Added bounded delegated Authority with explicit parent grants and anti-escalation checks for action, target, time and quantity scope.
- Parent revocation now invalidates delegated authority at execution time.
- Added explicit STOP/HOLD constraints that outrank otherwise-valid authority grants.
- Added IdempotencyStore and VersionStore seams rather than binding command semantics to one process-local map.
- Added expectedVersion stale-command rejection for consequential commands.
- Added attributed rejected-command evidence with actor, action, target, reason, grant IDs, policy versions and correlation identity.
- Added AI/service-actor overreach proof: machine actors receive no privilege beyond explicit grants.
- CI now runs both the Vitest frontier and executable Node kernel proofs.
- FX-019 and FX-020 are GREEN; INV-001, INV-027 and INV-028 are PARTIAL_GREEN with explicit remaining persistence/concurrency boundaries.

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
SW0-03 does **not** claim overall SW0 conformance. It proves the governance/command boundary is materially stronger: authenticated or automated actors cannot self-authorize, delegated authority cannot widen itself, superior stops take precedence, stale versioned commands are rejected, and command retries can share an idempotency authority outside a CommandBus instance.

Database-backed idempotency, serialized transaction/concurrency proof, demand/obligation, physical allocation, fulfillment, economics and migration invariants remain for subsequent slices.

## Next slice
**SW0-04 — Membership, Specification, Price Evidence & Member Offer Slice**: establish Participant membership relationships and a governed catalog/offer projection without turning eligibility, SKU, price or forecast conventions into canonical truth.
