# A4 Payments — Wave 1 Contract Review

Status: REVIEW EVIDENCE UPDATED — REMEDIATION REQUIRED — INTEGRATION GATE BLOCKED
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
- UC-08 minimum-commitment qualification must fail closed until its governed threshold/qualification policy is explicitly decided and implemented.
- Existing shortfall refunds must not be treated as lineage-safe until tied to authoritative settlement and capped against refundable settled value.

## Evidence produced
- `docs/agents/reviews/A4-payments-contract-gap-register-wave1.md`
- `docs/business-logic-v2/decisions/A4-wave1-payments-review-2026-09-16.md`

## Open remediation gates
1. P1 — bind membership settlement mutation to durable verified provider/remittance evidence and status-mapping lineage.
2. UC-08 — govern minimum-commitment payment threshold and qualification/reversal semantics; no default percentage may be invented by A3/A4.
3. P1 — bind SW1-07/UC-26 shortfall refund authorization to original authoritative settlement and enforce aggregate refund <= refundable settled value.

A4 remains open until these gaps are remediated and falsified, or an explicit higher-authority gate disposition records why a gap is deferred without representing it as complete.

## Authority boundary
This work order grants no authority to enable live Paystack, live credentials, live funds, payroll deductions, Production payment mutation, fulfillment mutation, or self-merge.
