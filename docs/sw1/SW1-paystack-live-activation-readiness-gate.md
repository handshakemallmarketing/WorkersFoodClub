# SW1 — Paystack Live Bounded-Transaction Readiness Gate

Status: HISTORICAL BOUNDED-TRANSACTION SAFETY CONTROL — NOT A SECOND GLOBAL SERVICE-ACTIVATION GATE

## Canonical interpretation

Paystack provider availability is governed by the System Settings control plane:

`CONFIGURE -> DEPLOY -> TEST -> EXPLICITLY ACTIVATE -> FAIL CLOSED`

After a successfully deployed and tested Paystack configuration is explicitly activated by the authorized System Owner, there is **no additional global `AUTHORIZE LIVE FUNDS` service-activation button or gate**.

This SW1 control exists at a different boundary. It governs a specifically approved **bounded live transaction** and preserves transaction-level safeguards including exact reference, actor, amount and currency binding; candidate/runtime binding; short-lived authorization; independent watchdog containment; idempotency; reconciliation; and evidence durability.

Legacy field names such as `live_funds_authorized` and `paystack_live_mode_authorized` in the durable bounded-transaction evidence schema are therefore interpreted only as historical evidence that the **specific transaction envelope** was authorized for live execution. They must not be read by Settings or any other component as a second global provider-activation state.

## Separation of authority

### Global provider activation

Controlled only by the external-service Settings lifecycle and its System Owner authority. Production application enablement does not implicitly activate Paystack.

### Bounded transaction execution

A live transaction may execute only when all applicable transaction safeguards succeed. Service activation alone never bypasses these controls.

The bounded authorization must identify one immutable transaction envelope:

- exact provider/application reference;
- exact actor;
- exact amount;
- exact currency;
- exact merchant/account;
- exact candidate/runtime SHA;
- finite authorization expiry;
- independent watchdog evidence.

Reservation and claim are one-use, durable, fail-closed transitions. Unknown transaction outcomes are never blindly retried; the exact reference is reconciled against provider and canonical evidence.

## Fail-closed invariants

- No browser claim creates transaction authority.
- No Settings activation creates a transaction authorization record.
- No transaction authorization record activates the global Paystack provider.
- Missing, expired, rebound, duplicated, unverifiable or already-claimed authorization fails closed.
- Independent watchdog evidence is required and revalidated at claim.
- Provider/reference or canonical-evidence disagreement remains unresolved until reconciled.
- A timeout or ambiguous provider response does not authorize a replacement charge.
- Transaction-level authorization, idempotency, watchdog, reconciliation and evidence controls remain authoritative after global provider activation.

## Historical compatibility

Migration `010_paystack_live_governance_evidence.sql` is already part of durable migration history. Its `live_funds_authorized` and `paystack_live_mode_authorized` columns are retained to avoid rewriting applied migration history. Their canonical scope is **bounded transaction evidence only**. New code and documentation must not describe them as a second global live-funds activation ceremony.

## Release interpretation

A successful bounded-transaction proof means only that the specifically approved transaction envelope passed its transaction safeguards. It does not create or ratify a separate persistent global Paystack activation state.

A failed or unverifiable bounded transaction remains fail closed and requires reconciliation/containment according to the transaction-control implementation.
