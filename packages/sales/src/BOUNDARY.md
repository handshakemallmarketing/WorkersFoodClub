# Sales composition boundary

`@foodclub/sales` is a product composition boundary, not a new canonical write model.

Canonical ownership remains:
- specification/listing/offer/price observation: `@foodclub/catalog`
- benchmark method/valuation: `@foodclub/economics`
- authority grants/constraints: `@foodclub/authority`

The sales package owns only the governed sales-window record introduced for the pilot and the read composition that checks these sources together. It must not copy mutable offer, benchmark, inventory or obligation truth into a second authoritative store.
