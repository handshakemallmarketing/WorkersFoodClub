# GH-PILOT-TITLE-RISK-v1

Status: OWNER-RATIFIED — GOVERNANCE/LEGAL EVIDENCE PENDING
Policy ID: GH-PILOT-TITLE-RISK
Version: 1
Owner ratification date: 2026-09-19
Transaction type: GH_PILOT_MEMBER_FOOD_ORDER
Jurisdictional context: Ghana pilot
Authority: WorkersFoodClub Policy Ratification Register v1.1 PR-21 through PR-23, PR-25 and PR-26

## Purpose
This policy separates payment, custody, title, physical-loss risk, acceptance, exception and remedy for the Ghana WorkersFoodClub pilot. The System Owner has ratified the business-policy content. This ratification is not a representation that Ghana law has been finally interpreted, that external legal review has occurred, or that production release is authorized.

## Governing rules
1. Payment or provider settlement creates payment evidence and may discharge a payment obligation; it does not by itself transfer title, custody or physical-loss risk in goods.
2. Physical handover transfers custody only. Custody is not title and is not acceptance.
3. TITLE transfers only on canonical ACCEPTANCE of the relevant quantity.
4. Ordinary physical-loss RISK transfers only on canonical ACCEPTANCE of the relevant quantity.
5. Partial acceptance transfers title and risk only for accepted quantity. Rejected, missing, damaged, non-conforming or excepted quantity remains on the Food Club/supply side until governed disposition.
6. A fulfillment exception does not manufacture acceptance, title transfer or risk transfer.
7. Refund authorization/completion does not rewrite historical handover/acceptance evidence.
8. Replacement goods are a new governed fulfillment instance and acquire title/risk under the same acceptance rule unless later ratified policy changes it.
9. No UI label, provider callback, operator assertion, DELIVERED-like event, settlement event or arbitrary caller payload may substitute for canonical ACCEPTANCE.
10. Corrections are additive; historical events may not be deleted or mutated to simulate a different transfer outcome.

## Ratified trigger binding
- title.dimension = TITLE
- title.trigger = ACCEPTANCE
- risk.dimension = RISK
- risk.trigger = ACCEPTANCE
- transactionType = GH_PILOT_MEMBER_FOOD_ORDER

## Quantity semantics
Every trigger event contributing to title or risk must carry a positive quantity in the transaction unit. Matching trigger quantities accumulate monotonically, cannot exceed governed transaction total, and preserve contributing event IDs. Non-trigger events cannot increase title/risk quantity. Partial acceptance transfers only accepted quantity; later replacement acceptance may complete the remainder without rewriting earlier events. The legacy boolean evaluator MUST NOT be used as the production source of truth for partial-quantity decisions.

## Remaining production evidence gates
Owner policy authority is supplied. Production evidence still requires exact policy/version governance binding, executable registry synchronization, green quantity-aware conformance/integrated evidence, runtime/adverse/recovery evidence, and any required Ghana legal review recorded as external evidence.

## Non-claims
This policy does not claim legal advice, statutory interpretation, universal Ghana title-transfer rules, or that payment/handover/settlement/acceptance are legally synonymous. Owner ratification does not by itself authorize production release or live-money/fulfillment mutations.
