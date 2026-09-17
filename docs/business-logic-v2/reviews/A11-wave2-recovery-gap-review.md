# A11 Wave 2 — Cross-Domain Reconciliation / Recovery Gap Review

Baseline: current Wave-2 control plane after A10 integration (`ce97b77e271d09ab1c43c8ee077b2946a1927784`).
Scope: UC-30 cross_domain_reconciliation_and_recovery
Disposition: EXTEND EXISTING RECOVERY PRIMITIVES — DO NOT CREATE PARALLEL AUTHORITY

## Canonical invariant
Recovery must preserve idempotency, authority and economic truth. Recovery is not authority to fabricate or reinterpret canonical state.

## Existing baseline strength
SW1 already establishes reusable recovery principles: actor-bound idempotency, fail-closed conflicting request reuse, no-effect reconciliation before retry, duplicate-effect avoidance when an effect already exists, durable audit records, and separately authorized stuck-work diagnosis. Wave 2 composes and falsifies these primitives across domains rather than inventing a second recovery architecture.

## A11-REC-001 — Cross-domain idempotency conservation — PARTIAL / EXECUTABLE
Behavioral tests now execute commitment replay and membership-settlement replay rather than reading source text. They prove:
- process-loss-style commitment replay converges to one commitment and one pooled-demand contribution;
- replay of the same authoritative membership settlement does not create a second settlement or second shipping-credit allocation;
- shipping overpayment remains SHIPPING-only value.

Still required before UC-30 is complete:
- executable changed-payload reuse rejection for each durable runtime boundary;
- PostgreSQL concurrency/process-loss proof for the runtime commitment/refund paths, not only in-memory domain stores.

## A11-REC-002 — Authority conservation — PARTIAL / EXECUTABLE
Behavioral tests prove a revoked operator grant is inactive at execution time. Existing governance tests also cover role ceilings and authority-grant lineage.

Still required:
- exercise a real recovery/retry command after revocation and prove it cannot reuse historical authority;
- prove diagnostic/stuck-work authority cannot mutate another domain.

## A11-REC-003 — Economic/physical truth conservation — PARTIAL / EXECUTABLE
Behavioral tests prove:
- unverified or unpersisted caller assertions cannot settle membership invoices;
- basket/intent without an authorized commitment contributes zero pooled demand;
- membership overpayment remains shipping-only and is not duplicated on replay.

Existing A4 settlement/refund tests remain seed evidence for refund conservation. Physical-domain rows remain future falsification requirements and are not evidence that A7 is complete.

Still required:
- PostgreSQL/runtime refund cumulative-cap recovery proof;
- authoritative physical-domain recovery tests after the A5 -> A6 -> A7 dependency chain is implemented.

## A11-REC-004 — Ambiguous external-side-effect protocol — CONTRACT DEFINED / HARNESS PARTIAL
The executable recovery test now exercises the three required dispositions using a sandbox classifier:
1. proven no effect -> exact authorized retry may proceed;
2. proven effect -> reconcile/suppress duplicate;
3. ambiguous -> fail closed/escalate.

This is deliberately not presented as provider proof. Before an external-effect recovery path is production-authorizable, the owning domain must expose authoritative reconciliation evidence and A11 must execute the protocol against that sandbox/fake adapter.

## A11-REC-005 — Recovery evidence sufficiency — OPEN
A successful behavioral test alone is insufficient. Each durable recovery path must retain enough evidence to explain original command, authority, attempted side effect, reconciliation result, retry/suppression decision and final canonical state.

Required evidence fields remain: external reference where available, canonical command/event identity, reconciliation timestamp, actor/authority lineage, and resulting disposition.

## Independence boundary
A11 may create adversarial tests, recovery harnesses and evidence-sufficiency findings. It may not author/approve the business feature being tested, invent policy, waive a failed invariant, activate live providers or expand Production mutation authority.

## Current execution sequence
1. Behavioral in-memory cross-domain tranche — implemented on the A11 reconciliation branch.
2. Exact-head constitutional conformance — required after every reconciliation/test change.
3. Independent A1 review — required before A0 integration.
4. PostgreSQL/runtime recovery tranche — remains subsequent UC-30 work; do not mark UC-30 complete after this PR.
5. Physical-domain recovery tranche — dependency blocked on authoritative A5/A6/A7 truth contracts.
