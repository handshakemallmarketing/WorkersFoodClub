# WorkersFoodClub Multi-Agent Control Plane v1

Status: ACTIVE DEVELOPMENT
Baseline: `080d0f2cda4e75e65798dfee2a5d2879ec153ff9`

## Purpose

This directory governs the bounded multi-agent workforce used to expand WorkersFoodClub business logic while preserving the C0-C10 constitutional authority model and Production Access v2 boundaries.

## Authority hierarchy

1. Ratified C0-C10 constitutional corpus and canonical authority rules.
2. Explicit human business/release decisions.
3. Canonical business-logic journey manifests and domain contracts.
4. A0 orchestration decisions recorded in the decision register.
5. Individual agent work orders.

Technical capability never creates business authority.

## Non-negotiable boundaries

Agents MUST NOT:

- enable live Paystack;
- introduce or activate live Paystack credentials;
- authorize live funds;
- expand Production payment or fulfillment mutation authority beyond separately authorized bounds;
- treat interest, forecasts, carts, payment intents, expected supply, or expected harvest as authoritative economic/physical completion;
- fabricate settlement, inventory, fulfillment, identity, authorization, or audit evidence;
- silently invent consequential business policy;
- merge their own work.

Agents MUST:

- operate only within their bounded context;
- preserve canonical IDs and state lineage;
- make economic mutations attributable and idempotent where applicable;
- add positive, negative, authority, replay/race, and recovery tests appropriate to the journey;
- update traceability/evidence artifacts;
- escalate genuine consequential decisions to A0 for human resolution.

## Workforce

- A0 Lead Orchestrator — dependency graph, work orders, integration, decision/evidence registers.
- A1 Constitutional Guardian — invariants, authority and economic/physical truth review.
- A2 Membership — enrollment, membership, household, beneficiaries, membership billing.
- A3 Commerce — product, SKU, offer, basket, commitment, MOQ/max rules.
- A4 Payments — obligations, settlement, refunds, payroll-deduction integration boundary, credit/receivables.
- A5 Demand — demand signals, pools, product requests, forecasting.
- A6 Supply — RFQ, suppliers, procurement, owned-farm and contract-grower supply.
- A7 Inventory/Fulfillment — receipts, lots, allocation, pickup, delivery, release authority.
- A8 Engagement — notifications, surveys, referrals, rewards and promotions.
- A9 Governance — system owners, workforce RBAC, grants, approvals and feature controls.
- A10 Operations/Economics — support, savings, employer administration, exception workbench and control tower.
- A11 Falsification — independent adversarial and cross-domain testing; does not author the feature it falsifies.
- A12 Domain Architect (temporary) — normalizes canonical vocabulary/contracts before broad parallel implementation.

## Integration protocol

`work order -> bounded implementation branch -> tests -> PR -> A1 review -> CI -> A11 falsification -> preview/runtime evidence -> A0 integration decision`

No feature is complete merely because a schema, API, screen or package exists. Completion requires the relevant journey, adverse cases, authority boundaries, economic effects, state transitions, reconciliation/audit lineage, and recovery behavior to be proven.

## Initial implementation wave

Wave 0 establishes the control plane and canonical domain vocabulary.

Wave 1 begins with Membership (A2), Commerce (A3), Governance (A9), with Payments (A4) initially reviewing contracts around already-proven payment behavior. A1 and A11 remain independent gates.
