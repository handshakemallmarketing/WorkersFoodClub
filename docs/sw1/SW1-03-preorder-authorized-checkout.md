# SW1-03 — Preorder and Authorized Checkout

This slice turns an authenticated active member's non-binding cart into a purchase obligation only through a separately accepted command/event verified by the SW0 demand commitment boundary.

Acceptance properties: cart activity is not committed demand; membership and offer executability are revalidated; cart quantity cannot exceed the governed offer; a rejected/unverifiable command creates no obligation; a successfully checked-out cart cannot create a second obligation; authorization consumption remains protected by the demand ledger.

This is an in-memory pilot application composition over the previously proven kernel boundaries. It does not claim that the complete checkout flow is yet one production PostgreSQL transaction and it does not authorize live member funds. SW1-04 adds the payment-provider seam, sandbox payment, webhook evidence, idempotency and reconciliation behavior.
