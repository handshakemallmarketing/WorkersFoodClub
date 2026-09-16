# A4 Payments — Wave 1 Contract Review

Status: REVIEW EVIDENCE COMPLETE — INTEGRATION GATE PENDING
Parent control plane: `ada86a176cbce63f2e5d8bb2ed6db71fa0f6e8a6`

## Bounded scope
Review obligations, settlement, refunds, annual membership-fee accounting, shopping/promotional/shipping credit contracts, payroll-deduction integration boundaries and future item-level credit/receivables contracts against already-proven payment behavior.

## Mandatory constraints
- Annual membership fee is paid in full and non-refundable.
- Founding cohort policy may issue separately accounted shopping/promotional credit only under its explicit governed contract.
- Promotional credit expires after one year.
- Membership-fee overpayment is shipping credit, not unrestricted merchandise credit.
- No inference of settlement from intent, initiation, provider acknowledgement or payroll-deduction request.
- Item-level credit and CAGD deductions remain bounded contracts until separately authorized and implemented.

## Evidence produced
- `docs/agents/reviews/A4-payments-contract-gap-register-wave1.md`
- `docs/business-logic-v2/decisions/A4-wave1-payments-review-2026-09-16.md`

The review records accounting invariants, contract/gap disposition, authority separation, replay/race/recovery requirements and consequential decisions that remain explicitly unresolved.

## Authority boundary
This work order grants no authority to enable live Paystack, live credentials, live funds, payroll deductions, Production payment mutation, fulfillment mutation, or self-merge.
