# SW1-07 — Refund/Replacement Remedies and Obligation Resolution

Status: IMPLEMENTATION_IN_PROGRESS
Baseline: SW1-06 merged

## Purpose

Implement the governed remedy boundary after fulfillment exceptions. Refunds, replacements, and permitted credits must remain separately authorized, evidence-backed, idempotent, and quantity-conserving against the unresolved portion of the original purchase obligation.

## Acceptance targets

- Remedy creation must reference a real recorded exception and canonical purchase obligation; creation records an authorized remedy commitment but does not itself resolve or discharge any unresolved quantity.
- Refund/replacement/credit actions require bounded Authority grants; UI access is never sufficient.
- Remedy quantity cannot exceed the unresolved/exception quantity.
- Duplicate remedy authorization or completion cannot create duplicate economic/physical effect.
- Replacement requires explicit specification/equivalence/consent semantics where substitution is involved.
- Only evidenced remedy completion may resolve the remedy's governed quantity in the shared obligation-resolution position; authorization, creation, dispatch, provider submission, or other intermediate state is not completion.
- Remedy completion remains distinct from conforming fulfillment performance and does not rewrite prior fulfillment history or convert remedied quantity into performed/discharged quantity.
- Credit remains explicitly classified as non-stored-value unless separately classified and authorized.
- Production funds remain out of scope; sandbox/provider evidence only where external payment behavior is exercised.

## Next

SW1-08 — member savings ledger, order history and projection rebuild/freshness.
