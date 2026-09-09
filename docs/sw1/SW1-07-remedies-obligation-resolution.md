# SW1-07 — Refund/Replacement Remedies and Obligation Resolution

Status: IMPLEMENTATION_IN_PROGRESS
Baseline: SW1-06 merged

## Purpose

Implement the governed remedy boundary after fulfillment exceptions. Refunds, replacements, and permitted credits must remain separately authorized, evidence-backed, idempotent, and quantity-conserving against the unresolved portion of the original purchase obligation.

## Acceptance targets

- Remedy creation resolves a real recorded exception and canonical purchase obligation.
- Refund/replacement/credit actions require bounded Authority grants; UI access is never sufficient.
- Remedy quantity cannot exceed the unresolved/exception quantity.
- Duplicate remedy authorization or completion cannot create duplicate economic/physical effect.
- Replacement requires explicit specification/equivalence/consent semantics where substitution is involved.
- Completion updates the shared obligation-resolution position without rewriting prior fulfillment history.
- Credit remains explicitly classified as non-stored-value unless separately classified and authorized.
- Production funds remain out of scope; sandbox/provider evidence only where external payment behavior is exercised.

## Next

SW1-08 — member savings ledger, order history and projection rebuild/freshness.
