# SW1-04A — Integration Remediation

This slice was triggered by an independent review of `main` at `9cc12dd` that reproduced three defects in the newly introduced SW1 pilot surface.

The slice fixes all three before SW1-05 proceeds:

- checkout now reserves a cart synchronously as `CHECKING_OUT` before awaiting commitment verification/creation, preventing two concurrent attempts from creating distinct obligations from one cart;
- active-member resolution no longer requires equality with the bind-time authentication evidence id, allowing a later login for the same bound issuer+subject to carry fresh evidence;
- webhook reconciliation is idempotent by provider reference as well as event id for same-status redelivery, while conflicting terminal states still fail closed.

The sandbox webhook signature implementation remains sandbox-only. Production Mobile Money verification, including signature/MAC requirements and timing-safe verification where applicable, remains a separate production-readiness gate.

No production launch or live-money authorization is granted by this slice.
