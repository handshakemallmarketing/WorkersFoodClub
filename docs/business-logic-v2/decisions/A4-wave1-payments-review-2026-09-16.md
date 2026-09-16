# Decision Register — A4 Wave 1 Payments Review — 2026-09-16

## Preserved decisions
- Annual membership fee: full annual payment only; non-refundable.
- Founding cohort: governed club-funded shopping/promotional credit equal to 100% of membership fee, separately accounted from fee revenue/settlement.
- Promotional credit expiry: one year after issuance.
- Membership-fee overpayment: member-funded shipping credit.

## Review decisions
- Do not infer settlement from intent, provider acknowledgement, CAGD mandate, deduction request or scheduled deduction.
- Membership standing must not rely on a caller assertion of settlement; the authoritative mutation must reference durable verified provider/remittance evidence and status-mapping lineage.
- Do not implement item-level credit as payment; model it as a receivable with independent authorization and repayment lineage.
- Do not create a membership-fee refund path.
- Existing SW1-07/UC-26 shortfall refunds require original-settlement lineage and an aggregate cap against refundable settled value; this is a current remediation requirement.
- Keep CAGD deductions and item-level credit unauthorized until their contracts, persistence, reconciliation and falsification gates exist.
- Do not invent a UC-08 minimum-payment percentage. Commitment qualification must remain explicitly governed and fail closed until the threshold and reversal semantics are authorized.

## Current remediation gates
- **A4-PAY-001 — P1:** membership settlement mutation is not yet proven to consume/reference persisted verified evidence. Required closure: durable evidence identity + verification/status mapping + replay-safe settlement allocation + tests proving unverified assertions cannot settle membership obligations.
- **A4-PAY-002 — POLICY/CONTRACT:** UC-08 minimum-commitment payment threshold and qualification/reversal semantics are unresolved. Required closure: explicit authorized policy plus implementation/falsification; A3/A4 have no authority to choose the percentage.
- **A4-PAY-003 — P1:** existing shortfall refund authorization lacks proven original-settlement lineage and aggregate refund cap. Required closure: settlement reference, refundable-settled calculation, cumulative cap, idempotency/replay protection and adversarial tests.

## Escalated / unresolved policy decisions
- UC-08 minimum-commitment payment percentage/amount, rounding, timing, partial-payment accumulation and reversal behavior.
- CAGD rail/interface and authoritative remittance specification.
- Item-credit eligibility, limits, terms and delinquency policy.
- Refundability policy for commerce classes beyond the existing shortfall remedy.
- Provider-agnostic idempotency namespace for additional rails.

## Protected boundaries
Live Paystack: UNAUTHORIZED.
Live credentials: UNAUTHORIZED.
Live funds: UNAUTHORIZED.
CAGD deductions: UNAUTHORIZED.
Item-level credit: UNAUTHORIZED.
Production payment mutation expansion: UNAUTHORIZED.
Production fulfillment mutation expansion: UNAUTHORIZED.

## Gate state
A4 is **NOT COMPLETE**. CI success on the review branch does not close A4-PAY-001/002/003. Integration remains blocked until the P1 implementation gaps are fixed/falsified and UC-08 receives explicit policy authority, or an explicit higher-authority decision records a bounded deferral without representing the journey as complete.
