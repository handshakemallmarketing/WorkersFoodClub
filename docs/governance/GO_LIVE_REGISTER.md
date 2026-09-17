# GO_LIVE_REGISTER-v1

Status: LIVE TRACKING DOCUMENT — update in place as items are flipped or superseded
Last compiled: 2026-09-17, against `main` @ `52b909c4b58ac9346856298c089b014c8e96d80a`
Owner: Willie Adofo — Founder / Governance Authority (`participant:willie-adofo`)

## Purpose

This register enumerates every switch, credential, seed record, and safety boundary that
governs whether the Ghana Workers Food Club pilot behaves as a bounded rehearsal or as a
real production application. It exists so that "go live" is a checklist against durable
evidence, not a memory exercise. Nothing in this document authorizes anything by itself —
authorization records live in the other `docs/governance/*.json` files. This document only
tracks what those authorizations depend on, and what is still missing.

Update this file whenever an item's status changes. Do not delete history — mark an item
`DONE (date)` rather than removing the row, so the register stays an audit trail.

---

## 1. Master switches

| Switch | Where | Current state | What it gates |
|---|---|---|---|
| `PRODUCTION_APPLICATION_ACCESS_ENABLED` | Vercel project env (production) | Not confirmed set (governed activation not yet run against current `main`) | `lib/production-access-policy.js` — the single fail-closed gate in front of all production identity/member/operator routes. `false`/unset = every route returns 503. |
| Production application-access **activation workflow** | `.github/workflows/production-application-access-activation.yml`, triggered by pushing the exact commit message `AUTHORIZED: enable Production application access` to branch `sw1-production-application-access-activation-gate` | **Stale — see gotcha below** | The only sanctioned path to flip the switch above. Pinned to `ACTIVATION_SHA=de78497e00b58f5157d0622af54cf62f337c27b7`, which predates the sign-in modal, operator-tier, and employee-session work merged as PR #92/#93. **This pin must be updated to the current release candidate SHA (currently `52b909c4b58ac9346856298c089b014c8e96d80a`, or later) and the `docs/governance/PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json` authorization record re-issued for the new candidate SHA, before this workflow is fired.** Firing it unmodified would activate an outdated build. |
| `PAYSTACK_SECRET_KEY` live-mode gate | `api/paystack-rehearsal.js`, `packages/pilot-payments/src/paystack.ts` (`PaystackConfigurationGate.validate()`) | `sk_test_` only — live keys hard-rejected | Prevents any live Paystack charge. Requires **both** a `sk_live_` key **and** an explicit `liveEnabled: true` config flag to ever accept live mode. This is intentionally a separate, still-withheld authorization track — see §5. |
| Owner bootstrap | Not yet built (no script exists) | **Not started** | Zero real `application_authority_grant` rows of type Owner exist for any real person. Until a bootstrap process is written and run, nobody can hold `authority:owner`, and therefore nobody can grant Admin, and therefore no real Admin/Operator grants can be issued through the governed `packages/authority/src/hierarchy.ts` path. See §4. |

**Who pushes the activation trigger commit:** Willie Adofo personally, after his own testing. This
is explicitly not delegated to an AI agent in this engagement — see `docs/governance/PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json` for the authorization record format the trigger depends on.

---

## 2. Environment variables

Legend: **REQUIRED** = route/feature fails closed (503/deny) without it. **OPTIONAL** = feature degrades gracefully or isn't reachable in the current pilot. Status is what this session could verify from code, not from live Vercel/GitHub settings (I cannot read those).

