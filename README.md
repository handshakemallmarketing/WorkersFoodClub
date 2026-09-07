# Food Club Ghana — SW0-07B
Kernel Integrity & Conformance Harness Hardening — v0.6.1-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-07A canon-mapping correction  
**Status:** PARTIAL GREEN — known kernel-integrity and conformance-harness gaps corrected before SW0-08.

## What changed
- Allocation now requires attributable evidence before the write is accepted.
- Authority revocation and constraint release are one-way operations; repeated calls cannot move historical effective timestamps.
- CommandBus distinguishes expected `DomainRejection` from unexpected infrastructure/programming failure. Expected domain refusal becomes evidence-backed and idempotently replayable; unexpected failure still propagates.
- Added `InMemoryCommandExecutionRegistry` so downstream domain code can verify that a cited command was actually ACCEPTED and produced the cited event.
- Purchase commitment now verifies its authorization command/event semantically rather than accepting arbitrary nonblank identifiers.
- Catalog and demand now share the same offer-validity predicate.
- Added the authoritative one-line rule for all INV-001..INV-030 entries to `canon/invariants.json`.
- Hardened `canon:check` for unique IDs, exact numbering, allowed enums, missing rules and referenced proof-file existence.
- Replaced the stale SW0-02 cumulative traceability snapshot with SW0-07B status and made `traceability:check` compare baseline, IDs, priorities, statuses and canonical rule text against the canon registry.
- Preserved prior SW0-06/SW0-07 release evidence rather than rewriting historical claims.

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
SW0-07B does **not** claim overall SW0 conformance. Durable idempotency, database serialization, complete migration of every legacy domain `Error` into typed `DomainRejection`, transformation provenance, liquidity/security/collateral controls, remedies and savings remain open.

The authoritative CB-00 mappings after SW0-07A remain in force: fulfillment proofs map to INV-019 Transfer and INV-020 Partial Fulfillment; INV-016/017/018 remain RED for Liquidity, Claims/security restrictions and Collateral respectively.

## Next slice
**SW0-08 — Exception, Remedy & Completion Slice**: fix rejected-acceptance semantics, model shortfall/substitution/consent and refund/replacement/credit remedies, and discharge only validly performed or governed-remedied portions.
