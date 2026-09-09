# SW1 Review-Debt Remediation Gate

Status: REMEDIATION_IN_PROGRESS

Purpose: audit every unresolved review conversation from prior SW0/SW1 pull requests and classify each finding as FIXED_BY_LATER_COMMIT, STILL_REPRODUCIBLE, SUPERSEDED, or INVALID before SW1-09 proceeds.

Priority order:
1. Reproduce and remediate all unresolved P1 findings still live on current main.
2. Reproduce and remediate all confirmed-live P2 findings, unless an explicit release decision documents and accepts a bounded deferral.
3. Add adversarial regression tests for every confirmed defect.
4. Reconcile traceability and release evidence where prior reviews found overstated or stale claims.
5. Resolve historical GitHub review threads only after the corresponding current-main disposition is evidenced.
6. Re-run constitutional-conformance on the final remediation head.

Initial live-review clusters:
- SW0 RC3/RC3R: live PostgreSQL same-owner fencing proof and transfer-policy authority attack coverage.
- SW1-01/02/03/04: identity, catalog, checkout and payment authority/evidence/idempotency concerns.
- SW1-06: fulfillment conservation, quality, sequencing, chronology, location and exception-lineage concerns.
- SW1-07: remedy-creation wording versus completion semantics.
- SW1-08/08A: traceability references, slice sequencing, canonical member-economics evidence, savings lineage, projection immutability and replacement economics.
- SW1-08B: review threads are fixed in code but remain unresolved in GitHub.

Exit criteria:
- zero unresolved P1 defects known to be reproducible on current main;
- zero confirmed-live P2 defects unless each deferred P2 has an explicit, bounded release-decision acceptance with rationale, risk owner and follow-up gate;
- every historical unresolved thread has an explicit disposition;
- fixes have adversarial tests and traceability where material;
- constitutional-conformance is green;
- SW1-09 may resume only after this gate is cleared.
