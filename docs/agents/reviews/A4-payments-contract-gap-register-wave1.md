# A4 Payments — Wave 1 Contract and Gap Register

Status: TWO IMPLEMENTATION GATES CLOSED — ONE POLICY GATE OPEN — NO LIVE PROVIDER AUTHORITY
Baseline: integrated multi-agent control plane after A4-PAY-003

## Governing invariants
1. An obligation is not a payment intent, and neither is authoritative settlement.
2. Membership standing changes only from authoritative settlement evidence or an explicitly governed non-payment transition.
3. Annual membership fees are payable in full and non-refundable.
4. Founding-cohort shopping/promotional credit is a separately accounted club-funded benefit; it is not a refund of the membership fee.
5. Promotional credit expires one year after issuance and must fail closed after expiry.
6. Membership-fee overpayment is member-funded SHIPPING credit and must never become unrestricted merchandise credit.
7. A payroll/CAGD deduction mandate, request, schedule, acknowledgement, or file submission is not settlement.
8. Item-level credit creates a receivable; it must not masquerade as settled cash or reduce outstanding principal without authoritative repayment evidence.
9. Provider callbacks, imports, retries and reconciliation are idempotent by stable external reference plus governed event identity.
10. Refunds require lineage to the original authoritative settled transaction and cannot exceed refundable settled value.
11. A minimum-commitment threshold is governed policy. A commitment does not qualify merely because some payment exists; qualification requires authoritative settlement meeting the configured threshold.

## Wave 1 remediation gates

### A4-PAY-001 — CLOSED
Membership settlement mutation now requires verified, persisted payment evidence with durable evidence identity, provider reference, participant binding, obligation binding, verified amount and verification timestamp. Caller assertions cannot establish settlement. Replay cannot duplicate settlement or downstream overpayment credit.

Closure evidence: PR #75, exact-head GREEN constitutional conformance, integrated into the multi-agent control plane.

### A4-PAY-002 — POLICY/CONTRACT OPEN
UC-08 minimum-commitment payment threshold and qualification/reversal semantics remain unresolved. A3/A4 have no authority to choose a default percentage or amount.

Required policy decision must define:
- percentage versus fixed-amount semantics;
- rounding and currency behavior;
- timing/deadline for qualification;
- accumulation of partial authoritative settlements;
- qualification transition once threshold is reached;
- reversal behavior when previously qualified settlement falls below threshold;
- relationship between qualification and fulfillment eligibility.

Until explicitly authorized and implemented, UC-08 remains fail-closed and must not be represented as complete.

### A4-PAY-003 — CLOSED
Shortfall/refund authorization now requires a CONFIRMED same-obligation settlement with matching currency/economic treatment. Proposed refund value is capped by both exception-derived refundable value and remaining authoritative settled value after prior AUTHORIZED/COMPLETED refunds. Replay/rebound controls remain enforced.

Closure evidence: PR #76, exact-head GREEN constitutional conformance, integrated into the multi-agent control plane.

## Bounded future contracts

### CAGD/payroll deduction
`Mandate -> Submission -> Agency acceptance/rejection -> Payroll cycle -> Remittance evidence -> Reconciliation -> Authoritative settlement allocation`.

Only final reconciled remittance/settlement evidence may reduce an obligation. Failed, suspended, cancelled or unmatched mandates must not create paid status. No CAGD deductions are authorized by this register.

### Item-level credit / receivables
`Credit eligibility -> approved limit -> item-specific authorization -> receivable creation -> fulfillment eligibility -> repayment obligation -> authoritative repayment -> balance update`.

This remains unauthorized until explicit eligibility, limits, terms, persistence, repayment lineage, delinquency policy and falsification gates exist.

## Preserved accounting rules
- Annual membership fee: full annual payment only; non-refundable.
- Founding-cohort club-funded merchandise credit remains separately accounted from membership-fee settlement.
- Promotional credit expires one year after issuance.
- Membership-fee overpayment becomes member-funded SHIPPING credit only.
- Membership-fee refunds remain prohibited.

## Authority boundary
- Member may initiate payment or deduction consent but cannot attest settlement.
- Payment adapter may ingest provider evidence but cannot redefine membership or minimum-commitment policy.
- Reconciliation may match evidence but cannot fabricate provider evidence.
- Warehouse/delivery roles receive no payment mutation authority.
- System-owner feature control is not a bypass of settlement/refund invariants.
- No live Paystack, live credentials, live funds, CAGD deductions, item-level credit, Production payment mutation expansion or Production fulfillment mutation expansion is authorized.

## Wave 1 gate conclusion
A4-PAY-001 and A4-PAY-003 are implementation-closed and falsified on the integrated lineage. A4-PAY-002 remains deliberately open because its governing economic policy has not been authorized. Therefore A4 Wave 1 is implementation-complete for the two identified P1 defects but is not policy-complete and UC-08 remains fail-closed.