# Wave 2 UI / Authentication Convergence

## Governing journey

1. Guest may browse only public/non-member surfaces without authentication.
2. Membership is established before member authentication grants member-area access.
3. Member authentication grants member surfaces only.
4. Employee/operator access is a separate journey and requires explicit fresh step-up authentication.
5. The employee session is independently revocable and must be backed by active workforce authority.
6. Operator domains/functions/tasks derive from server-side authority; the member shell does not offer role selection.
7. System Owner and Admin remain distinct governance tiers. Admin cannot create System Owner authority.
8. Preview must not train users to treat privileged roles as alternate member login personas.

## UX invariants

- Member-facing errors do not expose Neon, staging projections, RC identifiers, or raw control constants.
- Database reachability is not represented as proof that member projections are healthy.
- Employee and release-governance functions do not appear in ordinary member navigation.
- Environment language uses Preview/Production and payment mode separately.
- Live funds remain unauthorized unless separately ratified.
