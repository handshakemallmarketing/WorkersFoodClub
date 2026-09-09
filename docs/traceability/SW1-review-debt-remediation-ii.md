# SW1 Review-Debt Remediation II

Status: REMEDIATION_IN_PROGRESS

Purpose: continue the historical review-debt audit after PR #45, concentrating first on member economics and payments, then the remaining unresolved SW0/SW1 findings before SW1-09 resumes.

Priority clusters:
- canonical payment-to-obligation price binding and prevention of duplicate full-value intents;
- authenticated/authorized payment initiation;
- webhook replay verification and terminal-status semantics;
- canonical derivation of fulfilled economics, charges and refunds;
- savings correction lineage and immutable projection source lineage;
- remaining SW0/SW1 unresolved P1/P2 findings not cleared by PR #45.

Exit criteria:
- zero confirmed-live P1 defects;
- zero confirmed-live P2 defects unless explicitly deferred by a bounded release decision with rationale, risk owner and follow-up gate;
- each historical unresolved thread has an evidenced disposition;
- each code fix has an adversarial regression test;
- traceability claims are reconciled where material;
- constitutional-conformance is green.

SW1-09 remains paused until this gate is cleared.
