# A1 Independent Conformance Review — Wave 1 — 2026-09-16

Reviewer role: A1 constitutional/conformance review
Reviewed lineage: business-logic-v2/a4-wave1-register-reconciled
Disposition: PASS WITH EXPLICIT POLICY BLOCKER — UC-08 MUST REMAIN FAIL-CLOSED

## Scope
Independent review of Wave-1 work assigned to A2, A3, A4, A9 and A11, including authority boundaries, constitutional discipline, cross-domain truth separation, adverse-case evidence and the reconciled A4 payment register.

## Governing review rules
- Code may implement canon; code may not silently amend canon.
- Authority is default-deny.
- Human-only authority includes live Paystack activation, live credentials, live funds, Production payment/fulfillment mutation expansion and consequential business policy not already ratified.
- A1 may review/reject/require falsification but may not silently change business policy.
- A11 may falsify but may not author or approve the feature under test.
- Shared-contract changes require A1 review and A0 integration.
- A journey is incomplete until authority, economic/physical truth, adverse cases, audit lineage and recovery evidence are proven.

## Findings

### A2 — Membership / household / membership billing
PASS for Wave-1 implemented scope.

Observed boundary preservation:
- eligibility activation requires governed evidence/decision lineage;
- duplicate active membership is rejected;
- beneficiary invitation/activation fails closed for forged/expired tokens and enforces configured slot ceilings;
- annual membership fee remains full-payment-only and non-refundable;
- membership standing is restored only after authoritative settlement evidence;
- founding/promotional credit remains separately accounted from membership settlement;
- overpayment remains member-funded SHIPPING credit rather than unrestricted merchandise value.

A2 did not choose unratified membership economics during this wave.

### A3 — Catalog / offers / basket / commitment
PASS for Wave-1 implemented scope, subject to UC-08 dependency.

Observed boundary preservation:
- basket remains distinct from commitment;
- stale offer/version and quantity-policy violations fail closed;
- replay does not double authoritative pooled demand;
- A3 did not invent the UC-08 minimum-payment threshold.

A3 commitment/payment qualification must continue to defer to governed A4 policy once UC-08 is ratified.

### A4 — Economic obligation / settlement / refund
PASS for PAY-001 and PAY-003; POLICY BLOCKER preserved for PAY-002.

A4-PAY-001 closure:
- settlement requires verified persisted evidence;
- evidence is bound to participant and obligation;
- caller assertions cannot manufacture settlement;
- replay cannot duplicate economic allocation.

A4-PAY-003 closure:
- refund authorization requires confirmed same-obligation settlement;
- currency/economic treatment must match;
- cumulative authorized/completed refunds reduce remaining settled value;
- refund is capped by both exception-derived refundable value and remaining authoritative settlement.

A4-PAY-002 / UC-08:
- no percentage or fixed amount is constitutionally authorized by the reviewed artifacts;
- rounding, timing, partial-settlement accumulation and reversal semantics remain unratified;
- therefore UC-08 must remain fail-closed and must not be represented as complete.

No live Paystack, live funds, CAGD deduction, item-level credit or Production payment mutation expansion is authorized by this review.

### A9 — Operator authority / governance
PASS for Wave-1 implemented scope.

Observed boundary preservation:
- authority remains grant-based and bounded;
- warehouse/operator roles cannot acquire feature-management authority by assertion;
- revoked authority fails closed;
- owner feature mutations retain grant lineage;
- no unbounded superuser bypass is authorized.

Named-human owner assignment and other human-only authority remain outside delegated agent authority.

### A11 — Cross-domain falsification
PASS for Wave-1 falsification role.

Observed independence and adverse coverage include:
- past-due membership cannot create authoritative demand;
- authoritative settlement can restore eligible standing without caller-trusted settlement assertion;
- expired promotional credit contributes no current merchandise balance;
- shipping overpayment credit cannot become merchandise credit;
- commitment replay cannot double pooled demand;
- stale offer cannot create pooled demand;
- unauthorized/revoked operator authority fails closed;
- A4 settlement and refund boundaries have dedicated adversarial regression coverage.

No evidence was found that A11 authored the production feature under test or self-approved a feature implementation.

## Journey mapping
Wave-1 evidence materially covers UC-01 through UC-09 where assigned, UC-16/UC-17 governance boundaries, and the A4 refund invariant used by UC-26. UC-08 remains intentionally incomplete because its consequential economic threshold is unratified. Later journeys owned by A5-A10 are not declared complete by this review.

## Integration-gate assessment
- builder_tests_green: PASS based on exact-head constitutional-conformance runs for the integrated A4 remediation lineage and reconciled register head.
- A1_conformance_pass: PASS WITH EXPLICIT UC-08 POLICY BLOCKER; this means reviewed implemented scope conforms, not that UC-08 is complete.
- CI_green: PASS on reviewed exact head at time of review.
- A11_falsification_pass: PASS for Wave-1 implemented scope.
- decision_register_current: PASS after A4 Wave-1 reconciliation.
- preview_evidence: prior Preview evidence exists for the established SW1/RC runtime surfaces, but this A1 record does not authorize new Production or live-provider behavior.

## A1 conclusion
The implemented Wave-1 changes reviewed here conform to the governing authority and truth-separation rules. A2, A3, A4 and A9 stayed within their delegated boundaries, and A11 provided independent adversarial coverage for the implemented scope. The unresolved UC-08 minimum-commitment payment policy is correctly treated as a blocker rather than silently invented.

A1 therefore records a CONFORMANCE PASS for the implemented Wave-1 scope, conditional on preserving UC-08 as fail-closed until an authorized human policy decision defines its threshold and associated semantics. This review does not authorize live Paystack, live credentials, live funds, CAGD deductions, item-level credit, Production payment mutation expansion or Production fulfillment mutation expansion.