# Food Club Ghana — SW0-06
Lot Receipt, Quality State & Allocation Slice — v0.5.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-05 v0.4.0-alpha.1  
**Status:** PARTIAL GREEN — lot receipt, quality and allocation semantics proven; durable transactional inventory, fulfillment and savings remain open.

## What changed
- Added traceable Lot receipt with specification, quantity, owner, custodian, place, time and receipt-evidence lineage.
- Kept ownership and custody distinct.
- Added evidence-backed QualityAssessment history rather than a mutable quality scalar.
- Required explicit supersession lineage for quality corrections.
- Added allocation only from ACCEPTED lots to OPEN/PARTIALLY_DISCHARGED matching obligations.
- Rejects specification mismatch, quarantined/rejected stock, duplicate allocation identity, lot over-allocation and obligation over-allocation.
- Added executable SW0-06 proofs, traceability supplement and release evidence.
- Advanced INV-008, INV-009 and INV-010 to PARTIAL_GREEN and strengthened INV-007 without claiming database serialization.

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
SW0-06 does **not** claim overall SW0 conformance. Physical stock enters software only through a traceable Lot with evidence and custody context; quality is governed evidence-backed state; allocation cannot exceed physical lot quantity or the linked purchase obligation.

Durable persistence and concurrent allocator serialization remain intentionally unclaimed until a PostgreSQL-backed transaction slice.

## Next slice
**SW0-07 — Pick, Pack, Pickup Transfer & Acceptance Slice**: turn allocation into controlled fulfillment work, preserve custody/risk/acceptance distinctions, and prove that pickup handover does not silently equal member acceptance or obligation discharge.
