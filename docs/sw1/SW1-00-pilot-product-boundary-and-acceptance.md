# SW1-00 — Pilot Product Boundary, Architecture & Acceptance Contract

Status: PROPOSED_SW1_ENTRY_GATE
SW0 baseline: `SW0_KERNEL_BASELINE_v1.0` authorized by SW0-RC3R

## 1. Purpose

SW1 converts the bounded constitutional kernel proven in SW0 into the first usable Food Club Ghana pilot product without weakening, duplicating, or bypassing the SW0 authority, evidence, obligation, durability, lineage, fulfillment, remedy, economics, and projection boundaries.

The pilot product exists to prove one operational loop with real users and operators:

`VERIFY MEMBER → PUBLISH GOVERNED CATALOG → PREORDER → PAY → AGGREGATE → RECEIVE/CONTROL LOT → ALLOCATE → PICK/PACK → PICKUP → ACCEPT/EXCEPTION → REMEDY → SETTLE/DISCHARGE → REPORT SAVINGS`

SW1 is not authorization to accept production member funds until the applicable production-readiness gate passes.

## 2. Pilot scope

Initial operating assumptions:

- Ghana public-sector worker membership pilot, initially Greater Accra.
- Approximately 500–1,000 verified pilot members across 3–5 participating institutions.
- Approximately 30–40 high-frequency food SKUs.
- Pickup-first fulfillment at governed institutional pickup points; home delivery is outside the first binding slice.
- Preorder/prepayment cycles aligned to governed sales windows; Mobile Money is the first intended payment rail.
- One aggregation/packing operation for the initial pilot.
- Member-facing savings reporting is based only on governed comparable benchmarks and actual fulfilled economics.

These are pilot parameters, not constitutional truths. They may change through governed configuration without changing SW0 semantics.

## 3. Explicitly outside SW1 launch scope

The following remain excluded unless separately classified, authorized, and gated:

- CAGD payroll deduction as a binding payment rail (OPEN-008).
- Consumer credit, lending, BNPL, overdraft or deferred-payment products.
- Stored-value/wallet products whose legal/economic classification has not been resolved (OPEN-009).
- Insurance, guarantee-like or deposit-taking representations.
- Autonomous AI authority over consequential member, payment, inventory, sourcing, transfer or remedy actions.
- Software-invented Ghana-law title/risk-transfer rules. Transaction-specific legal/contract policy remains an external governed input.
- Uncontrolled direct writes that bypass the SW0 consequential command/transaction boundary.

## 4. Product actors

The pilot UI may present familiar roles, but roles do not themselves grant authority.

- Member: verified Participant with an active membership relationship.
- Membership operator: reviews eligibility evidence and executes only delegated membership actions.
- Catalog/procurement operator: proposes governed specifications, offers, benchmarks and sourcing inputs within authority.
- Warehouse/packing operator: records receipt, quality, lot, allocation and fulfillment evidence within authority.
- Pickup operator: performs governed handover and exception capture.
- Finance/reconciliation operator: reconciles payment/refund evidence and exceptions within authority.
- Administrator: manages configuration and delegated grants; administrative UI access is not blanket authority.

Every consequential action must resolve to an SW0 Authority decision, not a frontend role check alone.

## 5. Logical architecture

### apps/web
Member and operator PWA. It may collect commands and display projections but is never a canonical source of economic or physical truth.

### apps/api
Authenticated command/query boundary. Consequential commands must enter the SW0 transactional execution path. Queries consume projections with freshness/lineage disclosure where material.

### SW1 application modules

1. `membership` — identity linkage, eligibility evidence, membership lifecycle.
2. `catalog` — governed Specification, CatalogListing, MemberOffer and benchmark presentation.
3. `checkout` — demand intent, price/availability validation and authorized purchase commitment.
4. `payments` — provider intent/reference, payment evidence, reconciliation and refunds. Provider callbacks are evidence, not self-authorizing truth.
5. `inventory-ops` — receiving, lot/lineage, quality, control/custody, allocation and reserve visibility.
6. `fulfillment-ops` — pick, pack, readiness, handover, acceptance and exceptions.
7. `remedies` — refund/replacement/credit remedies using only legally/classificationally permitted remedy types.
8. `economics` — governed benchmark, actual fulfilled economics and signed savings.
9. `projections` — member/order/operator read models rebuildable from canonical history.
10. `notifications` — WhatsApp/SMS/email adapters. Sending a notification never changes canonical obligation state by itself.

### integrations
External providers are anti-corruption boundaries. Provider payloads become typed evidence/events only after verification and mapping. No provider response may silently redefine canonical semantics.

## 6. First SW1 vertical slice

A verified pilot member signs in, sees a governed rice offer for a specific pickup window, commits to 5 kg, prepays through a test/sandbox payment adapter, receives an allocation from a qualifying traceable lot, and picks up the order. The scenario deliberately injects a 1 kg shortfall. The system preserves partial performance, creates an authorized refund remedy, discharges only the 4 kg of actually conforming performance, resolves the remaining 1 kg through the separately recorded remedy, and shows final signed savings against the governed benchmark. Remedy completion does not convert the remedied quantity into performed or discharged quantity.

