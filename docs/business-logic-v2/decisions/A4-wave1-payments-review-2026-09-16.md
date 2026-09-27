# Decision Register — A4 Wave 1 Payments — 2026-09-16

## Preserved decisions
- Annual membership fee is payable in full and non-refundable.
- Founding-cohort club-funded shopping/promotional credit is separately accounted from fee settlement.
- Promotional credit expires after one year.
- Membership-fee overpayment is member-funded SHIPPING credit.
- Settlement cannot be inferred from intent, provider acknowledgement, CAGD mandate, deduction request or scheduled deduction.

## Gate dispositions
- A4-PAY-001: CLOSED. Verified persisted payment evidence is required for membership settlement. Closure integrated through PR #75 after exact-head GREEN conformance.
- A4-PAY-002: OPEN — POLICY DECISION REQUIRED. No default UC-08 minimum-payment percentage/amount is authorized. UC-08 remains fail-closed.
- A4-PAY-003: CLOSED. Refund authorization is bound to confirmed same-obligation settlement and cumulative refund value is capped by remaining settled value. Closure integrated through PR #76 after exact-head GREEN conformance.

## A4-PAY-002 authority requirement
Before implementation, explicit authority must decide threshold form/value, rounding, currency, timing, partial-payment accumulation, reversal behavior, and the relationship between payment qualification and fulfillment eligibility. A3/A4 must not infer these values.

## Deferred contracts, not completed features
- CAGD/payroll deduction requires mandate/remittance/reconciliation contracts and remains unauthorized.
- Item-level credit requires a receivables contract, eligibility/limit policy and repayment lineage and remains unauthorized.
- Additional payment rails require provider-agnostic idempotency/reconciliation governance.

## Authority boundary
No live Paystack, live credentials, live funds, CAGD deductions, item-level credit, Production payment mutation expansion or Production fulfillment mutation expansion is authorized by this decision record.