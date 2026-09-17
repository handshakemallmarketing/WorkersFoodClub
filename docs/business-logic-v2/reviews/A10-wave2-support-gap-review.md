# A10 Wave 2 — Support / Exception Contract-Gap Review

Baseline: 70d44118044a4077eafee8b4f9a3ef7b673031a9
Scope: UC-28 support_and_exception_case; review-only boundaries for UC-27 and UC-29
Disposition: CONTRACT-FIRST

## Canonical boundaries
- A support case is an operational coordination record, not economic or physical truth.
- Dashboard/control-tower projections are derived and rebuildable; they are not source of truth.
- Financial remedies remain governed by A4; fulfillment/inventory truth remains governed by physical-domain contracts.

## Repository finding
No canonical durable support-case lifecycle was found under the reviewed baseline concepts. Existing operational recovery/audit machinery should be reused where applicable, but a support case must not become a generic mutation bypass.

## A10-SUP-001 — Durable support-case lifecycle — OPEN
Required minimum states: OPEN, IN_REVIEW, WAITING, RESOLVED, CLOSED, with transitions governed by actor authority and durable audit lineage. Reopening must be explicit rather than overwriting closure history.

Required fields:
- case identity;
- participant/subject lineage;
- category and bounded reason code;
- state and state version;
- created/updated actor authority lineage;
- evidence references rather than copied economic/physical assertions;
- idempotency key for commands;
- timestamps and closure/reopen lineage.

## A10-SUP-002 — No truth mutation by case projection — OPEN
Case creation, classification, escalation or closure must not itself:
- settle/refund an obligation;
- create/reduce inventory;
- mark pickup/delivery complete;
- create commitment or authoritative demand;
- change membership standing.

Any requested remedy must invoke the owning domain's governed command and retain the resulting canonical event reference.

## A10-SUP-003 — Operator authority and replay — OPEN
Required falsification:
- unauthorized operator cannot create privileged classification or close case;
- duplicate identical command replays prior result without duplicate event/effect;
- same idempotency key with changed payload fails closed;
- stale state version cannot overwrite newer case state;
- case closure preserves evidence and actor lineage.

## UC-27 / UC-29 review-only boundary
A10 must not invent savings benchmarks/comparison methodology. Control-tower work may expose projections only if freshness, source lineage and rebuildability are explicit. Neither UC-27 nor UC-29 is declared complete by this Wave-2 support review.

## Authority boundary
A10 may implement support workflow, evidence references, audit lineage and derived projections. It may not invent financial policy, bypass A4/A7 truth owners, treat dashboard state as canonical, or expand Production mutation authority.

## Recommended implementation sequence
1. Durable support-case schema/store and transition contract.
2. Actor-bound idempotent command boundary.
3. Negative tests proving support state cannot mutate domain truth.
4. Evidence-reference integration to existing canonical events.
5. Projection only after canonical support state is durable and rebuildable.
