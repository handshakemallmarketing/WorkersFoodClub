# Decision Register — A4 Payment Evidence Boundary — 2026-09-16

## Decision
A membership invoice may transition to SETTLED only from verified and durably persisted payment evidence bound to the same participant and membership obligation.

Caller-supplied amount/reference is not settlement truth.

## Required evidence attributes
- durable evidence identity;
- provider/remittance reference;
- participant identity;
- membership obligation identity;
- verified settled amount;
- explicit verified state;
- explicit persisted state;
- verification timestamp.

## Replay semantics
The same evidence identity is consumable once. Replay returns the existing settlement result and must not issue a second overpayment shipping-credit allocation.

## Amount semantics
- amount below annual fee: fail closed; invoice remains unsettled;
- amount equal to annual fee: settle annual fee;
- amount above annual fee: settle annual fee and issue only the excess as member-funded SHIPPING credit.

## Non-decisions
This change does not decide UC-08 minimum-commitment percentage, CAGD rail semantics, item-level credit policy, or broader commerce refund policy.

## Authority
No live-funds or Production activation authority is granted by this decision.
