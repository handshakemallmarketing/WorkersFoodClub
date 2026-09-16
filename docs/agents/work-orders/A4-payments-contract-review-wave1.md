# A4 Payments — Wave 1 Contract Review

Status: ACTIVE — REVIEW ONLY
Parent control plane: `cb467afd2bdaea85f41e32a23239c26c6960e6c4`

## Bounded scope
Review obligations, settlement, refunds, annual membership-fee accounting, shopping/promotional/shipping credit contracts, payroll-deduction integration boundaries and future item-level credit/receivables contracts against already-proven payment behavior.

## Mandatory constraints
- Annual membership fee is paid in full and non-refundable.
- Founding cohort policy may issue separately accounted shopping/promotional credit only under its explicit governed contract.
- Promotional credit expires after one year.
- Membership-fee overpayment is shipping credit, not unrestricted merchandise credit.
- No inference of settlement from intent, initiation, provider acknowledgement or payroll-deduction request.
- Item-level credit and CAGD deductions remain bounded contracts until separately authorized and implemented.

## Evidence required
Contract/gap register, accounting invariants, authority review, replay/reconciliation requirements and explicit consequential-decision escalations.

## Authority boundary
This work order grants no authority to enable live Paystack, live credentials, live funds, payroll deductions, Production payment mutation, fulfillment mutation, or self-merge.