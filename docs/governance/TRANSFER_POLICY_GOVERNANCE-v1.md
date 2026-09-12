# TRANSFER_POLICY_GOVERNANCE-v1

Status: RATIFIED GOVERNANCE CHARTER
Effective date: 2026-09-11
Governance actor: Willie Adofo — Founder / Governance Authority
Canonical participant ID: participant:willie-adofo

## Purpose
This charter identifies the human governance authority for transaction transfer-policy decisions in the Ghana Workers Food Club pilot and defines the bounded authority that executable policy ratification may rely upon.

## Governance authority
Willie Adofo — Founder / Governance Authority is the governance actor authorized to approve, reject, amend, supersede, suspend, or revoke Ghana Workers Food Club transfer-policy proposals within the scope of this charter.

The executable identity for this governance actor is `participant:willie-adofo`.

## Authorized action
The bounded executable action is:

- `RatifyTransferPolicy`

The initial target scope is:

- `GH-PILOT-TITLE-RISK`

This charter does not confer unrestricted administrative, payment, fulfillment, data, deployment, release, or system authority.

## Authority grant
The canonical grant to be installed in the governed authority store is:

- grant ID: `grant:willie-adofo:transfer-policy-governance:v1`
- grantor ID: `participant:willie-adofo`
- actor ID: `participant:willie-adofo`
- actions: [`RatifyTransferPolicy`]
- target prefix: `GH-PILOT-TITLE-RISK`
- valid from: `2026-09-11T19:33:00Z`
- no automatic expiry

The grant is policy-scoped. It cannot authorize a different target whose identifier does not begin with the declared target prefix. Any future widening of scope requires an explicit governance change and new evidence.

## Ratification semantics
A transfer policy is executable as ratified only when all of the following hold:

1. The policy content and exact version have been affirmatively approved by Willie Adofo — Founder / Governance Authority or a later validly delegated governance actor.
2. The policy's `authorizedBy` is the canonical participant ID of the approving governance actor.
3. The policy references the exact active authority grant used for ratification.
4. The authority evaluator permits `RatifyTransferPolicy` for the exact policy target at trusted ratification time.
5. Ratification evidence identifies the exact policy version/content approved.
6. The governed registry accepts that exact version under its immutable, sequential version rules.

Caller-supplied claims of authority, UI roles, repository access, provider callbacks, or operator assertions are not substitutes for this authority chain.

## Existing decision
On 2026-09-11, Willie Adofo — Founder / Governance Authority ratified `GH-PILOT-TITLE-RISK` version 1 as written. The decision evidence is recorded at `docs/governance/GH-PILOT-TITLE-RISK-v1-ratification.json`.

That approval authorizes the policy governance decision only. It does not by itself authorize production release, live funds, deployment, or represent legal advice or statutory interpretation.

## Change control
A change to the title/risk trigger, transaction type, quantity semantics, jurisdictional scope, governance actor, or authority scope requires a new governed decision. An altered policy body or later version cannot inherit version 1 ratification merely because it retains the same policy ID.

Revocation or suspension of the authority grant prevents new ratifications from using it. Historical ratification evidence remains immutable and must not be rewritten.
