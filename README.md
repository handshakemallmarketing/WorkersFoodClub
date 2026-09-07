# Food Club Ghana — SW0-07
Pick, Pack, Pickup Transfer & Acceptance Slice — v0.6.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-06 v0.5.0-alpha.1  
**Status:** PARTIAL GREEN — fulfillment work, handover and acceptance distinctions implemented; remedies, savings and durable fulfillment remain open.

## What changed
- Added allocation-linked PICKED → PACKED → READY_FOR_PICKUP work history with evidence and explicit lineage.
- Added pickup handover as a distinct custody-transfer record.
- Kept handover distinct from member acceptance and obligation discharge.
- Added explicit ACCEPTED, PARTIALLY_ACCEPTED and REJECTED member outcomes.
- Derived obligation performance from accepted quantity: OPEN, PARTIALLY_DISCHARGED or DISCHARGED.
- Rejects unordered fulfillment work, lineage gaps, allocation mismatch, wrong-member acceptance and over-discharge.
- Added executable SW0-07 proofs, traceability supplement and release evidence.
- Advanced INV-016, INV-017 and INV-018 to PARTIAL_GREEN without claiming legal title/risk-transfer policy or database durability.

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
SW0-07 does **not** claim overall SW0 conformance. Picking and packing are fulfillment work; physical handover is a custody-transfer fact; member acceptance is a separate governed fact; only accepted performance can project discharge of the food obligation.

Legal title/risk transfer rules, exception/remedy completion, durable persistence and concurrent fulfillment serialization remain intentionally unclaimed.

## Next slice
**SW0-08 — Exception, Remedy & Completion Slice**: model shortages, substitutions, rejection/partial acceptance, remedy obligations and completion without erasing the failed fulfillment history.
