# AUTH-MEMBERSHIP-001 — Membership, Guest and Workforce Admission Policy

**Status:** RATIFIED — REVISED  
**Effective date:** 2026-09-21  
**Authority:** WorkersFoodClub Policy Ratification Register v1.1 (PR-01 through PR-14, PR-31 through PR-34)

## Governing invariants
Ordinary membership enrollment is self-service. Administrative approval is optional, not a universal prerequisite. Active membership rights require confirmed annual subscription settlement or a valid `EMPLOYEE_SPONSORED_MEMBERSHIP` entitlement. Authentication is required to exercise Member-area capabilities but never creates membership or rights.

`Guest ≠ Applicant ≠ Numbered Member ≠ Active Member ≠ Employee ≠ Operator ≠ Admin ≠ System Owner`

`Enrollment ≠ Membership Identity ≠ Annual Invoice ≠ Settlement/Activation ≠ Authentication ≠ Workforce Authority`

## Guest/non-member access and self-service enrollment
An unauthenticated Guest may submit a membership application directly. Enrollment MUST NOT require Google, OIDC, or another identity provider. The application collects authoritative enrollment/contact information, including government ministry, department, agency or employer. Application submission itself creates no Member-area authority.

The default `AUTO` journey is ordered: validate prospective-member information; create and persist the membership identity; issue the immutable server-generated Member Number; link the application to that membership; then invoke annual subscription billing. Membership identity creation MUST NOT depend on annual fee configuration. A billing/configuration failure after membership creation MUST preserve the numbered membership and expose billing as pending/error for retry; it must not manufacture a second member on retry.

A governed `MANUAL` review mode may be used where required. Approval follows the same identity-before-billing rule.

## Annual subscription billing and renewal
The same authoritative annual-invoice service governs first-year and renewal billing. A successful new-member application triggers the first annual invoice only after the numbered membership exists. When an ordinary paid membership reaches its governed renewal-due/expiry condition, the service creates the next annual invoice against the existing membership and existing Member Number.

Annual invoice creation is idempotent by `(membership_id, subscription_year)`. At most one authoritative invoice may exist for that pair. Retry, replay and concurrent generation MUST converge on that invoice. Billing must never mint, replace or mutate a Member Number.

Employee-sponsored memberships remain governed by the separate zero-fee sponsorship entitlement and do not generate a member-paid annual obligation while sponsorship is valid.

Confirmed annual subscription settlement is the ordinary activation/restoration boundary. Payment initiation alone does not activate or restore membership. Settlement preserves the Member Number.

## Authentication provider independence
Google authentication is completely optional. Google/OIDC may be offered as one Member Sign In method, but membership, enrollment, billing, settlement, activation and Member Number issuance MUST function without Google. A Google profile, token, email match or successful Google authentication must never create, approve, activate or silently bind membership.

The application must support at least one non-Google governed Member Sign In method. Any login credential must bind explicitly to a pre-existing authoritative member record, be unique and auditable, and fail closed on ambiguity. Email similarity alone is not identity proof.

## Member-area admission and standing
Member-area access requires active/grace membership rights, successful authentication, unambiguous participant binding and server-side authorization. Sign-in MUST NOT manufacture membership or payment authority.

Ordinary lifecycle: `SELF_SERVICE_APPLICATION -> NUMBERED INACTIVE/INITIAL_FEE_DUE -> ANNUAL_INVOICE -> SETTLED/ACTIVE -> RENEWAL_DUE/GRACE -> RESTRICTED/SUSPENDED -> RENEWAL_INVOICE -> SETTLED/RESTORED`, subject to the ratified 30-day grace policy. Suspension/expiry does not destroy membership identity or history.

Where governed manual review is required: `APPLICATION -> REVIEW_PENDING -> APPROVED -> NUMBERED INACTIVE/INITIAL_FEE_DUE -> ANNUAL_INVOICE`. Rejection must not leave usable membership or payable invoice artifacts.

## Employee-sponsored renewal and separation
While workforce standing remains ACTIVE, `EMPLOYEE_SPONSORED_MEMBERSHIP` renews for each annual membership period without generating a member-paid subscription obligation. Workforce suspension, revocation or termination stops future sponsorship renewal but does not retroactively cancel an already-sponsored period.

## Household beneficiaries
A Primary Member may nominate up to two individually identified beneficiaries. Beneficiaries do not independently pay the annual subscription and remain subject to sponsor-standing constraints and the ratified beneficiary rules.

## Workforce separation and step-up
Membership and workforce standing are separate state machines. Operator access requires a dedicated Employee/Operator area and additional workforce authentication/step-up. Member authentication alone never grants Operator access. System Owner appoints/revokes Admins; Admins grant/revoke bounded Operator permissions; an Admin cannot create a System Owner.

## Required regression evidence
Implementation must prove self-service unauthenticated enrollment; employer persistence; Member Number issuance before billing; membership survival when billing configuration fails; first-year invoice generation; one invoice per membership/year under replay and race; renewal invoice generation against the unchanged Member Number; payment-gated activation/restoration; no Google/OIDC dependency; 30-day grace; workforce separation; and direct server-side enforcement.

## Change control
Any change requires synchronized policy, server-side, client-side, state-model/migration where applicable, Truth Matrix, and regression-evidence updates. UI-only changes cannot alter authority.
