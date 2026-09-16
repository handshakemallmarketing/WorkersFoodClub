# Decision Register — A4 Wave 1 Payments Review — 2026-09-16

## Preserved decisions
- Annual membership fee: full annual payment only; non-refundable.
- Founding cohort: governed club-funded shopping/promotional credit equal to 100% of membership fee, separately accounted from fee revenue/settlement.
- Promotional credit expiry: one year after issuance.
- Membership-fee overpayment: member-funded shipping credit.

## Review decisions
- Do not infer settlement from intent, provider acknowledgement, CAGD mandate, deduction request or scheduled deduction.
- Do not implement item-level credit as payment; model it as a receivable with independent authorization and repayment lineage.
- Do not create a membership-fee refund path.
- Keep CAGD deductions, item-level credit and new commerce refund flows unauthorized until their contracts, persistence, reconciliation and falsification gates exist.

## Escalated / unresolved policy decisions
- CAGD rail/interface and authoritative remittance specification.
- Item-credit eligibility, limits, terms and delinquency policy.
- Refundability policy for future commerce transaction classes.
- Provider-agnostic idempotency namespace for additional rails.

## Protected boundaries
Live Paystack: UNAUTHORIZED.
Live credentials: UNAUTHORIZED.
Live funds: UNAUTHORIZED.
Production payment mutation expansion: UNAUTHORIZED.
Production fulfillment mutation expansion: UNAUTHORIZED.
