# A3 Commerce — Wave 1 Work Order

Status: ACTIVE
Parent control plane: `cb467afd2bdaea85f41e32a23239c26c6960e6c4`

## Bounded scope
Implement and falsify canonical product/SKU/catalog administration, offers, basket construction, commitment rules, and per-offer minimum/maximum quantity controls.

## Required business behavior
- Authorized operators can create and maintain catalog products/SKUs without granting unrelated operational authority.
- Offers reference canonical catalog identities and explicit commercial terms.
- Basket state is not authoritative demand until the commitment contract is satisfied.
- Commitment must define the amount/payment condition required before quantity enters the authoritative demand pool; do not invent a consequential threshold if the governing business contract does not specify one.
- MOQ and maximum-order rules must be explicit, versioned, enforced server-side, and attributable to the applicable offer/SKU.
- Replays must not duplicate commitments or demand quantity.

## Evidence required
Positive, negative, authorization, replay/idempotency, concurrency/race, recovery and traceability tests; exact-head CI; preview/runtime evidence when authorized.

## Authority boundary
No live Paystack, live credentials, live funds, Production payment authority expansion, fulfillment mutation expansion, or self-merge. Escalate consequential business-policy gaps to A0/human decision.