| Variable | Required by | Purpose | Status |
|---|---|---|---|
| `DATABASE_URL` | all `/api/*` Neon-backed routes | Postgres connection string | Must be the real Neon production connection string, distinct from any preview/dev database. **Verify it is set on the Production environment specifically**, not just Preview. |
| `PRODUCTION_APPLICATION_ACCESS_ENABLED` | `lib/production-access-policy.js` | Master kill switch, §1 | Not confirmed set; see stale-activation-workflow gotcha above. |
| `OIDC_ISSUER` | `lib/production-oidc-auth.js` (`readProductionOidcConfig`) | Expected Google issuer (`https://accounts.google.com`) | **REQUIRED** — confirm set. |
| `OIDC_AUDIENCE` | same; also reused by `api/db-health.js` as the frontend's Google Sign-In Client ID | Expected JWT audience / OAuth client ID | **REQUIRED** — confirm set to the real production Google OAuth Client ID, not a dev/test client ID. |
| `OIDC_JWKS_URI` | same | Google's public JWKS endpoint for RS256 verification | **REQUIRED** — confirm set. |
| `OIDC_BROWSER_PROVIDER` | `api/db-health.js` | Must literally equal `'google'` for the frontend auth widget to render | **REQUIRED** — confirm set. |
| `EMPLOYEE_SESSION_SECRET` | `lib/application-principal-binding.js`, `api/employee-session.js`, `api/employee-session-lock.js` (new in PR #93) | HMAC signing secret for employee-session tokens | **New requirement, not yet provisioned anywhere.** Without it, every employee-session endpoint returns 503 `EMPLOYEE_SESSION_NOT_CONFIGURED`, which means no operator-scoped action can be authorized at all in production (the employee-session check is now unconditionally required in the operator branch of `resolveApplicationPrincipal()`). **Must be generated (long random value, e.g. `openssl rand -hex 32`) and set on the Production environment before any real operator/employee workflow can function.** |
| `PREVIEW_API_AUTH_SECRET` | `lib/preview-api-auth.js` | Signs preview-only bearer tokens | Should exist only in Preview/Development environments. Must **not** be set on Production (the code fails closed on `VERCEL_ENV` outside `preview`/`development`, but do not also provision the secret there — no reason to have it reachable). |
| `PAYSTACK_SECRET_KEY` | `api/paystack-rehearsal.js`, pilot-payments package | Paystack API key | Currently test-mode only by design; see §5 before ever changing this to a live key. |
| `PREVIEW_BASE_URL` / `PRODUCTION_BASE_URL` | test/rehearsal scripts, activation workflow | Target URLs for scripted checks | `PRODUCTION_BASE_URL` is hardcoded in the activation workflow as `https://workers-food-club-chi.vercel.app` — confirm this is still the canonical production alias before firing activation. |
| `VERCEL_ENV` | many fail-closed checks (`isPreviewLikeEnvironment()`, OIDC gate, etc.) | Vercel-injected; should not be manually set | Vercel sets this automatically per deployment target — no action needed, just don't override it in project settings. |
| `VERCEL_TOKEN`, `VERCEL_SCOPE`, `VERCEL_BRANCH_URL`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_URL`, `VERCEL_TRUSTED_OIDC_TOKEN` | Vercel platform / build-info probes | Vercel-managed | No action needed beyond what's below for GitHub Actions secrets. |
| `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `EXPECTED_COMMIT_SHA`, `RC` | CI/rehearsal scripts | CI-only | No production relevance. |

### GitHub Actions secrets required specifically by the activation workflow

These are **not** `process.env` vars read by application code — they're repo-level GitHub
Actions secrets consumed only by `.github/workflows/production-application-access-activation.yml`.
I cannot verify from this session whether they are currently set; check under repository
Settings → Secrets and variables → Actions.

| Secret | Purpose | Notes |
|---|---|---|
| `VERCEL_TOKEN` | Deploys the immutable candidate and flips the persistent env var | Must have deploy rights on the `food-club` Vercel scope/project (`prj_Y10EuTs8ttzcRg9LZl2BASSiOFUE`). |
| `RC3_PRODUCTION_MEMBER_TOKEN` | A real, live-lifetime Google ID token for a **specific, pre-agreed** member Google subject (`105166970902157294779`, hardcoded in the workflow) | Must be refreshed to have ≥900s remaining lifetime immediately before the activation run — it is re-minted by hand each time, it is not a long-lived secret. |
| `RC3_PRODUCTION_OPERATOR_TOKEN` | Same, for the pre-agreed operator Google subject (`100561209688774684064`) | Same freshness requirement. |

If either hardcoded subject ID (`EXPECTED_MEMBER_SUBJECT`/`EXPECTED_OPERATOR_SUBJECT`) no
longer corresponds to a real, intended test identity, the workflow file itself needs updating
before activation — it hard-fails closed on a subject mismatch by design.

---

## 3. Database migrations

All 15 migration files under `packages/durability/sql/` (`001_durable_command_execution.sql`
through `015_employee_authority_hierarchy.sql`, including the two `012_wave2_*` and one
`014_wave2_support_case.sql` siblings) have been exercised against **local test Postgres only**
in this engagement. **None of this has been confirmed applied to the real production Neon
database.** Before go-live:

- [ ] Apply all 15 migrations, in numeric/dependency order, to the production Neon database.
- [ ] Confirm `015_employee_authority_hierarchy.sql` specifically — it creates the `employee_session`
      table that `EMPLOYEE_SESSION_SECRET`-gated endpoints depend on. Without it, employee-session
      endpoints will fail with a SQL error, not a clean authorization error.
- [ ] Run `api/db-health.js` (or the `/api/build-info` probe path) against production after
      migrating, to confirm schema/runtime agreement before enabling application access.

---

## 4. Identity and authority seed data (Owner bootstrap)

Zero real people currently hold any `application_authority_grant` row in production. This is
expected — no bootstrap has been run — but it means production application access could be
enabled with **no one able to reach the Operator console**, because:

- `packages/authority/src/hierarchy.ts` requires an active Owner grant to exist before an Admin
  can ever be granted, and an active Owner or Admin before any ordinary operator grant can be
  issued.
- There is currently no live HTTP invite/grant/revoke API wired to that hierarchy module (it's
  pure logic only, exercised by unit tests and one manual Postgres integration script this
  session — not yet callable from production).

**Before go-live, in order:**
1. [ ] Decide and execute an Owner bootstrap process (a one-time, out-of-band script or manual
   SQL insert of the first `application_authority_grant` with `actions: ['authority:owner']`,
   bound to Willie Adofo's real Google identity via `application_identity_binding`). This does
   not yet exist as a reviewed script — it is the next major piece of unbuilt work, not a
   "flip on" item.
2. [ ] From that Owner identity, grant the intended Admin(s).
3. [ ] From an Admin, grant the intended Fulfillment/Finance operators — **and remember the
   `operator:release.manage` scope gotcha below.**

### Gotcha: `operator:release.manage` scope

`lib/operator-tiers.js`'s `isAdminOperator()` was changed (PR #92 hardening) to require the
explicit scope `operator:release.manage` rather than inferring Admin-ness from holding both
Fulfillment and Finance scopes. **Any real production grant intended to carry SuperUser/Admin
nav visibility must explicitly include `operator:release.manage` in its `actions` list.** A
grant that only unions Fulfillment + Finance scopes will show the Operator console but not the
SuperUser-level nav items.

---

## 5. Explicitly withheld — must stay OFF until separately authorized

These are standing safety boundaries reaffirmed multiple times across this engagement. None of
them are toggled by `PRODUCTION_APPLICATION_ACCESS_ENABLED`, and enabling production application
access must **not** be treated as implicitly authorizing any of these:

- **Live Paystack / live funds.** Requires a separate authorization record (following the
  `TRANSFER_POLICY_GOVERNANCE-v1.md` / `PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json`
  pattern), a real `sk_live_...` Paystack key, `liveEnabled: true` in the pilot-payments config,
  and live webhook configuration on the Paystack dashboard side (not yet built or verified).
- **CAGD deductions.** No live-mode path exists or is authorized.
- **Item-level credit expansion.** Not authorized beyond current pilot scope.
- **Production sandbox and consequential-mutation routes** (`/api/commit-sandbox`,
  `/api/pay-sandbox`, `/api/fulfillment-ready`, `/api/authorize-refund`, `/api/complete-refund`)
  must remain disabled in production even after application access is enabled — this is
  explicitly re-verified by the activation workflow's falsification step, which asserts all of
  these return 403 in production. If a future change to that workflow removes this check,
  treat it as a regression.

---

## 6. Explicitly deferred — not yet built, not "flip on" items

These were scoped during the "Improve the sign-in operations" work but deliberately deferred to
a later increment. They require new engineering, not a switch:

- Live HTTP invite / grant / revoke API wired to `packages/authority/src/hierarchy.ts` (currently
  pure logic, unreachable from any route).
- Admin "Employees" management screen (grant/revoke UI, audit-log view).
- System Owner bootstrap script and succession flow (see §4).
- Member/employee workspace frontend split (today the employee session mechanism exists
  server-side; the UI still uses a single modal without a distinct "enter employee workspace"
  step-up flow, lock/leave/sign-out-all controls, or default-lock-on-leave for shared devices).
- Audit-log read surface for grant/revoke history.
- Real invitation email delivery — **provider deliberately not yet chosen** (user explicitly
  deferred this decision: "Hold email for now, build the link-only flow first"). No
  `SENDGRID_*`/`RESEND_*`/`SMTP_*`-style env vars exist anywhere in the codebase yet. Do not
  provision an email provider without the user's explicit choice.

---

## 7. Suggested go-live order

1. Apply all migrations to production Neon (§3), confirm via `/api/build-info`.
2. Provision `EMPLOYEE_SESSION_SECRET` and confirm all OIDC-related env vars (§2) on Production.
3. Run Owner bootstrap (§4) — without this, enabling application access produces a working but
   operator-less production app.
4. Re-pin the activation workflow's `ACTIVATION_SHA` (and re-issue the
   `PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json` authorization record) to the actual release
   candidate commit — not the stale `de78497e...` value currently in the workflow file.
5. Refresh `RC3_PRODUCTION_MEMBER_TOKEN` / `RC3_PRODUCTION_OPERATOR_TOKEN` GitHub secrets with
   live-lifetime tokens for the pre-agreed test subjects.
6. Willie Adofo pushes the exact `AUTHORIZED: enable Production application access` commit to
   `sw1-production-application-access-activation-gate`.
7. Confirm the workflow's own falsification step passes (it self-verifies auth boundaries and
   rolls back automatically on failure).
8. Leave §5 (live funds, live Paystack, CAGD, credit expansion) untouched until each is
   separately, explicitly authorized with its own governance record.
