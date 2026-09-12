# SW1-RC2 Operator Incident and Recovery Runbooks

Status: RC2 inspectable operational control
Scope: production pilot candidate only
Canonical-history rule: recovery is additive. Operators must never edit, delete, rewrite, reorder, backdate or directly mutate canonical events, payment evidence, obligation history, inventory lineage, fulfillment acceptance, remedy history, or recovery audit records.

## 1. Universal incident protocol

For every incident below:

1. Open an incident record with correlation ID, UTC discovery time, reporter, affected participant/obligation/provider reference where known, environment, deployment commit and current canonical aggregate version.
2. Freeze the smallest consequential surface necessary. Do not globally disable unrelated read access or unrelated fulfilled obligations unless containment requires it.
3. Read canonical state first. Projections, dashboards, provider portals, logs and alerts are diagnostic evidence only and never outrank canonical state.
4. Preserve raw external/provider evidence in the approved evidence store after redaction rules are applied. Never paste secrets, raw credentials or sensitive verification documents into tickets or operational logs.
5. Decide whether the outcome is known, failed, or ambiguous. Ambiguous external economic outcomes stay ambiguous until reconciled from the provider/system of record.
6. Recovery commands must retain the original obligation, participant, offer, amount, currency and prior-operation identity. Redirecting a failed operation to another subject is prohibited.
7. Every recovery attempt must be attributable to an operator/authority grant and use a new command/event identifier while linking to the original failed/ambiguous operation.
8. Close only after canonical state, material projections and external provider state reconcile, or explicitly record the unresolved state and escalation owner.

## 2. Ambiguous payment outcome

Trigger: client/API timeout, provider timeout, missing callback, conflicting local/provider observations, or unknown provider response after initiation.

Containment:
- Do not create a second payment intent for the same obligation merely because the first request timed out.
- Do not mark payment CONFIRMED or FAILED from timeout semantics alone.
- Prevent fulfillment from relying on an unverified payment outcome.

Recovery:
1. Locate the original payment intent by obligation and provider reference.
2. Query Paystack transaction verification using the original provider reference.
3. Authenticate and normalize the provider result through the production-provider boundary.
4. If terminal and bound to the same amount/currency/obligation/participant/offer, reconcile it additively through the canonical payment service.
5. If the provider still reports pending/unknown or cannot be queried reliably, keep the incident open as PAYMENT_RECONCILIATION_AMBIGUOUS and retry query according to bounded operational policy; never blindly re-charge.
6. Escalate prolonged ambiguity to finance/operator review without fabricating payment truth.

Exit: canonical payment evidence and provider state agree, or ambiguity remains explicitly recorded with live fulfillment blocked.

## 3. Duplicate or replayed provider callback

Trigger: same callback redelivered, same provider reference with a new provider/webhook event ID, or reordered callback.

Containment:
- Preserve the raw authenticated callback evidence.
- Do not manually deduplicate by deleting prior evidence.

Recovery:
1. Verify provider authenticity before parsing semantics.
2. Reconcile through the canonical payment service using provider reference and event identity.
3. Same-event replay must return the existing economic result.
4. Same provider reference with equivalent terminal state must not create duplicate economic effect.
5. A different terminal observation must supersede prior evidence additively only through the governed reconciliation path; operators must not rewrite the earlier record.
6. If the callback conflicts in amount, currency, obligation binding or provider reference ownership, classify as payment-integrity incident and block consequential progression.

Exit: no duplicate economic effect; canonical evidence chain remains intact.

## 4. Refund timeout, retry or redelivery

Trigger: refund API timeout, refund remains pending/processing, repeated completion callback, or unknown refund outcome.

Containment:
- Never issue a second refund solely because the first request timed out.
- Preserve the original refund authorization and provider refund reference.

Recovery:
1. Confirm an existing canonical refund/remedy authorization for the exact obligation and amount.
2. Query the provider using the original refund/provider reference before retrying any economic operation.
3. If provider reports processed, record completion once through the governed remedy path.
4. If pending/processing, keep remedy unresolved and retry status query, not a new refund instruction.
5. If provider reports failed, create a new governed retry attempt linked to the same authorization; do not change beneficiary, amount, currency or target obligation.
6. Duplicate/redelivered completion must be idempotent and preserve the original completion event/provider reference.

Exit: remedy is COMPLETED exactly once or remains explicitly unresolved/failed with escalation.

## 5. Stuck authorized operation

Trigger: an authorized consequential command is accepted but does not reach a terminal governed outcome because of process loss, dependency failure or unknown execution status.

Containment:
- Do not create a substitute operation against another target.
- Preserve original command payload hash/identity and authority lineage.

Recovery:
1. Inspect durable command execution/fence state and canonical events.
2. If canonical effect exists, return/rebuild the existing outcome rather than replaying a new effect.
3. If no effect exists and the operation is safely retryable, execute a governed recovery using the original semantic payload and a new recovery command linked to the prior operation.
4. Reject any recovery payload that changes target, participant, amount, quantity, currency, offer, lot or obligation.
5. Record recovery actor, authority grant, reason and predecessor command/event.

Exit: original operation reaches one canonical outcome, or remains explicitly stuck with escalation.

