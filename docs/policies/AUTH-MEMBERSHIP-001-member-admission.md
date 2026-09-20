# AUTH-MEMBERSHIP-001 — Membership, Guest and Workforce Admission Policy

**Status:** RATIFIED — REVISED  
**Effective date:** 2026-09-20  
**Authority:** WorkersFoodClub Policy Ratification Register v1.1 (PR-01 through PR-14, PR-31 through PR-34)

## Governing invariants
Ordinary membership enrollment is self-service. Administrative approval is optional, not a universal prerequisite. Active membership rights require confirmed annual subscription settlement or a valid `EMPLOYEE_SPONSORED_MEMBERSHIP` entitlement. Authentication is required to exercise Member-area capabilities but never creates membership or rights.

`Guest ≠ Applicant ≠ Active Member ≠ Employee ≠ Operator ≠ Admin ≠ System Owner`

`Enrollment ≠ Review ≠ Payment/Activation ≠ Authentication ≠ Workforce Authority`

## Guest/non-member access and self-service enrollment
An unauthenticated Guest may submit a membership application directly. Enrollment MUST NOT require Google, OIDC, or any other identity-provider authentication. The application collects authoritative enrollment/contact information, including the applicant's government ministry, department, agency or employer where applicable. Application submission creates no Member-area authority.

The default enrollment mode is `AUTO`: a valid application may immediately provision an INACTIVE membership record and annual subscription invoice without administrative approval. A governed `MANUAL` review mode may be used where a program, risk rule, exception or eligibility regime requires review. Review therefore remains available but is not a mandatory step in the ordinary journey.

Confirmed annual subscription settlement is the ordinary activation boundary. Payment initiation alone does not activate membership. Activation issues or preserves the immutable public Member ID.

## Authentication provider independence
Google authentication is completely optional. Google/OIDC may be offered as one Member Sign In method, but WorkersFoodClub membership, enrollment, payment, activation and Member ID issuance MUST function without Google. A Google profile, token, email match or successful Google authentication must never create, approve, activate or silently bind membership.

The application must support at least one non-Google governed Member Sign In method. Any login identity/credential must bind explicitly to a pre-existing authoritative participant/member record, be unique and auditable, and fail closed on ambiguity. Email similarity alone is not identity proof.

An Active Member who has not authenticated is treated as a Guest for application-access purposes. Guest access MUST NOT expose Member-only personal, economic, household, commitment, payment, fulfillment or workforce capabilities.

## Member-area admission
Member-area access requires active/grace membership rights, successful authentication through a supported sign-in method, an unambiguous binding to the correct participant, and successful server-side authorization. Sign-in MUST NOT manufacture participant records, membership rights, payment settlement, sponsorship entitlement or workforce authority.

## Membership standing
Ordinary lifecycle: `SELF_SERVICE_APPLICATION -> INACTIVE/INITIAL_FEE_DUE -> ANNUAL_SUBSCRIPTION_SETTLED -> ACTIVE -> GRACE (30 days) -> RESTRICTED/SUSPENDED -> restored or TERMINATED`.

Where governed manual review is required: `APPLICATION -> REVIEW_PENDING -> APPROVED -> INACTIVE/INITIAL_FEE_DUE`. Rejection must not leave usable membership or payable invoice artifacts.

Confirmed qualifying settlement restores standing; payment initiation alone does not. Bounded access for payment, records, support and remediation remains available during economic restriction.

## Employee-sponsored renewal and separation
While workforce standing remains ACTIVE, `EMPLOYEE_SPONSORED_MEMBERSHIP` automatically renews for each annual membership period without generating a member-paid subscription obligation. Workforce suspension, revocation or termination stops future sponsorship renewal but does not retroactively cancel the already-sponsored membership period. Membership remains independently governed through the end of that period unless a separate legitimate membership suspension/termination rule applies.

## Household beneficiaries
A Primary Member may nominate up to two individually identified beneficiaries. Beneficiaries do not independently pay the annual subscription, must satisfy applicable identity and age/service eligibility requirements, and may transact independently only within household/member constraints. Slots may not be sold, rented or commercially transferred. Replacement is subject to a versioned anti-abuse change limit under System Owner authority. Sponsor-standing economic restrictions propagate to beneficiary economic privileges while bounded records/support/remediation access remains available.

## Workforce separation and step-up
Membership and workforce standing are separate state machines. Operator access requires a dedicated Employee/Operator area and additional workforce authentication/step-up. Member authentication alone never grants Operator access.

Authorization follows `Identity -> Persona -> Domain -> Function -> Action/Task -> Constraints`. Default is DENY. System Owner appoints/revokes Admins; Admins grant/revoke bounded Operator permissions within delegated authority; Operators perform only explicitly authorized functions. An Admin cannot create, appoint or promote a System Owner.

## Required regression evidence
Implementation must prove self-service unauthenticated enrollment; employer persistence; AUTO and MANUAL review modes; no Google/OIDC dependency in enrollment or activation; payment-gated activation and immutable Member ID issuance; at least one non-Google Member Sign In method; optional Google binding; ambiguous binding denial; duplicate-person non-merging; 30-day grace; workforce separation; revocation; and direct server-side enforcement.

## Change control
Any change requires synchronized policy, server-side, client-side, state-model/migration where applicable, and regression-evidence updates. UI-only changes cannot alter authority.
