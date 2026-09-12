# SW1-RC2 — Security, Privacy, Payment & Production-Readiness Review

Status: EXECUTION_GATE
Baseline entering review: `SW1-RC1`
Production authorization: **NO until every RC2 exit criterion passes**

## 1. Purpose

SW1-RC2 is the final SW1 pre-production falsification gate. It does not ask whether the pilot works in staging; SW1-RC1 established that. RC2 asks whether the system can safely cross from sandbox/in-memory pilot assumptions into a production-like operating environment without weakening authority, evidence, payment, privacy, durability, recovery, or projection boundaries.

RC2 must fail closed. Missing evidence, unreviewed operational policy, unverifiable provider authenticity, untested restore/reconciliation behavior, or unresolved P0/P1 findings produce `NO_GO_RC2`.

## 2. Production-readiness domains

RC2 must produce executable or inspectable evidence in every domain below.

### A. Authentication and authorization threat review

Prove that:

- application/API access is not authority by itself;
- authenticated identity cannot bind or act as another participant without governed authority;
- stale, expired, wrong-scope, wrong-target and quantity-exceeding grants fail closed;
- administrative/recovery surfaces cannot bypass domain authorization;
- tenant/member/operator context cannot be switched through caller-controlled identifiers;
- sensitive actions have attributable actor/grant/audit lineage.

### B. Privacy, minimization and retention

Prove that:

- authentication identity, eligibility evidence and operational participant records remain distinct;
- projections do not copy sensitive verification documents when evidence references suffice;
- the production data inventory identifies purpose, sensitivity, retention and deletion/disposition rule for material data classes;
- logs/audit records do not expose secrets, raw credentials or unnecessary sensitive payloads;
- retention/deletion operations cannot silently delete canonical financial/physical evidence that must instead be retained or tombstoned under policy;
- privacy-sensitive exports/queries are authorization-scoped.

### C. Secrets and environment isolation

Prove that:

- production secrets are never committed to source or emitted by normal logs/errors;
- required secrets are validated at startup/configuration boundaries;
- sandbox/test credentials cannot silently authorize production provider behavior;
- production and non-production configuration are distinguishable and fail closed on ambiguous environment;
- secret rotation/revocation has an explicit operational procedure.

### D. Payment authenticity, reconciliation and refund safety

The canonical layer remains provider-neutral. Before live funds, prove at minimum:

- webhook authenticity is cryptographically/provider-verifiably established before payload semantics are trusted;
- raw-body/signature tamper fails closed;
- provider transaction/reference uniqueness is protected;
- same-event replay and provider redelivery do not duplicate economic effect;
- reordered callbacks cannot regress or fork canonical payment state;
- timeout-after-provider-success is reconciled by querying/probing provider state rather than blindly retrying an economic effect;
- unknown/ambiguous payment outcomes remain unresolved rather than guessed;
- refund retry/redelivery cannot duplicate refund effect;
- provider success without an authorized checkout relationship cannot fabricate obligation, entitlement, allocation or fulfillment;
- amount/currency/participant/offer/obligation bindings are preserved end to end.

Sandbox-only verification is insufficient for production authorization. If no live-provider adapter exists, RC2 must remain `NO_GO_RC2` for live funds while still completing the reusable provider-neutral controls.

### E. Production database durability, backup and restore

Prove that:

- canonical state uses the approved durable transaction boundary in production configuration;
- restart/process loss cannot erase committed canonical state;
- concurrent/retried commands preserve idempotency and conservation;
- an automated backup can be created and a restore rehearsal can rebuild a clean database instance;
- restored canonical data reproduces material projections/economic/physical positions deterministically;
- restore evidence records source backup, target instance, timestamps, checks/results and failure handling;
- restore procedures do not overwrite a live production database accidentally.

### F. Observability and consequential-command alerting

Prove that production operators can detect and classify:

- failed consequential commands;
- repeated authorization failures or suspicious bypass attempts;
- payment webhook verification/reconciliation failures;
- stuck/ambiguous recovery work;
- projection staleness/rebuild failures;
- database/durability failures;
- backup/restore failures.

Observability must not become an authority source and must not leak secrets/sensitive payloads.

### G. Operator recovery and incident runbooks

Runbooks must cover at minimum:

- ambiguous payment outcome;
- duplicate/replayed provider callback;
- refund timeout/redelivery;
- stuck authorized operation;
- database outage and restore;
- compromised/rotated secret;
- suspected unauthorized access;
- projection corruption/staleness;
- inventory/fulfillment discrepancy.

