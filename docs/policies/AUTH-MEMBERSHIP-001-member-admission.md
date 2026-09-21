# AUTH-MEMBERSHIP-001 — Membership, Guest and Workforce Admission Policy

**Status:** RATIFIED — REVISED  
**Effective date:** 2026-09-21  
**Authority:** WorkersFoodClub Policy Ratification Register v1.1 (PR-01 through PR-14, PR-31 through PR-34)

## Governing invariants
Ordinary membership enrollment is self-service. Administrative approval is optional, not a universal prerequisite. Active membership rights require confirmed annual subscription settlement or a valid `EMPLOYEE_SPONSORED_MEMBERSHIP` entitlement. Authentication is an identity-verification boundary: it is required after Member Number and annual-invoice issuance and before ordinary subscription settlement. Authentication never creates membership, never settles an invoice, and never by itself grants Member-area rights.

`Guest ≠ Applicant ≠ Numbered Member ≠ Authenticated Numbered Member ≠ Active Member ≠ Employee ≠ Operator ≠ Admin ≠ System Owner`

`Enrollment ≠ Membership Identity ≠ Annual Invoice ≠ Authentication ≠ Settlement/Activation ≠ Workforce Authority`

## Member Number identity and machine-readable credential
The Member Number is an immutable, server-issued public membership identifier. For all newly issued memberships it MUST consist of exactly 12 ASCII decimal digits (`0-9`) with no alphabetic prefix, membership-type prefix, hyphen, space or other separator. Member type remains authoritative database/domain state and MUST NOT be encoded into the Member Number.

The raw Member Number is the canonical payload for a scannable Code 128 barcode and QR code. Neither representation may embed name, email, phone, employer, standing, payment state, authority, or other sensitive/domain data. A scan supplies only the Member Number; the server resolves the membership and current authorization state. A barcode or QR code is therefore an identifier, not proof of authentication or membership rights.

Already-issued legacy Member Numbers are immutable and MUST NOT be rewritten merely to adopt the new format. New issuance follows the numeric format. Collision handling remains fail closed through authoritative uniqueness constraints; a collision must never overwrite or alias another membership.

## Guest/non-member access and self-service enrollment
An unauthenticated Guest may submit a membership application directly. Enrollment MUST NOT require Google, OIDC, or another identity provider. The application collects authoritative enrollment/contact information, including government ministry, department, agency or employer. Application submission itself creates no Member-area authority.

The default `AUTO` journey is ordered: validate prospective-member information; create and persist the membership identity; issue the immutable server-generated Member Number; link the application to that membership; create the annual subscription invoice; authenticate the numbered member using a governed verification method; then permit settlement of that invoice. Confirmed settlement activates membership rights. Membership identity creation MUST NOT depend on annual fee configuration. A billing/configuration failure after membership creation MUST preserve the numbered membership and expose billing as pending/error for retry; it must not manufacture a second member on retry.

A governed `MANUAL` review mode may be used where required. Approval follows the same identity-before-billing and authentication-before-settlement rules.

## Annual subscription billing and renewal
The same authoritative annual-invoice service governs first-year and renewal billing. A successful new-member application triggers the first annual invoice only after the numbered membership exists. When an ordinary paid membership reaches its governed renewal-due/expiry condition, the service creates the next annual invoice against the existing membership and existing Member Number.

Annual invoice creation is idempotent by `(membership_id, subscription_year)`. At most one authoritative invoice may exist for that pair. Retry, replay and concurrent generation MUST converge on that invoice. Billing must never mint, replace or mutate a Member Number.

Employee-sponsored memberships remain governed by the separate zero-fee sponsorship entitlement and do not generate a member-paid annual obligation while sponsorship is valid.

For an ordinary member-paid obligation, the numbered member MUST authenticate before settlement is accepted through the member journey. Authentication establishes who is acting on the invoice; it does not mark the invoice paid and does not activate membership. Confirmed annual subscription settlement is the ordinary activation/restoration boundary. Payment initiation alone does not activate or restore membership. Settlement preserves the Member Number.

