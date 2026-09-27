# Wave 2 — Authority and Entitlement Conformance

Base: merged Wave 1 (`029e6822f31d0846ec52542995b80c2ad415afc7`).

## Ratified authority model

System Owner appoints/revokes Admin. Admin grants/revokes bounded operational permissions to Operators. Operators execute only functions explicitly granted within their domains. Admin cannot create, promote, appoint, or otherwise confer System Owner authority.

Membership and workforce remain separate state machines. An ACTIVE employee receives sponsored membership, but workforce authority requires employee step-up plus an active bounded authority grant. Membership invoice standing must not independently confer or revoke workforce authority.

## Wave 2 implementation gates

1. Consolidate runtime authority decisions around durable grants and domain/function permissions.
2. Make System Owner appointment/revocation a reserved authority unavailable to Admin and Operator grants.
3. Preserve last-owner/continuity protection without treating Backup System Owner as an Admin-created role.
4. Persist employee-sponsored membership entitlement and reconcile it with the membership lifecycle without collapsing workforce and membership states.
5. Enforce beneficiary cap and governed beneficiary eligibility at runtime, not only in contracts/UI.
6. Add falsification tests for privilege escalation, cross-domain access, revoked grants, sponsored-membership termination, beneficiary overflow, and state-machine independence.
7. Keep Production activation, Paystack live mode, live credentials, live funds, member credit, and CAGD/payroll deduction outside this wave unless separately authorized.

## Merge gate

Wave 2 is mergeable only after exact-head constitutional conformance, kernel/security tests, PostgreSQL durability/race checks, and Vercel preview checks are green and a final policy-inconsistency rescan finds no unresolved P0/P1 gap in Wave 2 scope.