Recovery instructions must preserve additive history and exact prior-operation semantics. No runbook may instruct an operator to rewrite canonical history directly.

### H. Transaction-specific title/risk policy

The pilot must not invent Ghana-law title/risk-transfer semantics in code. RC2 must identify the externally governed policy/version controlling title, custody, risk, acceptance and remedy behavior for the pilot transaction. Absence of ratified policy is a launch blocker, not a reason to infer a rule in software.

### I. End-to-end production-like adversarial rehearsal

Run a production-like rehearsal that composes the RC1 journey with production-readiness controls and deliberately injects at least:

- wrong-scope/expired authorization;
- cross-participant/tenant identifier substitution;
- secret/configuration misbinding;
- forged/tampered payment callback;
- same-event replay and reordered provider callback;
- ambiguous provider timeout;
- duplicate refund/recovery attempt;
- database restart during/reafter consequential work;
- backup/restore rehearsal followed by deterministic projection rebuild;
- projection mutation/staleness attempt;
- logging/observability payload containing a planted secret marker and a planted sensitive-data marker;
- operator recovery attempt that tries to redirect the original failed operation.

Each injection must have an explicit expected fail-closed or governed-recovery result.

## 3. Required artifacts

RC2 cannot rely on narrative assurance alone. At minimum it must produce:

- `docs/traceability/SW1-RC2-security-privacy-payment-production-readiness-review.json`;
- `evidence/releases/SW1-RC2.json` only after GO;
- executable RC2 test(s) under `tests/node/`;
- security/threat review evidence;
- privacy/data-inventory/retention evidence;
- secrets/environment-isolation evidence;
- payment production-readiness evidence;
- backup/restore rehearsal evidence;
- observability/alert evidence;
- operator/incident runbook evidence;
- title/risk policy ratification reference or explicit unresolved blocker;
- updated `docs/traceability/matrix.json` and `docs/traceability/release-index.json` only after the final review passes.

## 4. Review severity and launch semantics

- **P0** — credible path to unauthorized consequential action, duplicated/corrupted economic or physical effect, secret compromise with production consequence, destructive restore, or loss/corruption of canonical state.
- **P1** — material production-readiness requirement is missing, bypassable, untested or unsupported by evidence.
- **P2** — non-blocking weakness that should be scheduled but does not invalidate the tested production-readiness proposition.

`GO_RC2` requires zero unresolved P0/P1 findings.

`GO_RC2` does not automatically enable a live provider or accept live funds. It authorizes production pilot entry only for the exact provider/environment/policies/evidence envelope explicitly covered by RC2. Any unresolved live-provider or legal-policy dependency narrows or blocks that authorization.

## 5. Mandatory negative assertions

RC2 must explicitly prove that:

1. no UI/API/admin identity substitutes for authority;
2. no unauthenticated/unverified provider message becomes payment truth;
3. no replay/retry creates a duplicate payment/refund/physical effect;
4. no unknown external outcome is guessed as success or failure;
5. no projection/log/monitoring system outranks canonical state;
6. no backup/restore operation silently targets the active production store;
7. no sensitive verification payload is copied into broad projections/logs without necessity;
8. no missing secret/configuration falls back to an insecure production default;
9. no runbook authorizes direct canonical rewrites;
10. no software default invents title/risk-transfer law or policy.

## 6. Exit criteria

SW1-RC2 exits `GO_RC2` only when all of the following are true:

1. every domain A–I has executable or inspectable evidence;
2. the production-like rehearsal passes and all mandatory attacks fail closed or enter the defined governed recovery path;
3. cumulative canon, traceability, typecheck, full tests, kernel tests, PostgreSQL durability and adapter-race checks are green on the final reviewed code candidate;
4. backup and restore rehearsal is successful and projection/canonical reconciliation passes after restore;
5. privacy/retention, secret-management, observability and incident/recovery artifacts are complete;
6. payment authenticity/reconciliation evidence is sufficient for the exact provider proposed for production, or production authorization is explicitly withheld/narrowed;
7. transaction-specific title/risk policy is ratified and referenced, or production authorization remains blocked;
8. there are zero unresolved P0/P1 findings;
9. the RC2 review artifact records the exact tested commit, environment/provider/policy envelope, evidence paths, limitations and verdict;
10. release evidence and cumulative traceability advance only after criteria 1–9 pass.

Until then, the authoritative software release remains `SW1-RC1` and live member funds/orders remain unauthorized.