## 6. Database outage and restore

Trigger: production database unavailable, suspected corruption, durability failure, or recovery from approved backup required.

Containment:
- Stop consequential writes if durable canonical persistence is unavailable.
- Never restore over the active production database.
- Preserve connection/configuration evidence without logging credentials.

Recovery:
1. Identify the approved source backup, timestamp and source environment.
2. Provision an isolated clean restore target.
3. Verify the target is not the active production database by hostname/identifier and explicit restore guard.
4. Restore into the isolated target using the approved backup/restore tooling.
5. Run canonical integrity checks and deterministic projection rebuild/reconciliation.
6. Compare material obligation, payment, inventory, fulfillment, remedy and projection positions against expected evidence.
7. Promote/switch only through the separately governed environment procedure after operator approval; never mutate canonical records to make projections match.
8. Record backup identifier, target identifier, times, checks, result and operator.

Exit: restored canonical state passes integrity/reconciliation, or restoration is rejected and incident remains open.

## 7. Compromised or rotated secret

Trigger: suspected exposure, unauthorized use, accidental logging, staff departure, scheduled rotation, or provider credential revocation.

Containment:
- Revoke/rotate the affected credential at the authoritative provider/platform immediately where safe.
- Disable consequential integration if authenticity can no longer be established.
- Do not place the old or new secret in tickets, chat, commits or logs.

Recovery:
1. Identify affected environment/provider and blast radius from audit metadata.
2. Rotate/revoke using platform secret management.
3. Update only the intended environment; sandbox/test and production credentials remain distinct.
4. Redeploy/restart as required and run fail-closed configuration checks.
5. Verify old credentials no longer authorize provider operations.
6. Review operational logs through redaction controls for accidental leakage and preserve only redacted evidence.
7. Reconcile provider transactions occurring during the exposure window.

Exit: new credential active only in intended environment, old credential revoked, reconciliation complete, no secret emitted in evidence.

## 8. Suspected unauthorized access or authority bypass

Trigger: repeated authorization failures, cross-participant identifier substitution, wrong-scope grant use, suspicious operator activity, or access inconsistent with tenant/member context.

Containment:
- Revoke or suspend the implicated identity/grant/session through identity/authority controls as appropriate.
- Do not revoke unrelated participant authority without evidence.
- Preserve attributable audit metadata.

Recovery:
1. Correlate actor, grant IDs, attempted actions, targets and times.
2. Verify whether any canonical consequential effect actually occurred.
3. If no effect occurred, retain the failed attempts as security evidence and close only after access containment.
4. If an effect occurred, do not delete or edit it. Open the applicable governed remedy/reversal process based on the actual canonical event and external policy.
5. Review for cross-participant/tenant contamination and sensitive-data exposure.
6. Rotate credentials where compromise is plausible and notify governance/privacy owner as required.

Exit: access path contained and every consequential effect accounted for through additive canonical history.

## 9. Projection corruption, mutation or staleness

Trigger: projection differs from canonical state, rebuild fails, stale projection alert, or attempted direct projection mutation.

Containment:
- Treat projections as disposable derived state.
- Block decisions that require a projection known to be stale when canonical query cannot safely substitute.
- Never edit canonical history to match a projection.

Recovery:
1. Record projection version/checkpoint and canonical high-water mark.
2. Rebuild projection deterministically from canonical events into a clean target.
3. Compare material positions before cutover.
4. Replace/repoint derived projection only after successful reconciliation.
5. If deterministic rebuild differs, classify as application/canonical interpretation defect and keep projection out of service until corrected.

Exit: rebuilt projection matches canonical material positions and freshness target.

## 10. Inventory or fulfillment discrepancy

Trigger: physical count differs from lineage/allocation, wrong lot appears picked, member acceptance differs from expected quantity, or fulfillment state conflicts with physical evidence.

Containment:
- Stop movement/fulfillment of the affected lot/allocation only.
- Preserve physical count, lot identity, pickup/acceptance and operator evidence.
- Do not edit quantities in canonical lineage to force balance.

Recovery:
1. Reconstruct lineage from receive -> transform (if any) -> allocation -> pick/pack -> fulfillment-ready -> acceptance/exception.
2. Confirm no allocated quantity was also consumed by a transform and no quantity was double allocated/discharged.
3. Record new observed physical evidence.
4. Use governed exception/remedy flows for shortages, quality failures or acceptance discrepancies.
5. Any corrective inventory event must be additive, attributable and linked to the discrepancy evidence; direct canonical balance adjustment is prohibited.

Exit: physical and canonical positions reconcile or affected inventory remains quarantined with governed exception/remedy open.

## 11. Escalation and stop conditions

Immediate production stop for the affected consequential surface is required when any of these are true:
- provider authenticity cannot be established;
- canonical database durability is unavailable;
- unknown payment/refund outcome would otherwise trigger a second economic effect;
- authority boundary appears bypassed;
- restore target might be the active production database;
- canonical and physical/economic evidence cannot be reconciled;
- title/risk policy needed to decide a remedy is missing or ambiguous.

No operator may resolve a stop condition by inventing business/legal policy or rewriting canonical history.
