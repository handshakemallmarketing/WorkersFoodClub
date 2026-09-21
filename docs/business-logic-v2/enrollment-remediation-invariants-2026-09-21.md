# Enrollment invariants

- A guest can submit enrollment without authenticating.
- AUTO enrollment is atomic across application, participant, numbered membership, invoice, and application linkage.
- A Member Number is server-generated and persisted on the membership before the invoice CTE.
- A Member Number is not proof of active standing.
- INITIAL_FEE_DUE is not ACTIVE.
- Payment settlement can activate but cannot assign or replace the Member Number.
- Authentication identity binding is outside enrollment and settlement.
