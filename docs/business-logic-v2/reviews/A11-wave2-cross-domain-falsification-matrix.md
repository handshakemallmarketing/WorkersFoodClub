# A11 Wave 2 — Cross-Domain Recovery Falsification Matrix

Baseline: 70d44118044a4077eafee8b4f9a3ef7b673031a9
Purpose: executable-test backlog for UC-30 using existing SW1 recovery/idempotency primitives.

| Domain truth | Original command/evidence | Failure injected | Recovery attempt | Required result |
|---|---|---|---|---|
| Membership eligibility | governed eligibility decision | process loss after commit | identical replay | one membership effect; prior result replayed |
| Membership settlement | verified persisted payment evidence | process loss after settlement event | caller assertion without evidence | fail closed; no second settlement |
| Overpayment shipping credit | settled excess | downstream retry | replay same evidence | one SHIPPING credit allocation |
| Commitment | accepted offer/version + governed command | timeout after commit | identical command retry | one commitment / one pooled-demand contribution |
| Commitment | basket or survey interest only | synthetic recovery event | attempt to reconstruct commitment | fail closed; no commitment |
| Refund | confirmed same-obligation settlement + exception | timeout/race | repeated authorization | cumulative refund <= remaining settled refundable value |
| Operator mutation | active authority grant | grant revoked before replay | retry original mutation | fail closed unless separately governed recovery authority exists |
| Diagnostic recovery | stuck-work diagnosis authority | ambiguous side effect | diagnostic actor retries mutation | fail closed; diagnosis != mutation authority |
| External side effect | command + external reference | provider timeout, effect proven absent | exact authorized retry | at most one effect |
| External side effect | command + external reference | provider timeout, effect proven present | retry requested | suppress duplicate; reconcile existing effect |
| External side effect | command + external reference | provider timeout, effect ambiguous | retry requested | fail closed / escalate; never guess |
| Physical truth (future A7) | authoritative receipt/pickup/delivery evidence | expected/scheduled state only | recovery synthesizes completion | fail closed; no physical completion |

## Mandatory assertions for every executable case
1. Stable idempotency identity is retained.
2. Conflicting payload reuse fails closed.
3. Actor and authority lineage are retained and revalidated where required.
4. Recovery cannot broaden the original domain authority.
5. Canonical event/effect count remains conserved.
6. Economic amount/quantity remains conserved.
7. Evidence is sufficient to explain retry, suppression or escalation.

## First executable tranche
A11 should first implement tests for the already-integrated Wave-1 truths: membership settlement, overpayment SHIPPING credit, commitment replay, refund cap, revoked operator authority, and ambiguous external-side-effect classification. Physical-domain rows remain future falsification requirements and are not evidence that A7 is complete.
