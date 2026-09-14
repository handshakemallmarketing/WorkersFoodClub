# SW1 — Paystack Live Activation Readiness Gate

Status: READINESS_ONLY — LIVE FUNDS WITHHELD
Parent release baseline: `SW1-RC3`
Starting main commit: `6b9d14f91220142654d8f2e1333a9ff69935506a`

## Purpose

This gate prepares the system for a future, separately authorized Paystack live-mode activation without creating, reading, provisioning, synchronizing, or using live Paystack credentials and without authorizing live funds.

Production application access is already enabled under the separately completed Production application access activation gate. That authorization does not extend to live payments.

## Current authorization boundary

Authorized now:

- Production application access.
- Readiness inspection and falsification that does not move live funds.
- Test-mode Paystack provider rehearsal.
- Documentation, runbook, kill-switch, rollback, evidence, and workflow preparation that does not require live credentials.

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

A future live-payment activation may proceed only after all of the following are satisfied and evidenced:

1. Explicit user authorization for Paystack live activation and live funds.
2. Approved live-credential provisioning path with secrets never committed to the repository or emitted to logs.
3. Exact Paystack production merchant/account binding recorded as controlled evidence.
4. Separate live/test environment isolation proven at runtime.
5. A default-OFF live-payment feature switch with an independently proven rollback/kill switch.
6. Live webhook endpoint registration for the exact production merchant/account.
7. Authentic live Paystack merchant webhook delivery proof using the production secret, with raw-body HMAC-SHA512 verification and replay/tamper rejection.
8. Provider reference uniqueness and application checkout/reference binding re-proven for the live adapter.
9. Operator reconciliation and incident runbooks reviewed against the live merchant/account.
10. Observability confirmed to exclude secrets, bearer credentials, raw payment tokens, and sensitive provider payload material.
11. A bounded minimal live transaction plan approved before execution, with an explicit amount, actor, merchant/account, expected canonical effects, and rollback path.
12. After activation, immediate adversarial falsification of unauthorized access, replay, actor substitution, scope escalation, duplicate effect, and provider/application state divergence.
13. Any unexpected result requires immediate live-payment disablement and independent proof that no further live transactions can be initiated.

## Activation architecture requirements

The future activation workflow must be deliberately gated and fail closed. It must:

- use an exact reviewed commit SHA;
- require a Production environment approval boundary;
- refuse to run unless the exact authorization trigger is present;
- verify all required credentials exist without printing them;
- verify merchant/account identity before any charge;
- prove the live-payment feature switch is initially OFF;
- enable only the bounded live-payment surface approved by the authorization;
- execute only the specifically approved minimal transaction;
- verify canonical and provider evidence agree;
- preserve idempotency and reference binding;
- automatically disable live mode on any failed post-activation assertion;
- re-prove the disabled state after rollback.

## Release decision states

Readiness success before live authorization:

`GO_PAYSTACK_LIVE_READINESS_ACTIVATION_WITHHELD`

Future activation success, only after separate explicit authorization and successful bounded live proof:

`GO_PAYSTACK_LIVE_ENABLED_BOUNDED_LIVE_FUNDS_AUTHORIZED`

Any failed activation or rollback uncertainty:

`NO_GO_PAYSTACK_LIVE_DISABLED_OR_ROLLED_BACK`

## Current decision

This gate is readiness-only. Production application access remains enabled. Paystack live mode and live funds remain unauthorized and must remain disabled until a later explicit authorization satisfies this gate.