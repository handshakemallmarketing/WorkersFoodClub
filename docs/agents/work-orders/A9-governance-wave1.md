# A9 Governance — Wave 1 Work Order

Status: ACTIVE
Parent control plane: `cb467afd2bdaea85f41e32a23239c26c6960e6c4`

## Bounded scope
Implement and falsify governed system-owner and operator administration: primary system owner plus backup-owner roles, limited operators, role/permission grants, suspensions/revocations, approval boundaries and feature-control authority.

## Required behavior
- Preserve C0–C10 and Production Access v2 as superior authority; application roles cannot override constitutional release/payment/fulfillment boundaries.
- Separate identity, membership and authority grants.
- Least privilege for business, warehouse, marketing/promotions, delivery and other operator profiles.
- Grant/revoke/suspend actions require durable attribution and audit lineage.
- Feature controls must distinguish configuration from authorization; toggling a feature cannot manufacture authority.
- Prevent self-escalation, stale-grant use and silent rebinding.

## Evidence required
Positive/negative authorization matrix, privilege-escalation tests, revoked/stale authority tests, replay/race tests, recovery/audit tests, traceability, exact-head CI and authorized runtime evidence.

## Authority boundary
No live Paystack, live credentials, live funds, Production payment/fulfillment authority expansion, or self-merge. Escalate consequential policy gaps to A0/human decision.