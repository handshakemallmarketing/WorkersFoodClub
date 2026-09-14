# SW1 — Paystack Live Activation Readiness Gate

Status: READINESS_ONLY — LIVE FUNDS WITHHELD
Parent release baseline: `SW1-RC3` plus ratified Production application-access activation
Starting main commit: `1e9a591cdba48089cc868c05cbc51a2761162af3`

## Purpose

This gate prepares the system for a future, separately authorized Paystack live-mode activation without creating, reading, provisioning, synchronizing, or using live Paystack credentials and without authorizing live funds.

Production application access is already enabled and ratified under the separately completed Production application-access activation gate. That authorization does not extend to live payments.

## Current authorization boundary

Authorized now:

- Production application access.
- Readiness inspection and falsification that does not move live funds.
- Test-mode Paystack provider rehearsal.
- Documentation, runbook, kill-switch, rollback, evidence, watchdog/fail-safe, and workflow preparation that does not require live credentials.

Not authorized now:

- Paystack live mode.
- Live member funds.
- Creation, reading, provisioning, synchronization, copying, or use of live Paystack credentials.
- Any live charge, live refund, live transfer, or other live payment-provider transaction.
- Any persistent deployment that enables live Paystack processing.

Generic continuation instructions do not authorize these actions.

## Evidence already established

The RC3 evidence establishes, in Paystack TEST mode:

- provider initiation;
- provider transaction verification;
- delayed transaction re-query;
- refund creation;
- refund status re-query;
- raw-body HMAC-SHA512 webhook verification;
- tamper and bad-signature rejection;
- test/live credential separation;
- operator reconciliation procedure;
- production identity and application-owned authority boundaries.

The RC3 review explicitly did not claim live merchant webhook delivery authenticity and did not authorize Paystack live mode or live funds.

## Mandatory prerequisites before any future live activation

A future live-payment activation may begin only after all of the following are satisfied and evidenced:

1. Explicit user authorization for Paystack live activation and live funds.
2. Approved live-credential provisioning path with secrets never committed to the repository or emitted to logs.
3. Exact Paystack production merchant/account binding recorded as controlled evidence.
4. Separate live/test environment isolation proven at runtime.
5. A default-OFF live-payment feature switch with an independently proven rollback/kill switch.
6. Live webhook endpoint registration for the exact production merchant/account, with the raw-body signature handler, replay controls, reference binding, and tamper rejection ready for production traffic. Authentic live delivery itself is not a pre-activation prerequisite when no prior live event exists; it must be proved from the bounded authorized live transaction before any final live-enabled verdict.
7. Provider reference uniqueness and application checkout/reference binding proven for the live adapter without moving live funds.
8. Operator reconciliation and incident runbooks reviewed against the live merchant/account, including timeout/unknown-outcome handling by exact-reference re-query.
9. Observability confirmed to exclude secrets, bearer credentials, raw payment tokens, and sensitive provider payload material.
10. A bounded minimal live transaction plan approved before execution, with an explicit amount, actor, merchant/account, immutable application reference, expected canonical effects, reconciliation procedure, and rollback path.
11. An independent fail-safe exists so live mode cannot remain enabled merely because the activating workflow is cancelled, times out, loses its runner, or otherwise exits non-successfully. The preferred design is a short-lived activation lease/TTL or equivalent independently enforced watchdog that returns the live switch to OFF unless a separately verified success condition renews or ratifies it.
12. The activation workflow has a cleanup/containment path covering assertion failure, cancellation, timeout, infrastructure failure, and runner loss; the activating job alone must not be the sole containment mechanism.
13. Post-activation adversarial falsification is defined for unauthorized access, replay, actor substitution, scope escalation, duplicate effect, provider/application state divergence, and live webhook authenticity.
14. Any unexpected result requires immediate disablement attempt, exact-reference reconciliation for any possibly accepted transaction, and independent proof of the resulting containment state.

## Activation architecture requirements

The future activation workflow must be deliberately gated and fail closed. It must:

- use an exact reviewed commit SHA;
- require a Production environment approval boundary;
- refuse to run unless the exact governed authorization trigger is present;
- verify all required credentials exist without printing them;
- verify merchant/account identity before any charge;
- prove the live-payment feature switch is initially OFF;
- arm an independent expiry/watchdog before enabling live mode;
- enable only the bounded live-payment surface approved by the authorization;
- execute only the specifically approved minimal transaction using a pre-recorded immutable provider/application reference;
- never issue a second live charge merely because the first request timed out or returned an unknown outcome;
- on timeout or ambiguous provider outcome, re-query the exact reference and preserve an explicit `LIVE_TRANSACTION_OUTCOME_UNRESOLVED` state until provider and canonical evidence are reconciled or the incident is escalated;
- prove authentic live webhook delivery from that bounded transaction before any final `GO` verdict, including raw-body HMAC-SHA512 verification, exact merchant/account binding, reference binding, replay rejection, and tamper rejection;
- verify canonical and provider evidence agree;
- preserve idempotency and reference binding;
- run post-activation adversarial falsification before ratifying persistent live enablement;
- on every non-successful workflow exit, invoke or rely on an independently enforced containment mechanism that returns live mode to OFF without requiring the original runner to survive;
- re-prove the disabled state after rollback or watchdog expiry;
- if disabled state cannot be independently re-proven, enter emergency containment rather than claiming rollback success.

## Ambiguous transaction outcome rule

A charge request that times out, loses its response, or otherwise has an unknown result is not treated as failed and is never safe to retry blindly. The exact immutable reference must be re-queried at Paystack and reconciled against canonical application state. Until resolved:

- no replacement live transaction may be initiated;
- live-mode rollback/disablement must still be attempted;
- the incident remains open as `LIVE_TRANSACTION_OUTCOME_UNRESOLVED`;
- operators must preserve provider/application evidence and follow the reconciliation runbook;
- no final activation-success verdict may be issued.

## Release decision states

Readiness success before live authorization:

`GO_PAYSTACK_LIVE_READINESS_ACTIVATION_WITHHELD`

Future activation success, only after separate explicit authorization, bounded live transaction proof, authentic live webhook delivery proof, reconciliation, adversarial falsification, and independently verified containment controls:

`GO_PAYSTACK_LIVE_ENABLED_BOUNDED_LIVE_FUNDS_AUTHORIZED`

Activation failure where live mode is independently re-proven OFF:

`NO_GO_PAYSTACK_LIVE_DISABLED_OR_ROLLED_BACK`

Transaction outcome unknown but live mode independently re-proven OFF:

`NO_GO_PAYSTACK_LIVE_DISABLED_TRANSACTION_OUTCOME_UNRESOLVED`

Rollback/kill-switch/watchdog state cannot be independently verified:

`CRITICAL_PAYSTACK_LIVE_CONTAINMENT_UNPROVEN`

The critical verdict means containment is not assumed. It requires emergency operator escalation, no further live transaction attempts, and continued independent verification until the live surface is proven disabled.

## Current decision

This gate is readiness-only. Production application access remains enabled. Paystack live mode and live funds remain unauthorized and must remain disabled until a later explicit authorization satisfies this gate.