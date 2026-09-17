# A11 Wave 2 — Cross-Domain Reconciliation / Recovery Gap Review

Baseline: 70d44118044a4077eafee8b4f9a3ef7b673031a9
Scope: UC-30 cross_domain_reconciliation_and_recovery
Disposition: EXTEND EXISTING RECOVERY PRIMITIVES — DO NOT CREATE PARALLEL AUTHORITY

## Canonical invariant
Recovery must preserve idempotency, authority and economic truth. Recovery is not authority to fabricate or reinterpret canonical state.

## Existing baseline strength
SW1 already establishes reusable recovery principles: actor-bound idempotency, fail-closed conflicting request reuse, no-effect reconciliation before retry, duplicate-effect avoidance when an effect already exists, durable audit records, and separately authorized stuck-work diagnosis. Wave 2 should compose and falsify these primitives across domains rather than invent a second recovery architecture.

## A11-REC-001 — Cross-domain idempotency conservation — OPEN
Falsify recovery across membership, commitment, payment/refund and later physical-domain events:
- identical retry cannot duplicate canonical effect;
- conflicting payload under same idempotency identity fails closed;
- recovery after process loss must converge to one effect;
- replay of upstream event cannot duplicate downstream allocation.

## A11-REC-002 — Authority conservation — OPEN
Recovery must execute with the authority required by the original governed command or a separately authorized recovery role. Stuck-work diagnosis is not mutation authority.

Falsification:
- revoked original actor cannot use replay to regain authority;
- diagnostic operator cannot convert diagnosis into privileged mutation;
- recovery command cannot cross domain authority boundary merely because an event is stuck.

## A11-REC-003 — Economic/physical truth conservation — OPEN
Recovery/reconciliation must never manufacture:
- settlement from payment intent/provider acknowledgement alone;
- commitment from basket/survey interest;
- inventory from expected harvest/purchase order;
- pickup/delivery from proximity signal;
- refund beyond authoritative settled refundable value.

Existing A4 settlement/refund tests become seed cases for the cross-domain matrix.

## A11-REC-004 — Ambiguous external-side-effect protocol — OPEN
For external effects, recovery must classify at least:
1. proven no effect -> exact authorized retry may proceed;
2. proven effect -> record/reconcile without repeating effect;
3. ambiguous -> fail closed/escalate, never guess.

Required evidence must include external reference where available, canonical command/event identity, reconciliation timestamp, actor/authority lineage and resulting disposition.

## A11-REC-005 — Recovery evidence sufficiency — OPEN
A successful test alone is insufficient. Each recovery path must retain enough durable evidence to explain original command, authority, attempted side effect, reconciliation result, retry/suppression decision and final canonical state.

## Independence boundary
A11 may create adversarial tests, recovery harnesses and evidence-sufficiency findings. It may not author/approve the business feature being tested, invent policy, waive a failed invariant, activate live providers or expand Production mutation authority.

## Recommended execution sequence
1. Inventory existing SW1 recovery/idempotency primitives and map them to UC-30.
2. Build cross-domain falsification matrix beginning with A2/A3/A4/A9 integrated Wave-1 truths.
3. Add process-loss, replay, conflict and revoked-authority tests.
4. Add ambiguous-side-effect protocol tests using sandbox/fakes only.
5. Require remediation from owning agent for any failed feature invariant; A11 does not silently fix policy/business semantics itself.
