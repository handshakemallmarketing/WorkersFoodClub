# AUTH-MEMBERSHIP-001 — Membership, Guest and Workforce Admission Policy

**Status:** RATIFIED — REVISED (verify-before-provision amendment)  
**Effective date:** 2026-09-21 (verify-before-provision amendment ratified 2026-09-22)  
**Authority:** WorkersFoodClub Policy Ratification Register v1.1 (PR-01 through PR-14, PR-31 through PR-34); verify-before-provision amendment ratified by System Owner 2026-09-22 (BLV2-DEC-031), following external self-service enrollment review

## Governing invariants
Ordinary membership enrollment is self-service. Administrative approval is optional, not a universal prerequisite. Active membership rights require confirmed annual subscription settlement or a valid `EMPLOYEE_SPONSORED_MEMBERSHIP` entitlement. **Contact verification is the gateway to membership provisioning**: a prospective member's chosen primary contact channel (email or phone) MUST be proven via a one-time verification code before any permanent Member Number, membership record, or annual invoice is created. Verification never creates membership rights by itself; it only unlocks identity provisioning. Confirmed subscription settlement remains the sole activation boundary. Neither verification nor authentication ever settles an invoice or by itself grants Member-area rights.

An already-numbered member returning on a new device/session re-authenticates using the same Member Number plus a fresh verification code against their registered channel; this is a distinct, later event from the one-time enrollment-gating verification and does not re-provision anything.

`Guest ≠ Applicant ≠ Numbered Member ≠ Authenticated Numbered Member ≠ Active Member ≠ Employee ≠ Operator ≠ Admin ≠ System Owner`

`Enrollment ≠ Membership Identity ≠ Annual Invoice ≠ Authentication ≠ Settlement/Activation ≠ Workforce Authority`

## Member Number identity and machine-readable credential
The Member Number is an immutable, server-issued public membership identifier. For all newly issued memberships it MUST consist of exactly 12 ASCII decimal digits (`0-9`) with no alphabetic prefix, membership-type prefix, hyphen, space or other separator. Member type remains authoritative database/domain state and MUST NOT be encoded into the Member Number.

The raw Member Number is the canonical payload for a scannable Code 128 barcode and QR code. Neither representation may embed name, email, phone, employer, standing, payment state, authority, or other sensitive/domain data. A scan supplies only the Member Number; the server resolves the membership and current authorization state. A barcode or QR code is therefore an identifier, not proof of authentication or membership rights.

Already-issued legacy Member Numbers are immutable and MUST NOT be rewritten merely to adopt the new format. New issuance follows the numeric format. Collision handling remains fail closed through authoritative uniqueness constraints; a collision must never overwrite or alias another membership.

## Guest/non-member access and self-service enrollment
An unauthenticated Guest may submit a membership application directly. Enrollment MUST NOT require Google, OIDC, or another identity provider. The application collects authoritative enrollment/contact information, including work/institutional affiliation. Application submission itself creates no Member-area authority and no permanent identity.

The default `AUTO` journey is ordered: validate prospective-member information; **verify the applicant's selected primary contact channel (email or phone) via a one-time code before any durable membership artifact exists**; upon successful verification, atomically create and persist the membership identity, issue the immutable server-generated Member Number, link the application to that membership, and create the annual subscription invoice; establish an authenticated member session directly from that same verification (a returning member on a later visit re-authenticates separately against the now-registered channel); then permit settlement of that invoice. Confirmed settlement activates membership rights. Membership identity creation MUST NOT depend on annual fee configuration. A billing/configuration failure after membership creation MUST preserve the numbered membership and expose billing as pending/error for retry; it must not manufacture a second member on retry.

Unverified applications are transient: a verification-pending application MUST NOT create a participant, membership row, Member Number, or invoice, and MUST expire and become eligible for cleanup if never verified. An application resolves to at most one Member Number; identity provisioning happens exactly once per verified contact, not once per submission (see Duplicate and resume matching below).

