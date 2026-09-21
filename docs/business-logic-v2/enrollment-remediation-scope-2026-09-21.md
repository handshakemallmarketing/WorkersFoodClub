# Enrollment remediation verification scope

This branch corrects the membership lifecycle so a Member Number is issued when the membership record is created, before the annual invoice and before payment.

Verification gates:
- guest enrollment requires no authentication
- government employer and contact information are validated
- membership record is created as INACTIVE / INITIAL_FEE_DUE
- immutable server-issued Member Number exists before invoice creation
- annual invoice references the numbered membership
- settlement refuses a membership with no Member Number
- settlement preserves the existing Member Number while activating membership
- Google identity is not created or required
- test fixture uses GHS 120.00 only as non-production test data

No merge is authorized by this document.