## Authentication provider independence
Google authentication is completely optional. Google/OIDC may be offered as one Member Sign In method, but membership, enrollment, billing, authentication, settlement, activation and Member Number issuance MUST function without Google. A Google profile, token, email match or successful Google authentication must never create, approve, activate or silently bind membership.

The application must support at least one non-Google governed Member Sign In method. The canonical first-party method is Member Number plus a challenge delivered to a registered contact channel. Any login credential must bind explicitly to a pre-existing authoritative member record, be unique and auditable, and fail closed on ambiguity. Email similarity alone is not identity proof.

A numbered membership in `INACTIVE/INITIAL_FEE_DUE` standing is authentication-eligible specifically so the member can establish identity before settling the first annual invoice. Successful authentication in this state creates an authenticated server-backed session but MUST resolve authorization to `MEMBERSHIP_PAYMENT_REQUIRED`, with Member-area access denied. `ACTIVE` or `GRACE` standing plus successful authentication may authorize Member-area access subject to all other server-side checks.

## Member-area admission and standing
Member-area access requires active/grace membership rights, successful authentication, unambiguous participant binding and server-side authorization. Sign-in MUST NOT manufacture membership or payment authority. An authenticated unpaid member is not a Guest, but is also not an Active Member and receives no Member-area rights until settlement activates the membership.

Ordinary initial lifecycle: `SELF_SERVICE_APPLICATION -> NUMBERED INACTIVE/INITIAL_FEE_DUE -> ANNUAL_INVOICE_OPEN -> AUTHENTICATED/PAYMENT_REQUIRED -> SETTLED/ACTIVE -> MEMBER_AREA_ELIGIBLE`.

Ordinary renewal lifecycle: `ACTIVE -> RENEWAL_DUE/GRACE -> RENEWAL_INVOICE -> AUTHENTICATED/PAYMENT_REQUIRED_AS_APPLICABLE -> SETTLED/RESTORED`, subject to the ratified 30-day grace policy. Suspension/expiry does not destroy membership identity, authentication lineage, invoice history or Member Number.

Where governed manual review is required: `APPLICATION -> REVIEW_PENDING -> APPROVED -> NUMBERED INACTIVE/INITIAL_FEE_DUE -> ANNUAL_INVOICE_OPEN -> AUTHENTICATION -> SETTLEMENT/ACTIVATION`. Rejection must not leave usable membership or payable invoice artifacts.

## Employee-sponsored renewal and separation
While workforce standing remains ACTIVE, `EMPLOYEE_SPONSORED_MEMBERSHIP` renews for each annual membership period without generating a member-paid subscription obligation. Workforce suspension, revocation or termination stops future sponsorship renewal but does not retroactively cancel an already-sponsored period.

## Household beneficiaries
A Primary Member may nominate up to two individually identified beneficiaries. Beneficiaries do not independently pay the annual subscription and remain subject to sponsor-standing constraints and the ratified beneficiary rules.

## Workforce separation and step-up
Membership and workforce standing are separate state machines. Operator access requires a dedicated Employee/Operator area and additional workforce authentication/step-up. Member authentication alone never grants Operator access. System Owner appoints/revokes Admins; Admins grant/revoke bounded Operator permissions; an Admin cannot create a System Owner.

## Required regression evidence
Implementation must prove self-service unauthenticated enrollment; employer persistence; exactly-12-digit new Member Number issuance before billing; absence of prefixes/separators in new Member Numbers; machine-readable payload equivalence; membership survival when billing configuration fails; first-year invoice generation; one invoice per membership/year under replay and race; authentication of `INACTIVE/INITIAL_FEE_DUE` numbered members before settlement; authenticated-unpaid resolution to `MEMBERSHIP_PAYMENT_REQUIRED` with Member-area denial; settlement only after the governed authentication boundary in the member journey; settlement-gated activation/restoration; renewal invoice generation against the unchanged Member Number; no Google/OIDC dependency; 30-day grace; workforce separation; and direct server-side enforcement.

## Change control
Any change requires synchronized policy, server-side, client-side, state-model/migration where applicable, Truth Matrix, and regression-evidence updates. UI-only changes cannot alter authority.
