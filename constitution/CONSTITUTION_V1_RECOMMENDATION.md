# WorkersFoodClub Constitution v1.0 — Recommended C0-C10 Substantive Corpus

**Status: PROPOSED FOR SYSTEM OWNER RATIFICATION — NOT YET CONSTITUTIONAL AUTHORITY**

This document is a forward-looking recommended Constitution. It does **not** claim to reconstruct the missing historical C0-C10 wording. If ratified, it should explicitly supersede the inaccessible historical C0-C10 corpus while preserving CB-00-v0.1's 30 executable invariants and the owner-ratified Policy Register v1.1.

## C0 — Constitutional Supremacy, Truth and Amendment
1. The Constitution is the highest internal governance authority for WorkersFoodClub application behavior.
2. Authority hierarchy: Constitution -> System Owner-ratified Policy -> Domain Rules -> Server-side Implementation -> UI/Projection.
3. A lower layer may implement but may not silently amend a higher layer.
4. Canonical truth must be evidence-backed; projections, UI labels, model output and assertions cannot manufacture canonical state.
5. Corrections, reversals and restatements are additive/versioned; historical evidence is not silently rewritten.
6. Constitutional amendment requires explicit System Owner/designated Governance Authority ratification, versioning, traceability and conformance review.

## C1 — Identity, Membership and Access
1. Guest, membership eligibility, active membership rights, authentication and workforce authority are distinct.
2. Guests may access only the bounded non-member area without authentication.
3. Application creates no membership rights. Approval establishes eligibility. Active ordinary membership rights require confirmed annual subscription settlement; active employees may instead receive a governed employee-sponsored entitlement.
4. An unauthenticated Active Member has Guest access posture. Authentication is required for Member areas but cannot create membership.
5. Household beneficiaries have independent identities; shared credentials are not an authorization mechanism.

## C2 — Workforce Authority and Least Privilege
1. Membership and workforce standing are independent state machines.
2. Operator access requires dedicated workforce authentication/step-up beyond Member authentication.
3. Privileged authorization follows Identity -> Persona -> Domain -> Function -> Action/Task -> Constraints.
4. Default is DENY; no employment title or UI role implies authority.
5. System Owner appoints/revokes Admins. Admins grant/revoke bounded Operator authority. Admins cannot create/promote a System Owner.
6. Sensitive actions may require elevated authentication, reason/evidence, thresholds and/or second approval.

## C3 — Commitments, Obligations and Demand Truth
1. Forecasts, browsing, interest, baskets and history are not committed demand.
2. No obligation exists without an authorized relationship/event.
3. Qualified demand requires a valid commitment plus cumulative confirmed settlement meeting the governed offer threshold.
4. Offer-specific qualification thresholds are governed policy/configuration, not a universal constitutional percentage.
5. Below-threshold payment remains economic evidence but does not qualify demand.
6. Retries/replays cannot duplicate demand or economic effect; stale concurrency cannot violate quantity, authority or exposure constraints.

## C4 — Payments, Settlement, Credit and Payroll
1. Payment intent, authorization, settlement, reversal, discharge and refund are distinct states/events.
2. Payment initiation cannot create settlement, membership restoration, title or acceptance.
3. Overpayment is explicit economic state and cannot manufacture additional ordered quantity.
4. Reversal is additive and may alter current qualification without rewriting history.
5. Credit and payroll/CAGD deduction require separate explicit policy and activation authority; absence of such authority means WITHHELD.
6. Provider callbacks and external assertions cannot override canonical reconciliation rules.

## C5 — Supply, Procurement and Inventory Truth
1. Supply facets and sourcing obligations remain distinct and comparable only on equivalent governed terms; ABSTAIN is valid where equivalence is insufficient.
2. Every physical quantity change requires a traceable canonical event.
3. Transformations preserve provenance.
4. Unsafe, held, rejected or non-conforming quantity cannot become available merely through projection or operator assertion.
5. Reserves, cost bases, savings benchmarks, subsidies/promotions and future-price promises are governed and cannot masquerade as structural economic truth.
6. Security interests/encumbrances remain visible and unauthorized double pledge is prohibited.

## C6 — Fulfillment, Custody, Acceptance, Title and Risk
1. Allocation, possession, custody, control, handover, acceptance, title, physical-loss risk, settlement and discharge are orthogonal.
2. For the Ghana pilot transaction type, physical handover establishes custody only.
3. Canonical acceptance transfers title and ordinary physical-loss risk only for accepted quantity under the ratified transfer policy.
4. Partial acceptance is quantity-aware; excepted quantity remains governed until resolved.
5. Only conforming performed quantity is discharged.
6. Substitution/replacement must preserve promise, equivalence, consent, economics and provenance and constitutes a governed fulfillment instance.

## C7 — Remedies, Refunds, Returns and Exceptions
1. Refund request, approval and execution are separable authorities.
2. Refunds, credits, replacements and exceptions are additive events and do not erase original transactions.
3. Returns require governed quality determination.
4. Contradictory evidence is preserved until governed resolution.
5. Operators/Admins cannot rewrite canonical economic or physical history to create a desired outcome.

## C8 — Evidence, Audit, Recovery and Resilience
1. Evidence outranks projection; material decisions preserve model/input/assumption/authority lineage.
2. Audit records evidence and authority but does not manufacture authority.
3. Projections must disclose lineage/freshness and cannot corrupt canon.
4. Production recovery must have defined RPO/RTO, automated backup/snapshot capability, adequate retention, documented recovery procedure, periodic restore drills and durable restore evidence.
5. Backup existence without restore proof is insufficient.
6. Idempotency, concurrency safety and recovery are constitutional qualities wherever duplicate or stale execution could alter economic, physical or authority truth.

## C9 — Human Governance, Policy and Reserved Authority
1. System Owner/designated Governance Authority ratifies or amends business policy and constitutional text.
2. Agents may analyze, propose, test and implement ratified decisions but cannot exercise reserved human governance authority.
3. Admins/Operators execute delegated policy; implementation or configuration cannot create governing policy outside delegated authority.
4. High-risk economic, authority and production capabilities remain fail-closed until explicit authorization and required evidence exist.
5. Legal or regulatory conclusions must not be fabricated by code; where external review is required, it remains an explicit evidence gate.

## C10 — Launch, Activation and Safety Boundaries
1. Technical readiness, business-journey proof and launch authorization are distinct statuses.
2. A capability is not launch-authorized merely because code exists, tests pass, a provider is configured, or a UI is accessible.
3. Live-money, payment, refund, fulfillment, credit, payroll and other material mutations require explicit activation authority plus applicable runtime/evidence gates.
4. WITHHELD means fail-closed until separately authorized; architectural support does not equal operational authority.
5. Production activation decisions must be versioned, attributable and reversible/containable where feasible.
6. No launch action may weaken C0-C9 or CB-00 invariants without a separately ratified constitutional amendment.

## Ratification recommendation
If accepted, ratification should:
1. designate this text as `WorkersFoodClub Constitution v1.0`;
2. state explicitly that it supersedes the inaccessible historical C0-C10 substantive corpus rather than claiming to reproduce it;
3. preserve CB-00-v0.1's 30 executable invariants as the machine-testable constitutional baseline unless a separately ratified amendment changes them;
4. update `constitution/baseline.json` only after exact-head conformance succeeds;
5. retain Policy Ratification Register v1.1 as subordinate owner-ratified policy authority;
6. preserve all current WITHHELD live-money and Production mutation boundaries unless separately authorized.
