# Food Club Ghana — SW0-05
Demand Request, Purchase Commitment & Payment Evidence Slice — v0.4.0-alpha.1

**Baseline:** CB-00 v0.1 / SW0-01 v0.1  
**Predecessor:** SW0-04 v0.3.0-alpha.1  
**Status:** PARTIAL GREEN — demand/commitment/payment-evidence distinctions proven; persistence, physical allocation, fulfillment and savings remain open.

## What changed
- Added DemandSignal records for FORECAST, INTEREST and REQUEST without letting any signal silently become committed demand.
- Added explicit purchase acceptance into a canonical Obligation only with active Membership, an executable MemberOffer and attributed authorized command/event identity.
- Preserved the source DemandSignal as optional lineage rather than as authority to create an obligation.
- Added PaymentEvidenceRecord for provider outcomes without equating provider confirmation with fulfillment, discharge or earned revenue.
- Classified member prepayment as RESTRICTED_MEMBER_PREPAYMENT with `earnedRevenue=false` and `unrestrictedCapital=false`.
- Added duplicate provider-reference protection and cross-specification/stale-offer rejection.
- Added executable SW0-05 proofs, traceability supplement and release evidence.
- Advanced INV-003 and INV-004 to PARTIAL_GREEN without claiming database-backed atomicity or provider integration.

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
SW0-05 does **not** claim overall SW0 conformance. It proves that forecast, interest and request are signals rather than obligations; a purchase obligation exists only after explicit authorized acceptance; and payment-provider confirmation remains evidence linked to an obligation rather than proof of fulfillment or unrestricted capital.

Database-backed checkout atomicity, provider adapters, allocation, lot control, pickup/acceptance, remedies and savings remain subsequent slices.

## Next slice
**SW0-06 — Lot Receipt, Quality State & Allocation Slice**: introduce traceable Lots, receipt evidence, quality state and allocation against open member obligations while proving no negative stock and no double allocation.
