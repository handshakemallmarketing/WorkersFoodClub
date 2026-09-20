# WorkersFoodClub Policy Ratification Register v1.0

Status: OWNER-RATIFIED POLICY BASELINE
Ratification date: 2026-09-19
Governance authority: System Owner
Scope: WorkersFoodClub initial operational policy baseline

This register formalizes owner decisions Q1-Q32. It supplies business-policy authority; it does not by itself prove implementation, runtime evidence, legal compliance, or launch authorization. Code may implement this policy baseline but may not silently amend it.

## 1. Access, identity, membership and workforce

### PR-01 Guest access
Unauthenticated persons may access only the bounded Guest/non-member area. Guest access may expose public information and membership-application journeys but no Member or workforce capability.

### PR-02 Membership and authentication
Membership is established before Member-area authentication. A Member who is not authenticated is treated as a Guest for application access. Authentication is required before a Member may enter Member areas. Authentication proves identity/access eligibility; it does not itself create membership.

### PR-03 Membership acquisition
A Guest/non-member may apply for membership. Application alone confers no membership rights. For an approved ordinary applicant, confirmed settlement of the required annual membership subscription activates membership rights. An unsolicited payment or payment without required approval must not manufacture membership.

### PR-04 Operator step-up
Operator access requires additional workforce authentication/step-up through a dedicated Employee/Operator access area. Member authentication alone never grants Operator access.

### PR-05 Employee-sponsored membership
Membership and workforce standing are separate state machines. An approved ACTIVE employee receives employer-sponsored annual membership with no member-paid annual subscription obligation. The entitlement must be durably and audibly recorded as EMPLOYEE_SPONSORED_MEMBERSHIP. It confers ordinary membership rights only and does not itself confer Employee, Operator, Admin, domain, function, task, action, or System Owner authority.

Membership state and workforce state must not silently manufacture or rewrite one another.

### PR-06 Operator authorization model
Operator is a workforce class, not a universal permission level. Authorization is composable and bounded by Domain -> Function -> Action/Task -> Constraints.

### PR-07 Default deny
No Operator permission is inferred from employment or Operator status. No explicit grant means no access.

### PR-08 Authority hierarchy
System Owner appoints/revokes Admins. Admins grant/revoke bounded operational permissions to Operators within delegated authority. Operators perform only authorized domain functions. An Admin cannot create, promote, or appoint a System Owner.

### PR-09 Sensitive actions
High-risk actions require the applicable explicit permission and may additionally require reason/evidence, elevated authentication, thresholds, and/or second approval. Routine domain access must not imply high-risk mutation authority.

## 2. Membership standing and household

### PR-10 Grace period
Annual membership delinquency uses a 30-day grace period rather than immediate suspension. The governed lifecycle is ACTIVE -> GRACE -> RESTRICTED/SUSPENDED as applicable. Members must retain bounded access needed for payment, records, support and remediation.

### PR-11 Restoration
Payment initiation does not restore standing. Confirmed qualifying settlement restores membership standing according to policy.

### PR-12 Household entitlement
Initial household entitlement is one Primary Member plus up to two eligible household beneficiaries.

### PR-13 Beneficiary identity and transactions
Beneficiaries use individual identities and may transact independently within household and membership constraints. Shared credentials are not the household authorization mechanism.

### PR-14 Sponsor restriction
Household economic privileges derive from the sponsoring membership. Restriction of the sponsoring membership restricts beneficiary economic privileges, while bounded records/support/remediation access remains available.

## 3. Commerce and payment qualification

### PR-15 Offer-specific qualification threshold
The Constitution does not fix one universal deposit percentage. Each governed offer declares its minimum commitment payment/qualification threshold. Qualified demand requires a valid commitment plus cumulative confirmed settlement meeting the offer's threshold.

### PR-16 Below-threshold payment
Confirmed payment below the applicable threshold remains real economic evidence but the commitment remains UNQUALIFIED for pooled demand until the threshold is met.

### PR-17 Overpayment
Overpayment must be explicitly recorded and resolved through a governed member credit/refundable-balance/remedy path. It must not manufacture additional ordered quantity.

### PR-18 Reversal
A reversal is a new canonical event and does not rewrite historical settlement. If net qualifying settlement falls below threshold before irreversible downstream activity, qualification may be removed according to policy. After irreversible activity, the system creates an exception/receivable/remedy rather than rewriting history.

## 4. Credit and payroll

### PR-19 Member credit
Item-level/member credit is WITHHELD for initial launch. No unpaid order, operator discretion, or UI state may silently create credit authority. A separate ratified credit policy is required before activation.

### PR-20 CAGD/payroll deduction
CAGD/payroll deduction is WITHHELD for initial live operation. Architecture may prepare for it, but no mandate, deduction instruction, or expected payroll event becomes settlement without separately ratified policy and operational/legal/reconciliation authority.

## 5. Custody, acceptance, title and risk

### PR-21 Title transfer
For the Ghana pilot member food-order transaction, title transfers only upon canonical ACCEPTANCE of the applicable quantity.

### PR-22 Physical-loss risk
Ordinary physical-loss risk transfers only upon canonical ACCEPTANCE of the applicable quantity. Physical handover establishes custody, not acceptance, title, or risk transfer.

