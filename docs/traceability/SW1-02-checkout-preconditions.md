# Checkout preconditions handed to SW1-03

At checkout execution, SW1-03 must resolve the authenticated Participant and active membership, reload the canonical listing and offer, reload/evaluate the governed sales window, verify specification/place/quantity/price/time conditions, and only then accept explicit purchase intent into an Obligation through the consequential durable command boundary.

A client-side cart snapshot or SW1-02 `MemberCatalogView` is untrusted historical input and cannot create an Obligation.
