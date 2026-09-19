# AUTH-MEMBERSHIP-001 — Member Admission Policy

**Status:** RATIFIED  
**Effective date:** 2026-09-19  
**Owner decision:** A person cannot log in to the WorkersFoodClub Member application unless previously registered as a member.

## Governing invariant

Authentication proves identity only. It does not create, imply, approve, activate, or confer membership.

`Authenticated ≠ Registered ≠ Approved ≠ Active Member ≠ Employee ≠ Operator ≠ Admin ≠ System Owner`

## Member admission rule

A production identity may enter the Member application only when all of the following are true:

1. The external identity has been successfully verified.
2. Exactly one pre-existing ACTIVE `application_identity_binding` binds that issuer/subject to a WorkersFoodClub participant.
3. That participant has the membership state/standing required by the requested member capability.
4. Normal server-side scope and membership authorization succeeds.

Sign-in MUST NOT create an identity binding, participant, membership, membership application, or authority grant.

## Non-member behavior

A successfully authenticated identity without the required pre-existing member binding is denied Member application admission with `MEMBERSHIP_REQUIRED`.

The person may be routed only to the appropriate bounded public/pre-member journey:
- no registration/application: `NON_MEMBER` → Register / Apply to Join;
- submitted application: `APPLICATION_STATUS`;
- approved but activation/fee incomplete: bounded activation/subscription journey;
- suspended/past-due member: bounded remediation journey.

These states MUST NOT mount the ordinary active-member shell or grant member economic capabilities.

## Workforce separation

Employee/operator/admin/system-owner authority is independently governed. No workforce authority is inferred from Google authentication or membership, and member admission is not a substitute for employee step-up.

## Required regression evidence

- **J2-NONMEMBER-LOGIN:** new verified external identity + no pre-existing membership binding → HTTP 403 `MEMBERSHIP_REQUIRED`, Member shell denied, member APIs denied, registration/application offered, and no membership/binding is auto-created.
- **J3-APPLICANT-LOGIN:** submitted applicant → HTTP 403 `MEMBERSHIP_REQUIRED`, bounded application-status route only.
- **J5-REGISTERED-MEMBER-LOGIN:** pre-existing ACTIVE binding + ACTIVE/CURRENT membership → Member admission succeeds.
- Direct member API calls remain independently fail-closed through application principal binding.

## Change-control rule

Any future relaxation of this policy requires an explicit owner-ratified policy change and corresponding server-side, client-side, and regression-test updates. UI-only changes cannot alter member admission authority.
