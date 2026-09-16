# A4 Payments — Wave 1 Contract and Gap Register

Status: REVIEW EVIDENCE — REMEDIATION GAPS RECORDED — NO LIVE PROVIDER AUTHORITY
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
10. Refunds require lineage to the original authoritative settled transaction and cannot exceed refundable settled value.
11. A minimum-commitment threshold is governed policy. A commitment does not qualify merely because some payment exists; qualification requires authoritative settlement meeting the configured threshold.

## Contract / gap register

| Area | Required contract | Current evidence | Gap / disposition |
|---|---|---|---|
| Membership obligation | invoice/obligation has amount, due date, participant and state | A2 billing implementation/tests | Implemented for membership domain; preserve full-annual-payment rule. |
| Membership settlement evidence | authoritative evidence distinct from intent/initiation, persisted with verification/status-mapping lineage | A2 `recordAuthoritativeSettlement`; separate commerce provider verification | **OPEN P1.** `recordAuthoritativeSettlement` accepts caller-supplied amount/reference and can mark the invoice settled without itself requiring persisted verified-provider evidence. Membership settlement must be bound to verified evidence before this boundary is considered authoritative. |
| Membership fee refund | annual fee is non-refundable | governing business rule | No membership-fee refund path may be introduced. |
| Founding cohort credit | club-funded merchandise credit separately ledgered | A2 credit implementation/tests | Implemented accounting separation; campaign eligibility remains governed policy. |
| Promotional credit expiry | fixed one-year expiry | A2 credit implementation + A11 expiry falsification | Implemented and cross-agent falsified. |
| Fee overpayment | excess becomes SHIPPING credit | A2 billing/credit implementation + A11 applicability falsification | Implemented and cross-agent falsified. |
| UC-08 minimum commitment payment | qualification requires authoritative settled value meeting a governed minimum threshold | existing commitment/payment journey; A3 is not authorized to choose the default percentage | **OPEN POLICY/CONTRACT GAP.** The default minimum-payment percentage and commitment-qualification behavior are not yet governed. No percentage is inferred by this review. Until explicitly decided and implemented, the integration gate must not claim UC-08 complete. |
| CAGD/payroll deduction | mandate/request != settlement; stable mandate and remittance lineage | not yet implemented | BOUNDED FUTURE CONTRACT. Requires agency/provider interface, mandate lifecycle, remittance file/API reconciliation, reversals and exception queue before implementation. |
| Item-level credit | purchase creates receivable with principal, terms, status and repayment lineage | not yet implemented | BOUNDED FUTURE CONTRACT. Requires explicit product eligibility/limit policy and receivables ledger before implementation. |
| Payment idempotency | duplicate provider evidence cannot duplicate settlement/credit | existing durable payment/replay tests plus A2 source-reference uniqueness | Boundary exists; future adapters must share canonical idempotency key policy. |
| Reconciliation | internal settlement must reconcile to provider/remittance evidence | existing payment durability/reconciliation posture | Membership evidence binding is still open; extend reconciliation to CAGD and receivables before those features are authorized. |
| Existing shortfall refund lineage (UC-26 / SW1-07) | refund references original authoritative settlement and aggregate refunds cannot exceed refundable settled value | `api/authorize-refund.js` shortfall remedy | **OPEN P1.** Existing shortfall refund authorization is commitment/fulfillment-exception based and is not yet proven to link the remedy to the original authoritative settlement or cap aggregate refund value against settled value. This is a current remediation gap, not a future-only contract. |

## Required membership settlement remediation contract
`Verified provider/remittance evidence -> persisted evidence identity/status mapping -> reconciliation -> authoritative settlement allocation -> membership standing transition`.

The settlement mutation must consume or reference durable verified evidence. Caller assertions, payment intent, provider acknowledgement, or an arbitrary reference are insufficient. Replays must resolve to the same evidence identity and must not duplicate settlement or downstream credit issuance.

## UC-08 minimum-commitment contract
`Commitment obligation -> governed minimum-payment policy -> authoritative settlement evidence -> settled amount comparison -> qualification or fail-closed non-qualification`.

The default minimum-payment percentage is deliberately unresolved. A3/commerce code must not invent it. The policy must define percentage/amount semantics, rounding, currency, timing, partial-settlement accumulation, reversals, and what happens when a previously qualified commitment falls below threshold after a reversal.

## Existing shortfall-refund remediation contract
`Original authoritative settlement -> fulfillment shortfall/exception -> refundable-value calculation -> authorized refund -> provider refund execution/evidence -> aggregate refund reconciliation`.

Refund authorization must carry lineage to the original settlement, enforce `aggregate_refunded_minor + proposed_refund_minor <= refundable_settled_minor`, remain idempotent under retries, and preserve immutable evidence for authorization, execution, failure and reconciliation. Membership fees remain non-refundable and outside this flow.

## Required future CAGD contract
`Mandate -> Submission -> Agency acceptance/rejection -> Payroll cycle -> Remittance evidence -> Reconciliation -> Authoritative settlement allocation`.

Only the final reconciled remittance/settlement evidence may reduce an obligation. Failed, suspended, cancelled or unmatched mandates must not create paid status.

## Required future item-credit contract
`Credit eligibility -> approved limit -> item-specific authorization -> receivable creation -> fulfillment eligibility -> repayment obligation -> authoritative repayment -> balance update`.

Minimum fields: receivable ID, participant ID, order/line ID, SKU/offer version, principal, currency, approved terms, due schedule, outstanding principal, state, authorization lineage, settlement references and immutable event timestamps.

## Authority and separation of duties
- Member may initiate payment or deduction consent but cannot attest settlement.
- Payment adapter may ingest provider evidence but cannot redefine membership or minimum-commitment policy.
- Reconciliation process may match evidence but cannot fabricate provider evidence.
- Operator roles require explicit payment/refund permissions; warehouse/delivery roles receive no payment mutation authority.
- System owner feature control is not a universal bypass of settlement or refund-lineage invariants.

## Replay / race / recovery requirements
- Stable external references are unique within provider/rail namespace.
- Duplicate callbacks/import rows are no-ops after the first authoritative application.
- Concurrent settlement attempts serialize or conflict safely; total applied settlement cannot exceed verified evidence received.
- Credit issuance caused by settlement is atomic with, or recoverably linked to, the settlement event.
- Refund retries cannot duplicate authorized/executed refund value; aggregate refunds remain capped by refundable settled value.
- Reconciliation can identify missing, duplicated, unmatched and reversed evidence without silently changing truth.
- Restore/backup proof must preserve obligation, settlement, credit, refund and receivable lineage.

## Consequential decisions still requiring explicit authority
1. UC-08 default minimum-commitment payment percentage/amount and qualification/reversal policy.
2. CAGD integration mechanism and agency contract/API/file specification.
3. Item-level credit eligibility, limits, term length, fees/interest (if any), delinquency and write-off policy.
4. Refundability policy and approval thresholds for commerce classes beyond the already-existing shortfall remedy.
5. Canonical provider-agnostic idempotency namespace when additional payment rails are introduced.

## Gate conclusion
A4 does not authorize live Paystack, live credentials, live funds, CAGD deductions, item-level credit, Production payment mutation expansion or fulfillment mutation expansion. Three material Wave 1 gaps are now explicit: membership settlement is not yet bound to persisted verified evidence; UC-08 minimum-commitment policy/qualification is unresolved; and the existing shortfall-refund flow lacks proven settlement lineage/capping. These must be remediated or explicitly gated before A4 can be marked complete.