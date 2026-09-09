# SW1-08B — Inventory Transform/Allocation Conservation Remediation

Status: IMPLEMENTATION_IN_PROGRESS

This remediation closes the cross-ledger conservation gap identified by independent review: a lot already allocated to a member obligation must not also be consumable by a lineage transform.

Acceptance criteria:
- each transform input is bounded by `GovernedPilotInventoryService.availability()`;
- allocated quantity therefore reduces transformable quantity as well as allocatable quantity;
- a fully allocated lot rejects transformation before any lineage mutation;
- the regression is covered by an adversarial test;
- traceability and release evidence record the bounded remediation without claiming production launch.

Next after merge: SW1-09 conformance hardening and end-to-end constitutional vertical-slice replay.
