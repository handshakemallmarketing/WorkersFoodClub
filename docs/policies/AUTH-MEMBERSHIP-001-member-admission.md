# AUTH-MEMBERSHIP-001 — Membership, Guest and Workforce Admission Policy

**Status:** RATIFIED — REVISED  
**Effective date:** 2026-09-19  
**Authority:** WorkersFoodClub Policy Ratification Register v1.0 (PR-01 through PR-05, PR-31, PR-32)

## Governing invariants

Membership is established before Member-area authentication. Authentication is required to exercise Member-area capabilities but does not create membership.

`Guest ≠ Member ≠ Employee ≠ Operator ≠ Admin ≠ System Owner`

`Membership ≠ Authentication ≠ Workforce Authority`

A person may possess more than one status, but one status must not silently manufacture another.

## Guest/non-member access

An unauthenticated person may access only the bounded Guest/non-member area. A Member who has not authenticated is treated as a Guest for application-access purposes.

Guest capabilities may include public information and the bounded membership application/activation journey. Guest access MUST NOT expose Member-only personal, economic, household, commitment, payment, fulfillment or workforce capabilities.

## Membership acquisition

A Guest/non-member may apply for membership. Application does not confer membership rights.

For an ordinary applicant, membership rights require:
1. an approved membership application; and
2. confirmed settlement of the required annual membership subscription.

Payment initiation, an unsolicited payment, or payment without the required approved application MUST NOT manufacture membership.

An ACTIVE employee may instead receive an auditable `EMPLOYEE_SPONSORED_MEMBERSHIP` entitlement for the applicable sponsorship period. This satisfies the annual subscription requirement without a fake zero-value payment. It creates ordinary membership rights only; it does not create workforce authority.

## Member-area admission

A Member may enter Member areas only when:
1. the external identity is successfully authenticated;
2. exactly one valid ACTIVE application identity binding resolves that issuer/subject to the correct participant;
3. the participant has valid membership for the requested capability and sufficient membership standing; and
4. normal server-side authorization succeeds.

A Member who is not authenticated receives only Guest access posture.

Sign-in MUST NOT create a participant, membership, membership application, membership approval, payment settlement, sponsorship entitlement, or authority grant.

## Membership standing

The initial annual-membership standing lifecycle is governed as:

`ACTIVE -> GRACE (30 days) -> RESTRICTED/SUSPENDED -> restored or TERMINATED`

Confirmed qualifying settlement restores standing according to policy. Payment initiation alone does not.

Even when economic capabilities are restricted, bounded access necessary for payment, records, support and remediation must remain available.

## Workforce separation and step-up

Membership and workforce standing are separate state machines.

An active employee receives free employer-sponsored membership, but employee status, membership, Operator authority and Admin authority remain independently evaluated.

Operator access requires a dedicated Employee/Operator access area and additional workforce authentication/step-up. Member authentication alone never grants Operator access.

Workforce authorization follows:

`Identity -> Persona -> Domain -> Function -> Action/Task -> Constraints`

Default is DENY. An Operator receives only explicit grants. Operator status does not imply access to every operational domain.

Authority hierarchy:
- System Owner appoints/revokes Admins.
- Admins grant/revoke bounded operational permissions to Operators within delegated authority.
- Operators perform only authorized domain functions/tasks/actions.
- An Admin cannot create, appoint or promote a System Owner.

Sensitive actions may additionally require elevated authentication, reason/evidence, configured thresholds and/or second approval.

## Required regression evidence

At minimum, implementation must prove:
- unauthenticated Guest can use only the bounded Guest/non-member section;
- unauthenticated Member receives Guest posture and cannot access Member APIs/areas;
- non-member cannot authenticate into Member areas and cannot acquire membership by authentication;
- applicant without activated membership cannot access Member economic capabilities;
- approved applicant + confirmed annual subscription settlement activates ordinary membership;
- ACTIVE Member + successful authentication + valid binding/standing can enter Member areas;
- Member authentication alone cannot enter Employee/Operator areas;
- workforce step-up without an ACTIVE workforce grant fails closed;
- Operator with one domain/function grant cannot access sibling domains/functions;
- revoked/suspended workforce authority fails closed independently of membership state;
- `EMPLOYEE_SPONSORED_MEMBERSHIP` activates ordinary membership without creating Operator/Admin authority;
- direct Member and workforce API calls independently enforce server-side authorization.

## Change control

Any change to these authority rules requires explicit System Owner/designated Governance Authority ratification and synchronized policy, server-side, client-side, migration/state-model where applicable, and regression-evidence updates. UI-only changes cannot alter authority.
