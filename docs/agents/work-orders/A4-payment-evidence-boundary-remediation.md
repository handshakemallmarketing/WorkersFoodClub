# A4 Payment Evidence Boundary Remediation

Status: IMPLEMENTED — FALSIFICATION PENDING

## A4-PAY-001
Membership settlement no longer accepts caller-supplied amount/reference as authoritative settlement truth. The billing boundary requires verified, persisted payment evidence with durable evidence identity, provider reference, participant binding, obligation binding, verified amount and verification timestamp.

## Preserved business rules
- Annual membership fee is payable in full only and is non-refundable.
- Insufficient verified payment does not settle the annual fee.
- Verified overpayment is accepted.
- Only the overpayment amount becomes member-funded SHIPPING credit.
- Membership-fee overpayment cannot become merchandise credit.
- Founding-cohort club-funded membership-fee spending credit remains separately accounted and one-year expiring.

## Falsification cases
- arbitrary caller amount/reference denied;
- unverified evidence denied;
- unpersisted evidence denied;
- missing evidence/provider identity denied;
- wrong participant denied;
- wrong obligation denied;
- insufficient verified amount denied;
- replayed evidence does not allocate settlement or shipping credit twice;
- exact verified annual payment restores membership standing;
- verified overpayment creates shipping-only credit.

## Authority boundary
This remediation does not authorize live Paystack, live credentials, live funds, CAGD deductions, Production payment mutation expansion, or Production fulfillment mutation expansion.
