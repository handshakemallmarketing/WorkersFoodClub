# SW1 Review-Debt Remediation III

Status: REMEDIATION_IN_PROGRESS

## Purpose

Complete the remaining historical SW0/SW1 review-debt audit after Remediation II before SW1-09 is allowed to resume.

## Priority closure clusters

1. Identity and membership eligibility, idempotency, authority-target and lifecycle findings not already cleared by Remediation II.
2. Catalog policy/version/attribution and benchmark-lineage findings not already cleared by Remediation II.
3. Checkout and payment residuals, including provider terminal correction semantics, raw-status mapping evidence/versioning and provider-reference binding.
4. Fulfillment residuals, including canonical committed pickup-place binding and multi-allocation/handover conservation semantics.
5. Economics deep immutability and any remaining canonical evidence-lineage findings.
6. SW1-07 remedy creation-versus-completion semantics and traceability wording.
7. Historical GitHub review threads whose code findings were fixed by later commits but whose dispositions remain unresolved.

## Exit criteria

- Zero confirmed-live P1 defects.
- Zero confirmed-live P2 defects unless explicitly deferred by a bounded release decision with rationale, named risk owner and follow-up gate.
- Every historical unresolved review thread has an evidenced disposition: FIXED_BY_LATER_COMMIT, STILL_REPRODUCIBLE, SUPERSEDED or INVALID.
- Every code remediation has an adversarial regression test.
- Traceability and release claims are reconciled where materially affected.
- Constitutional-conformance is green on the final head.
- SW1-09 remains paused until this gate is explicitly cleared.
