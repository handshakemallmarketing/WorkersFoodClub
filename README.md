# Food Club Ghana — SW0-04
Membership, Specification, Price Evidence & Member Offer Slice — v0.3.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-03 v0.2.0-alpha.1  
**Status:** PARTIAL GREEN — member/catalog semantics proven; demand commitment, payment, physical allocation, fulfillment and savings remain open.

## What changed
- Added a policy-driven eligibility decision that remains separate from Membership.
- Added Membership as a Participant relationship with explicit evidence and policy-version lineage.
- Added governed Specification publication and separated SKU/listing identifiers from specification identity.
- Added contextual PriceObservation with specification, money, quantity basis, place, time, transaction level and conditions.
- Added bounded MemberOffer with validity window, pickup place, quantity, price basis, policy versions and price-evidence lineage.
- Added rejection of cross-specification price-evidence laundering into an offer.
- Added executable SW0-04 node:test proofs and release/traceability evidence.
- Advanced INV-002 to PARTIAL_GREEN without claiming external ingestion/correction completeness.

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
SW0-04 does **not** claim overall SW0 conformance. It proves that launch eligibility does not redefine Participant identity, an eligibility decision does not itself create membership, SKU does not redefine Specification, and a quoted/member price cannot exist in software as an unbounded scalar detached from specification, basis, place, time and evidence.

The slice deliberately does not create Demand Commitment, Order, Payment, Inventory Availability, Fulfillment or Savings semantics.

## Next slice
**SW0-05 — Demand Request, Purchase Commitment & Payment Evidence Slice**: separate requested demand from committed obligations, introduce authorized acceptance into purchase obligations, and ingest payment-provider outcomes as evidence without equating payment with fulfillment or unrestricted capital.