A governed `MANUAL` review mode may be used where required. Approval follows the same verify-before-provision and settlement-after-verification rules; manual reviewers approve an already-verified applicant into eligibility, they do not substitute for contact verification.

### Duplicate and resume matching
Before a new verification challenge is issued, the server MUST resolve the normalized contact channel (canonical phone format; lowercased, trimmed email) against existing memberships and pending verifications:
- An exact match against a channel already bound to an active or pending numbered membership MUST resume that existing record (reissue a verification challenge or, if already verified and unpaid, return to payment) rather than create a second membership.
- The system MUST NOT disclose to an unauthenticated requester whether a given contact channel already belongs to a member; the response to a verification request is uniform regardless of match outcome (see Anti-enumeration below).
- Name-similarity alone MUST NOT be used to deny or merge an enrollment; it may only raise a low-priority review signal.

### Anti-enumeration
Unauthenticated enrollment and verification endpoints MUST return a uniform response shape and message regardless of whether the submitted contact channel matches an existing member, a pending application, or nothing at all (e.g. "if this contact is eligible, a verification code has been sent"). The specific reason MUST still be recorded server-side for support and fraud review, but MUST NOT be disclosed in the unauthenticated response.

### Campaign-scoped enrollment
Enrollment MAY be scoped to a server-resolved campaign/institution context carried by an opaque campaign token in the enrollment link (e.g. `/join?campaign=<token>`). Where a campaign token is present and valid, the server resolves institutional affiliation and any campaign-specific eligibility policy from that token; a client-supplied free-text employer/institution label is never authoritative on its own. Enrollment without a campaign token remains valid and falls back to the general applicant-supplied affiliation path. A campaign record governs its own opening/closing window, volume ceiling, and rate-limit thresholds; exceeding a campaign's governed volume ceiling or operating outside its window MUST fail closed for new enrollments under that campaign without affecting already-provisioned members.

## Annual subscription billing and renewal
The same authoritative annual-invoice service governs first-year and renewal billing. A successful new-member application triggers the first annual invoice only after the numbered membership exists. When an ordinary paid membership reaches its governed renewal-due/expiry condition, the service creates the next annual invoice against the existing membership and existing Member Number.

Annual invoice creation is idempotent by `(membership_id, subscription_year)`. At most one authoritative invoice may exist for that pair. Retry, replay and concurrent generation MUST converge on that invoice. Billing must never mint, replace or mutate a Member Number.

Employee-sponsored memberships remain governed by the separate zero-fee sponsorship entitlement and do not generate a member-paid annual obligation while sponsorship is valid.

For an ordinary member-paid obligation, the numbered member MUST authenticate before settlement is accepted through the member journey. Authentication establishes who is acting on the invoice; it does not mark the invoice paid and does not activate membership. Confirmed annual subscription settlement is the ordinary activation/restoration boundary. Payment initiation alone does not activate or restore membership. Settlement preserves the Member Number.

## Authentication provider independence
Google authentication is completely optional. Google/OIDC may be offered as one Member Sign In method, but membership, enrollment, billing, authentication, settlement, activation and Member Number issuance MUST function without Google. A Google profile, token, email match or successful Google authentication must never create, approve, activate or silently bind membership.

The application must support at least one non-Google governed Member Sign In method. The canonical first-party method is Member Number plus a challenge delivered to a registered contact channel. Any login credential must bind explicitly to a pre-existing authoritative member record, be unique and auditable, and fail closed on ambiguity. Email similarity alone is not identity proof.

A numbered membership in `INACTIVE/INITIAL_FEE_DUE` standing is authentication-eligible: its identity was already established by enrollment-time verification, and a returning member re-authenticates on a later visit/device the same way. Successful authentication in this state resolves authorization to `MEMBERSHIP_PAYMENT_REQUIRED`, with Member-area access denied. `ACTIVE` or `GRACE` standing plus successful authentication may authorize Member-area access subject to all other server-side checks.

