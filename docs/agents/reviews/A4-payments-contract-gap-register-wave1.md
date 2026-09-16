# A4 Payments — Wave 1 Contract and Gap Register

Status: REVIEW EVIDENCE — NO LIVE PROVIDER AUTHORITY
Baseline: integrated Wave 1 control plane after A11

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
10. Refunds, where a refundable transaction class exists, require lineage to the original settled transaction and cannot exceed refundable settled value.

## Contract / gap register

| Area | Required contract | Current evidence | Gap / disposition |
|---|---|---|---|
| Membership obligation | invoice/obligation has amount, due date, participant and state | A2 billing implementation/tests | Implemented for membership domain; preserve full-annual-payment rule. |
| Settlement | authoritative evidence distinct from intent/initiation | A2 `recordAuthoritativeSettlement`; existing payment durability boundaries | Implemented boundary; provider adapters must map only verified settlement into it. |
| Membership fee refund | annual fee is non-refundable | governing business rule | No membership-fee refund path may be introduced. Refund contract applies only to separately refundable commerce transactions. |
| Founding cohort credit | club-funded merchandise credit separately ledgered | A2 credit implementation/tests | Implemented accounting separation; campaign eligibility remains governed policy. |
| Promotional credit expiry | fixed one-year expiry | A2 credit implementation + A11 expiry falsification | Implemented and cross-agent falsified. |
| Fee overpayment | excess becomes SHIPPING credit | A2 billing/credit implementation + A11 applicability falsification | Implemented and cross-agent falsified. |
| CAGD/payroll deduction | mandate/request != settlement; stable mandate and remittance lineage | not yet implemented | BOUNDED FUTURE CONTRACT. Requires agency/provider interface, mandate lifecycle, remittance file/API reconciliation, reversals and exception queue before implementation. |
| Item-level credit | purchase creates receivable with principal, terms, status and repayment lineage | not yet implemented | BOUNDED FUTURE CONTRACT. Requires explicit product eligibility/limit policy and receivables ledger before implementation. |
| Payment idempotency | duplicate provider evidence cannot duplicate settlement/credit | existing durable payment/replay tests plus A2 source-reference uniqueness | Boundary exists; future adapters must share canonical idempotency key policy. |
| Reconciliation | internal settlement must reconcile to provider/remittance evidence | existing payment durability/reconciliation posture | Extend reconciliation to CAGD and receivables before those features are authorized. |
| Refund lineage | refund references original refundable settlement and is capped | not implemented for new commerce flows | Define only when refundable commerce transaction types are introduced; membership fee remains excluded. |

## Required future CAGD contract
`Mandate -> Submission -> Agency acceptance/rejection -> Payroll cycle -> Remittance evidence -> Reconciliation -> Authoritative settlement allocation`.

Only the final reconciled remittance/settlement evidence may reduce an obligation. Failed, suspended, cancelled or unmatched mandates must not create paid status.

## Required future item-credit contract
`Credit eligibility -> approved limit -> item-specific authorization -> receivable creation -> fulfillment eligibility -> repayment obligation -> authoritative repayment -> balance update`.

Minimum fields: receivable ID, participant ID, order/line ID, SKU/offer version, principal, currency, approved terms, due schedule, outstanding principal, state, authorization lineage, settlement references and immutable event timestamps.

## Authority and separation of duties
- Member may initiate payment or deduction consent but cannot attest settlement.
- Payment adapter may ingest provider evidence but cannot redefine membership policy.
- Reconciliation process may match evidence but cannot fabricate provider evidence.
- Operator roles require explicit payment/refund permissions; warehouse/delivery roles receive no payment mutation authority.
- System owner feature control is not a universal bypass of settlement invariants.

## Replay / race / recovery requirements
- Stable external references are unique within provider/rail namespace.
- Duplicate callbacks/import rows are no-ops after the first authoritative application.
- Concurrent settlement attempts serialize or conflict safely; total applied settlement cannot exceed evidence received.
- Credit issuance caused by settlement is atomic with, or recoverably linked to, the settlement event.
- Reconciliation can identify missing, duplicated, unmatched and reversed evidence without silently changing truth.
- Restore/backup proof must preserve obligation, settlement, credit and receivable lineage.

## Consequential decisions still requiring explicit authority
1. CAGD integration mechanism and agency contract/API/file specification.
2. Item-level credit eligibility, limits, term length, fees/interest (if any), delinquency and write-off policy.
3. Which commerce transaction classes, if any, are refundable and under what approval thresholds.
4. Canonical provider-agnostic idempotency namespace when additional payment rails are introduced.

## Gate conclusion
A4 finds no basis to authorize live Paystack, live credentials, live funds, CAGD deductions, item-level credit, Production payment mutation expansion or fulfillment mutation expansion. Existing A2 accounting rules are compatible with the required separation-of-truth model. CAGD, item credit and new refund flows remain design contracts until their policy decisions, persistence, adapters, reconciliation and adversarial tests are implemented.