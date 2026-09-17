# A8 Wave 2 — Engagement / Referral Contract-Gap Review

Baseline: 70d44118044a4077eafee8b4f9a3ef7b673031a9
Scope: UC-14 product_request_survey; UC-15 referral_reward
Disposition: CONTRACT-FIRST — IMPLEMENTATION NOT YET AUTHORIZED BEYOND RATIFIED INVARIANTS

## Canonical invariants
- UC-14: survey_interest_is_not_commitment.
- UC-15: reward_requires_proven_qualifying_event.
- Membership eligibility remains an upstream prerequisite.
- Engagement records cannot create authoritative demand, settlement, inventory, fulfillment or delivery truth.

## Repository finding
No canonical referral-reward implementation or support for a durable UC-14/UC-15 lifecycle was found in the reviewed baseline. Wave 2 must therefore define bounded contracts before adding behavior rather than adapting unrelated legacy state.

## A8-ENG-001 — Product-request survey truth separation — OPEN
Required contract:
- durable survey response identity;
- participant lineage;
- product/request subject;
- response timestamp and optional governed preference fields;
- replay/idempotency identity;
- explicit non-authoritative economic classification.

Required falsification:
- duplicate submission does not create duplicate canonical response;
- survey response cannot create basket, commitment, obligation or pooled demand;
- wrong participant lineage fails closed;
- expired/ineligible membership cannot be silently promoted into commerce authority.

## A8-ENG-002 — Referral qualification evidence — OPEN
A referral relationship is not itself a qualifying event. Reward issuance must consume a separately proven qualifying event whose type is governed and whose participant/referrer/referee lineage is durable.

Required contract:
- referral identity and referrer/referee lineage;
- qualifying-event type and immutable event reference;
- qualification timestamp;
- reward issuance idempotency key;
- one-to-one or governed multiplicity constraint between qualifying event and reward.

Required falsification:
- self-referral fails closed unless canon explicitly permits it;
- fabricated event reference fails closed;
- event belonging to another referee fails closed;
- replay cannot duplicate reward;
- revoked/invalid qualifying event cannot remain reward-eligible without governed reversal semantics.

## A8-ENG-003 — Referral reward economics — POLICY BLOCKED
The reviewed artifacts do not authorize A8 to invent reward value, currency, reward type, expiry, caps or campaign economics. These are consequential business policy. Until ratified, A8 may implement qualification/evidence boundaries only; economic issuance must remain fail-closed or use an already-ratified reward policy if one is later identified and independently reviewed.

## Authority boundary
A8 may define evidence/state contracts and adversarial tests within canon. A8 may not create authoritative demand from survey interest, invent reward economics, bypass membership eligibility, activate live communications providers, or expand Production mutation authority.

## Recommended implementation sequence
1. Implement durable survey-response contract with explicit NON_COMMITMENT classification.
2. Add negative tests proving no commerce/demand side effect.
3. Implement referral + qualifying-event evidence contract without monetary issuance.
4. Add replay/lineage/self-referral falsification.
5. Hold reward economic issuance behind A8-ENG-003 until policy authority exists.