The first implementation should use a payment-provider interface with a deterministic test adapter before enabling a live Mobile Money provider.

## 7. SW1 acceptance contract

A SW1 slice cannot be called complete merely because its UI works. For each consequential feature, acceptance requires:

1. Canon mapping — identify the SW0 primitives/invariants governing the feature.
2. Command contract — typed input, actor, authority action/scope, idempotency key and expected-version/concurrency semantics where applicable.
3. Transaction boundary — canonical economic/physical effects commit atomically through the approved durable path.
4. Evidence contract — external/user/operator observations are typed and attributable; assertions are not silently promoted to truth.
5. Projection contract — UI state is derived/rebuildable and exposes material freshness/lineage.
6. Negative-path proof — unauthorized, conflicting, malformed and stale commands fail closed. Duplicate-command handling follows INV-027: an identical retry with the same idempotency key and canonical payload replays the previously committed result without another effect; reuse of that key with a different payload fails closed as an idempotency conflict.
7. Adversarial test — at least one executable test attempts the principal constitutional failure mode of the slice.
8. Traceability — code/test/evidence mapping is added to the cumulative release record.
9. Operational recovery — retry/reconciliation behavior is explicit for external side effects.
10. No canon drift — convenience statuses, schemas or UI workflows cannot create new canonical meanings.

## 8. Product-level invariants carried into SW1

SW1 must preserve all INV-001..INV-030. The following deserve explicit product-level attack coverage in every relevant slice:

- UI role/access cannot substitute for Authority (INV-001).
- Forecast/cart activity cannot become committed demand without authorized checkout (INV-003/004).
- Payment-provider success cannot create an obligation or economic effect without the authorized checkout relationship (INV-004), and cannot duplicate or corrupt an authorized economic effect under correction, replay, or concurrency (INV-024/027/028).
- Inventory availability must remain quality/control/allocation aware (INV-007..010).
- Fulfillment must preserve transfer orthogonality and partial-performance conservation (INV-019..021).
- Returns cannot re-enter availability without governed quality determination (INV-022).
- Savings must use a governed comparable benchmark and may be negative (INV-013/014).
- Projections may fail or become stale without corrupting canonical history (INV-029).
- Product implementation cannot amend the constitution by repeated practice (INV-030).

## 9. Data and privacy boundary

Collect only data necessary for membership, transaction, fulfillment, support and lawful operational purposes. Authentication identity, eligibility evidence and operational participant records must remain distinguishable. Sensitive verification documents should not be copied into projections when a reference/evidence record suffices. Production launch requires an explicit privacy/security review, retention policy, access-control review, secret-management review and incident/recovery plan.

## 10. Payment boundary

SW1 payment integration must be provider-neutral at the canonical layer. A provider adapter may create payment observations/evidence; canonical payment state changes only through an authorized/idempotent command path. A provider callback without an authorized checkout relationship must not fabricate an obligation, payment effect, allocation, or fulfillment entitlement. Provider transaction/reference IDs must be uniqueness-protected. Webhook replay, reordered callbacks, timeout-after-provider-success and refund retry must be tested before live funds.

## 11. Deployment boundary

SW1 may be deployed to development/staging continuously. Production pilot authorization is a separate gate. Before accepting real member money/orders, require at minimum:

- production database durability/backup/restore proof;
- authentication and authorization threat review;
- secrets/environment isolation;
- live payment reconciliation and webhook authenticity proof;
- observability and alerting for failed consequential commands;
- operator recovery/runbooks;
- privacy/retention review;
- transaction-specific title/risk policy ratification;
- end-to-end production-like adversarial rehearsal.

## 12. Proposed slice sequence

- SW1-01 — Authentication, Participant binding, membership verification and operator authority.
- SW1-02 — Governed catalog, offers, benchmark display and sales-window configuration.
- SW1-03 — Cart/preorder and authorized checkout commitment.
- SW1-04 — Payment-provider seam, sandbox payment, webhook evidence and reconciliation.
- SW1-05 — Inventory receiving, explicit lineage, quality and allocation operator workflow.
- SW1-06 — Pick/pack/pickup, acceptance and exception workflow.
- SW1-07 — Refund/replacement remedies and obligation resolution.
- SW1-08 — Member savings ledger, order history and projection rebuild/freshness.
- SW1-09 — Pilot operations/admin controls, audit views and recovery tooling.
- SW1-RC1 — Integrated staging falsification review.
- SW1-RC2 — Security, privacy, payment and production-readiness review.

## 13. SW1-00 exit criteria

SW1-00 is complete when this product boundary is reviewed and merged, the first vertical slice is accepted as the implementation target, and subsequent SW1 work is prohibited from bypassing the SW0 transactional/authority/evidence boundaries. No production launch is authorized by SW1-00.
