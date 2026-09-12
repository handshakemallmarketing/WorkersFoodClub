# GH-PILOT-TITLE-RISK-v1

Status: DRAFT — NOT RATIFIED
Policy ID: GH-PILOT-TITLE-RISK
Version: 1
Transaction type: GH_PILOT_MEMBER_FOOD_ORDER
Jurisdictional context: Ghana pilot

## Purpose
This policy separates payment, custody, title, physical-loss risk, acceptance, exception and remedy for the Ghana Workers Food Club pilot. It is a business-governance policy candidate, not a representation that Ghana law has been finally interpreted or that the policy has been legally ratified.

## Governing rules
1. Payment or provider settlement creates payment evidence and may discharge a payment obligation; it does not by itself transfer title, custody or physical-loss risk in goods.
2. Physical handover transfers custody only. Custody is not title and is not acceptance.
3. For the pilot transaction type, TITLE transfers only on canonical ACCEPTANCE of the relevant quantity.
4. For the pilot transaction type, ordinary physical-loss RISK transfers only on canonical ACCEPTANCE of the relevant quantity. This conservative pilot rule intentionally keeps risk with the Food Club/supply side during the inspection interval after handover and before acceptance.
5. Partial acceptance transfers title and risk only for the accepted quantity. Rejected, missing, damaged, non-conforming or otherwise excepted quantity remains on the Food Club/supply side until a governed replacement is accepted or another governed disposition is completed.
6. A fulfillment exception does not manufacture acceptance, title transfer or risk transfer for the excepted quantity.
7. Refund authorization does not reverse historical events. Refund completion records the financial remedy; it does not rewrite the historical handover/acceptance record.
8. Replacement goods are a new governed fulfillment instance and acquire title/risk only under the same acceptance rule unless a later ratified policy version explicitly changes the rule.
9. No UI label, provider callback, operator assertion, DELIVERED-like event, settlement event or arbitrary caller payload may substitute for the canonical trigger named by the ratified policy.
10. Corrections are additive. No operator may delete or mutate historical events to simulate a different transfer outcome.

## Trigger binding proposed for ratification
- title.dimension = TITLE
- title.trigger = ACCEPTANCE
- risk.dimension = RISK
- risk.trigger = ACCEPTANCE
- transactionType = GH_PILOT_MEMBER_FOOD_ORDER

## Quantity semantics
The transfer evaluator now exposes an additive quantity-aware path. Every trigger event that contributes to title or risk must carry a positive quantity in the transaction unit. Matching trigger quantities accumulate monotonically, cannot exceed the governed transaction total, and preserve the contributing event IDs. Non-trigger events such as settlement, handover, exceptions and refund completion cannot increase title/risk quantity under this policy. Partial acceptance therefore transfers only the accepted quantity; later replacement acceptance may complete the remainder without rewriting earlier events.

The legacy boolean evaluator remains available for earlier slices but MUST NOT be used as the production source of truth for partial-quantity title/risk decisions.

## Ratification condition
This document remains DRAFT and cannot satisfy production TITLE_RISK_POLICY evidence until:
- an authorized governance actor approves the policy content;
- a valid TRANSFER_POLICY_GOVERNANCE grant exists for this exact policy;
- ratification evidence is recorded;
- the executable policy registry contains the exact ratified version;
- quantity-aware transfer semantics remain green under conformance and integrated pilot evidence; and
- any required Ghana legal review is recorded as external evidence rather than inferred by code.

## Non-claims
This draft does not claim legal advice, statutory interpretation, universal Ghana title-transfer rules, or that payment/handover/settlement/acceptance are legally synonymous. It does not authorize production release.
