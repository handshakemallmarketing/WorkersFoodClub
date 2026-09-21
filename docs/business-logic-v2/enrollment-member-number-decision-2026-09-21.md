# Enrollment member-number lifecycle decision — 2026-09-21

Canonical sequence:

1. Prospect submits required membership information as a guest.
2. Server creates the membership record and immediately assigns its immutable Member Number.
3. Server creates the annual membership subscription invoice against that numbered membership.
4. Membership remains `INACTIVE / INITIAL_FEE_DUE`; issuance of a Member Number confers no membership rights.
5. Trusted provider-confirmed settlement marks the invoice paid and activates the existing membership.
6. Settlement must not issue, replace, or mutate the Member Number.
7. Member authentication follows activation. Google remains optional and explicitly bound only after membership exists.

This supersedes any text that places Member Number issuance at the payment-settlement boundary.
