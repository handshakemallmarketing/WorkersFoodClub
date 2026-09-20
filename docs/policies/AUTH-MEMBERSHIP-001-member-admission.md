# AUTH-MEMBERSHIP-001 — Membership, Guest and Workforce Admission Policy

**Status:** RATIFIED — REVISED  
**Effective date:** 2026-09-19  
**Authority:** WorkersFoodClub Policy Ratification Register v1.1 (PR-01 through PR-14, PR-31 through PR-34)

## Governing invariants
Membership eligibility is established by approval. Active membership rights require confirmed annual subscription settlement or a valid `EMPLOYEE_SPONSORED_MEMBERSHIP` entitlement. Authentication is required to exercise Member-area capabilities but never creates membership eligibility or rights.

`Guest ≠ Membership-Eligible Applicant ≠ Active Member ≠ Employee ≠ Operator ≠ Admin ≠ System Owner`

`Membership ≠ Authentication ≠ Workforce Authority`

## Guest/non-member access
An unauthenticated person may access only the bounded Guest/non-member area. An Active Member who has not authenticated is treated as a Guest for application-access purposes. Guest access MUST NOT expose Member-only personal, economic, household, commitment, payment, fulfillment or workforce capabilities.

## Membership acquisition
A Guest/non-member may apply. Application alone confers no membership rights. Approval establishes eligibility only. For an ordinary applicant, confirmed settlement of the annual subscription activates membership rights. Payment initiation, unsolicited payment, or payment without required approval MUST NOT manufacture membership.

An ACTIVE employee may instead receive an auditable `EMPLOYEE_SPONSORED_MEMBERSHIP` entitlement. This activates ordinary membership rights without fake zero-value payment and does not create workforce authority.

## Member-area admission
Member-area access requires: authenticated external identity; exactly one valid ACTIVE identity binding to the correct participant; active membership rights and sufficient standing; and successful server-side authorization. Sign-in MUST NOT create participant, eligibility, membership rights, payment settlement, sponsorship entitlement, or authority grant.

## Membership standing
Ordinary lifecycle: `APPLIED -> APPROVED/ELIGIBLE -> ANNUAL_SUBSCRIPTION_SETTLED -> ACTIVE -> GRACE (30 days) -> RESTRICTED/SUSPENDED -> restored or TERMINATED`.

Confirmed qualifying settlement restores standing; payment initiation alone does not. Bounded access for payment, records, support and remediation remains available during economic restriction.

## Employee-sponsored renewal and separation
While workforce standing remains ACTIVE, `EMPLOYEE_SPONSORED_MEMBERSHIP` automatically renews for each annual membership period without generating a member-paid subscription obligation. Workforce suspension, revocation or termination stops future sponsorship renewal but does not retroactively cancel the already-sponsored membership period. Membership remains independently governed through the end of that period unless a separate legitimate membership suspension/termination rule applies.

## Household beneficiaries
A Primary Member may nominate up to two individually identified beneficiaries. Beneficiaries do not independently pay the annual subscription, must satisfy applicable identity and age/service eligibility requirements, and may transact independently only within household/member constraints. Slots may not be sold, rented or commercially transferred. Replacement is subject to a versioned anti-abuse change limit under System Owner authority. Sponsor-standing economic restrictions propagate to beneficiary economic privileges while bounded records/support/remediation access remains available.

## Workforce separation and step-up
Membership and workforce standing are separate state machines. Operator access requires a dedicated Employee/Operator area and additional workforce authentication/step-up. Member authentication alone never grants Operator access.

Authorization follows `Identity -> Persona -> Domain -> Function -> Action/Task -> Constraints`. Default is DENY. System Owner appoints/revokes Admins; Admins grant/revoke bounded Operator permissions within delegated authority; Operators perform only explicitly authorized functions. An Admin cannot create, appoint or promote a System Owner. Sensitive actions may additionally require elevated authentication, reason/evidence, thresholds and/or second approval.

## Required regression evidence
Implementation must prove Guest isolation; eligibility-versus-active-rights separation; ordinary paid activation; employee-sponsored activation and renewal; workforce cessation without retroactive membership cancellation; beneficiary slot/identity/restriction rules; Member authentication without workforce escalation; dedicated workforce step-up; domain/function/action isolation; revocation; and direct server-side enforcement.

## Change control
Any change requires explicit System Owner/designated Governance Authority ratification and synchronized policy, server-side, client-side, state-model/migration where applicable, and regression-evidence updates. UI-only changes cannot alter authority.