## Member-area admission and standing
Member-area access requires active/grace membership rights, successful authentication, unambiguous participant binding and server-side authorization. Sign-in MUST NOT manufacture membership or payment authority. An authenticated unpaid member is not a Guest, but is also not an Active Member and receives no Member-area rights until settlement activates the membership.

Ordinary initial lifecycle: `SELF_SERVICE_APPLICATION -> CONTACT_VERIFICATION_PENDING -> VERIFIED/NUMBERED INACTIVE/INITIAL_FEE_DUE -> ANNUAL_INVOICE_OPEN -> PAYMENT_REQUIRED -> SETTLED/ACTIVE -> MEMBER_AREA_ELIGIBLE`. A `SELF_SERVICE_APPLICATION` that never reaches `CONTACT_VERIFICATION_PENDING` completion is transient and MUST NOT be numbered.

Ordinary renewal lifecycle: `ACTIVE -> RENEWAL_DUE/GRACE -> RENEWAL_INVOICE -> AUTHENTICATED/PAYMENT_REQUIRED_AS_APPLICABLE -> SETTLED/RESTORED`, subject to the ratified 30-day grace policy. Suspension/expiry does not destroy membership identity, authentication lineage, invoice history or Member Number.

Where governed manual review is required: `APPLICATION -> CONTACT_VERIFICATION_PENDING -> VERIFIED -> REVIEW_PENDING -> APPROVED -> NUMBERED INACTIVE/INITIAL_FEE_DUE -> ANNUAL_INVOICE_OPEN -> SETTLEMENT/ACTIVATION`. Rejection must not leave usable membership or payable invoice artifacts.

## Employee-sponsored renewal and separation
While workforce standing remains ACTIVE, `EMPLOYEE_SPONSORED_MEMBERSHIP` renews for each annual membership period without generating a member-paid subscription obligation. Workforce suspension, revocation or termination stops future sponsorship renewal but does not retroactively cancel an already-sponsored period.

## Household beneficiaries
A Primary Member may nominate up to two individually identified beneficiaries. Beneficiaries do not independently pay the annual subscription and remain subject to sponsor-standing constraints and the ratified beneficiary rules.

## Workforce separation and step-up
Membership and workforce standing are separate state machines. Operator access requires a dedicated Employee/Operator area and additional workforce authentication/step-up. Member authentication alone never grants Operator access. System Owner appoints/revokes Admins; Admins grant/revoke bounded Operator permissions; an Admin cannot create a System Owner.

## Required regression evidence
Implementation must prove self-service unauthenticated enrollment; contact verification precedes and gates participant/membership/Member Number/invoice creation (no durable artifact exists for an unverified application); a never-verified application expires without leaving a numbered membership; duplicate/resume matching resumes an existing pending or numbered record on an exact normalized-contact match rather than creating a second membership; anti-enumeration uniform responses across match/no-match outcomes; employer/institutional affiliation persistence, including campaign-token-resolved affiliation overriding a client-supplied label; exactly-12-digit new Member Number issuance; absence of prefixes/separators in new Member Numbers; machine-readable payload equivalence; membership survival when billing configuration fails; first-year invoice generation; one invoice per membership/year under replay and race; concurrency-safe idempotency under simultaneous enrollment submissions for the same contact; multi-level rate limiting (enrollment attempts, verification sends, verification attempts, campaign volume) fails closed without blocking distinct legitimate applicants; authentication of `INACTIVE/INITIAL_FEE_DUE` numbered members before settlement; authenticated-unpaid resolution to `MEMBERSHIP_PAYMENT_REQUIRED` with Member-area denial; settlement only after the governed authentication boundary in the member journey; settlement-gated activation/restoration; renewal invoice generation against the unchanged Member Number; no Google/OIDC dependency; 30-day grace; workforce separation; and direct server-side enforcement.

## Change control
Any change requires synchronized policy, server-side, client-side, state-model/migration where applicable, Truth Matrix, and regression-evidence updates. UI-only changes cannot alter authority.