### PR-23 Partial acceptance
Acceptance, title and risk are quantity-aware. Partial acceptance transfers title/risk only for accepted quantity. Missing, rejected, damaged or non-conforming quantity remains in governed exception/replacement/refund disposition until resolved.

These owner decisions authorize reconciliation and formal ratification of GH-PILOT-TITLE-RISK-v1 subject to required governance evidence and any required Ghana legal review. Code must not claim that legal review has occurred merely from this owner policy decision.

## 6. Refunds, remedies and corrections

### PR-24 Refund authority separation
Refund handling separates REQUEST_REFUND, APPROVE_REFUND and EXECUTE_REFUND authority. Bounded routine thresholds may be delegated; higher-risk refunds require elevated authority according to configured governance thresholds.

### PR-25 Immutable transaction history
Refunds, credits, replacements and other remedies do not erase or mutate the original transaction. They are additive canonical events linked to the original transaction.

### PR-26 Corrections
Administrators and Operators may not directly rewrite canonical economic or physical history to correct mistakes. Corrections use additive correction/exception events from which current state is derived.

## 7. Recovery

### PR-27 Recovery objective
Production recovery policy targets RPO <= 1 hour and RTO <= 4 hours. Production must have automated backup/snapshot capability, adequate retention, documented recovery procedure, periodic restore drills and durable recovery evidence. Backup existence without restore proof is insufficient.

## 8. Constitution and governance

### PR-28 Constitution reconciliation and ratification
C0-C10 are to become the binding WorkersFoodClub constitutional corpus only after exact substantive text is reconstructed/discovered, reconciled against this ratified policy baseline, conflicts are resolved, and a canonical WorkersFoodClub Constitution v1.0 is formally ratified. Historical references to C0-C10 do not authorize blindly ratifying unknown or conflicting text.

### PR-29 Authority hierarchy of artifacts
The governing hierarchy is:
1. WorkersFoodClub Constitution
2. System Owner-ratified Policies
3. Domain Rules
4. Server-side Implementation
5. UI / Projections

A lower layer may implement but may not silently amend a higher layer. Where conflict exists, the higher authoritative layer controls until governance explicitly changes it.

### PR-30 Policy ratification authority
The System Owner/designated Governance Authority ratifies or amends business policy. Agents may identify gaps, propose text, test implications and implement ratified decisions. Admins and Operators execute delegated policy but cannot create governing policy by changing code or configuration outside delegated policy authority.

### PR-31 Composable authorization invariant
Privileged authorization follows Identity -> Persona -> Domain -> Function -> Action/Task -> Constraints. Possession of one permission does not imply sibling or higher-risk permissions. Default is DENY.

### PR-32 Employee-sponsored activation mechanism
An ACTIVE employee's free membership is activated through the auditable EMPLOYEE_SPONSORED_MEMBERSHIP entitlement rather than a fake zero-value payment. This satisfies the annual subscription requirement for the sponsored membership period while preserving independent workforce authorization.

## 9. Canonical state-machine guidance

### Access
GUEST/UNAUTHENTICATED -> bounded Guest area only
MEMBER + UNAUTHENTICATED -> Guest access posture
MEMBER + AUTHENTICATED + sufficient standing -> Member area
EMPLOYEE/OPERATOR -> Member/public identity context + dedicated workforce step-up + active workforce grant -> bounded Operator area
ADMIN -> elevated workforce authority within delegated administration scope
SYSTEM_OWNER -> reserved governance authority

### Ordinary membership
APPLIED -> APPROVED -> ANNUAL_SUBSCRIPTION_SETTLED -> ACTIVE -> GRACE(30 days) -> RESTRICTED/SUSPENDED -> restored or TERMINATED

### Employee-sponsored membership
ACTIVE_WORKFORCE + valid sponsorship entitlement -> ACTIVE membership for sponsorship period. Workforce authority remains separately evaluated.

### Workforce
INVITED -> ACTIVE -> SUSPENDED -> REVOKED/TERMINATED

## 10. Gap-disposition semantics

Owner ratification changes a policy gap to CLOSED-BY-POLICY only. A journey is not PROVEN until the applicable server-side authority, durable state, economic/physical truth, happy/adverse paths, idempotency/concurrency where applicable, audit lineage, recovery and runtime evidence exist.

Implementation teams must classify follow-on work as:
- CLOSED-BY-POLICY
- IMPLEMENTATION-REQUIRED
- EVIDENCE-REQUIRED
- EXTERNAL-REVIEW-REQUIRED
- STILL-OPEN

## 11. Immediate reconciliation requirements

1. Reconcile AUTH-MEMBERSHIP-001 with PR-01 through PR-05, especially the prior member-first workforce requirement and the new employee-sponsored membership rule.
2. Reconcile GH-PILOT-TITLE-RISK-v1 with PR-21 through PR-23 and complete formal governance evidence before changing its ratification status.
3. Reconstruct/discover C0-C10 and reconcile them against PR-01 through PR-32 before constitutional ratification.
4. Update the master journey truth matrix so policy-blocked journeys distinguish resolved policy authority from remaining implementation/evidence gaps.
5. Consolidate the decision register so this ratification is a canonical indexed owner decision.
6. Preserve all existing WITHHELD live-money and production-mutation boundaries unless separately authorized.
