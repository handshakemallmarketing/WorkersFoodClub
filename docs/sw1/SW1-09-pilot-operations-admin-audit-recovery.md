# SW1-09 — Pilot Operations, Admin Controls, Audit Views, and Recovery Tooling

Status: IMPLEMENTATION_IN_PROGRESS

## Purpose

SW1-09 implements the accepted operational slice for the Food Club pilot. It does not redefine SW1-09 as an end-to-end constitutional replay. Integrated replay and independent release review remain later RC work.

## Scope

1. Pilot operations controls for routine administrative intervention without bypassing canonical domain boundaries.
2. Administrative controls with explicit actor, authority, target, reason, timestamp, and evidence lineage.
3. Read-only audit views that expose current state together with canonical source identifiers and freshness metadata.
4. Recovery tooling for bounded operational repair, retry, reconciliation, and stuck-work diagnosis without silently rewriting canonical history.
5. Fail-closed handling for unauthorized, stale, conflicting, or semantically mismatched administrative actions.

## Required boundaries

- No admin action is authorized merely by UI access or operator role.
- Recovery may replay or reconcile an already-authorized operation, but may not fabricate a new economic, physical, membership, payment, allocation, fulfillment, remedy, or savings effect.
- Corrections and reversals remain additive and source-linked.
- Audit views are non-authoritative read models and must disclose source lineage and freshness.
- Recovery actions must be idempotent or conflict-detecting.
- Every consequential admin mutation must retain authority and audit evidence.

## Initial acceptance targets

- Governed admin command envelope with actor, action, target, authority grants, reason, request ID, and trusted execution time.
- Operational audit record emitted for every accepted or rejected admin mutation attempt.
- Read-only pilot audit view for member/obligation/payment/inventory/fulfillment/remedy/economics lineage.
- Recovery action for safe retry/reconciliation of already-authorized work with duplicate-effect prevention.
- Adversarial tests for unauthorized admin access, stale recovery, conflicting request reuse, and audit-view freshness disclosure.

## Non-goals

- No production launch authorization.
- No live funds or live provider activation.
- No claim of complete distributed transaction fencing.
- No replacement for SW1-RC1 independent integrated conformance review.

## Exit

SW1-09 exits only when operational controls, audit views, and recovery tooling are implemented with adversarial coverage and the cumulative constitutional-conformance gate is green.