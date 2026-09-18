# GO_LIVE_REGISTER-v1

Status: LIVE TRACKING DOCUMENT — update in place as items are flipped or superseded
Last compiled: 2026-09-17, against `main` @ `52b909c4b58ac9346856298c089b014c8e96d80a`
Updated: 2026-09-18, against `main` @ `f02caaa0d33e893e8cc3a72b6348eee971aaa4dc`
Owner: Willie Adofo — Founder / Governance Authority (`participant:willie-adofo`)

See also `docs/business-logic-v2/master-journey-truth-matrix.yaml` (added in PR #94), which is
now the canonical per-journey (UC-01–UC-30) evidence tracker. This document stays focused on
infrastructure/environment "flip on" items; the journey matrix is the source of truth for
feature-completeness claims. Both should stay reconciled — do not let either silently drift.

## Update log

- **2026-09-18** — Verified against `main` @ `f02caaa0...`. PR #94 added the journey truth
  matrix and confirmed, from real repository state (not from an external report), the same
  P0 findings independently noted below: the stale activation-workflow SHA pin (§1) and a
  genuine constitutional-ratification gap, added as a new item below. PR #95 closed one item
  from the deferred list (§6) by routing `api/fulfillment-ready.js` and
  `api/accept-fulfillment.js` through `requireApplicationAuth` instead of the legacy
  preview-only auth path — removed from §6, folded into the unified-auth baseline. Added new
  falsification test coverage (`tests/node/sw1-rc3-governed-principal-binding.test.mjs`)
  proving a revoked, expired, not-yet-valid, or target-prefix-scoped
  `application_authority_grant` row cannot satisfy general operator authority — this was
  true of the shipped code already; the gap was that no test proved it.
- **2026-09-18 (later same day)** — P0-DB-ISOLATION confirmed by the human owner directly
  comparing the Vercel dashboard's Production/Preview `DATABASE_URL` values and the Neon
  console's branch list: they resolve to the same branch. Recorded in
  `docs/business-logic-v2/decision-register.jsonl` (`BLV2-DEC-008`) and in the journey truth
  matrix. Added §7 with a proposed non-destructive remediation (new Neon branch for Preview
  only); not yet executed — this session has no Vercel/Neon write access.

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
| Constitutional (C0–C10) ratification | `constitution/baseline.json` | **`PROPOSED_FOR_RATIFICATION`, unchanged since the file's original commit (`a27132a`, "SW0-02: bootstrap constitutional kernel")** | `docs/agents/README.md` and `docs/agents/work-orders/A9-governance-wave1.md` both describe "Ratified C0-C10" as the superior authority governing all agent work, but the canonical record has never actually been marked ratified, and no substantive C0–C10 corpus text exists anywhere on `main` — only the corpus *index* (`["C0","C1",...,"C10","CB-00"]`) in `baseline.json`. **This is a genuine open governance question, not a clerical bug — I have not changed this file.** Either (a) the constitution was ratified out-of-band and the record needs updating to reflect that, with evidence of who ratified it and when, following the same pattern as `docs/governance/TRANSFER_POLICY_GOVERNANCE-v1.md`; or (b) it was never actually ratified and the agent-facing docs asserting "ratified" are themselves wrong and need correcting. **Willie Adofo needs to say which.** Do not silently flip this to `RATIFIED` on anyone's behalf, including an AI agent's. |
| Preview/Production Neon database isolation | Vercel/Neon project configuration (not visible from this codebase) | **CONFIRMED P0 — Production and Preview share the same Neon branch** (confirmed 2026-09-18 by direct human check of the Vercel dashboard and Neon console) | Every route reads a single `process.env.DATABASE_URL` (confirmed by direct code search across all of `api/*.js`); there is no code-level distinction between Preview and Production connection strings. With both environments pointed at the same Neon branch, any Preview/sandbox request — including anything the automated Preview rehearsal suites write — lands in the same physical database as real Production data. **See §7 for the proposed non-destructive remediation.** |

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

**CONFIRMED 2026-09-18, via direct Neon inspection (not inference):** migrations 001-011 are
applied to the real production Neon branch (`br-winter-poetry-ae8qho57`, project `wispy-dawn-96331519`,
org "Ghana Food Group"). **Migrations 012-015 were never applied** — `employee_session`,
`member_application`, `beneficiary_invitation`, `membership_invoice(_settlement)`,
`member_product_request_survey`, `support_case(_transition)`, and
`membership_shopping_credit_entry/lot` did not exist. Recorded as `BLV2-DEC-009`.

Practical effect: `resolveApplicationPrincipal()`'s employee-session query hits a
relation-does-not-exist error, which its try/catch turns into `503
APPLICATION_BINDING_LOOKUP_FAILED` — so this fails closed (no security hole) but every
operator-scoped action is simply non-functional. UC-01/02/03/04/11/14/28 have no backing
tables at all in production, independent of `PRODUCTION_APPLICATION_ACCESS_ENABLED`.

**Remediation status:**
- [x] Forked a `preview` Neon branch (`br-purple-grass-aej54d2x`) from `production` and applied
      all 6 outstanding migration files to it, statement by statement, including the
      `014_wave2_support_case.sql` column-rename upgrade path. Verified the resulting schema
      (27 tables/views, including all previously-missing ones) and confirmed the renamed
      `support_case`/`support_case_transition` columns landed correctly
      (`created_by_authn_subject_ref`, `updated_by_authn_subject_ref`, `authn_subject_ref`).
- [ ] **Not yet applied to the actual `production` branch.** The same statements are now proven
      clean on an exact fork of production, but writing DDL to the live production database is
      being held for explicit authorization rather than done automatically just because a
      dry-run succeeded. Say the word and this gets applied the same way, verified the same way.
- [ ] After applying to production, re-run `/api/build-info` / `/api/db-health` against the
      Production Vercel deployment to confirm the app sees the new tables.
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

## 7. Neon branch separation — proposed remediation for the confirmed P0

**Confirmed 2026-09-18:** Production and Preview both resolve `DATABASE_URL` to the same Neon
branch. This plan separates them without touching existing data or requiring any Production
downtime. It is a proposal, not yet executed — nothing below has been done.

1. **Create a new Neon branch from the current (shared) branch.** Neon branch creation is a
   copy-on-write snapshot — it does not modify or lock the source branch. Name it something
   explicit, e.g. `preview` (leave the existing branch as the Production branch of record; do
   not rename or recreate the branch Production currently uses).
2. **Get that new branch's connection string** from the Neon console (Branches → the new branch
   → Connection Details).
3. **Update only the Preview environment's `DATABASE_URL`** in Vercel (Project Settings →
   Environment Variables → `DATABASE_URL` → edit the **Preview** scope only, leave **Production**
   untouched) to point at the new branch's connection string.
4. **Redeploy a Preview deployment** (push any branch, or redeploy an existing Preview
   deployment) and confirm via `/api/db-health` / `/api/build-info` on that Preview URL that it
   is reachable and schema-healthy on the new branch.
5. **Apply all 15 migrations** (§3) to the new Preview branch — it was forked from Production's
   schema at creation time, but confirm it matches exactly and re-run migrations if the fork
   predates the latest migration.
6. **Run the existing Preview/rehearsal test suites** against the redeployed Preview URL to
   confirm nothing broke.
7. **Do not delete or reset the old shared branch** as part of this change — Production keeps
   using it unmodified throughout. The only change Production sees is that Preview traffic stops
   arriving.
8. Once confirmed working, update this register's status for this item to `DONE (date)` and
   update `docs/business-logic-v2/master-journey-truth-matrix.yaml`'s `P0-DB-ISOLATION` entry to
   `status: RESOLVED` with the evidence (new branch id, redeploy confirmation).

This requires Vercel + Neon write access (creating a branch, editing an env var) that this
session does not currently have. Either grant scoped, revocable credentials (see the prior
turn's Option A) so I can execute and verify steps 1-6 directly, or run them yourself from the
dashboards and tell me when done so I can update the evidence trail.

---

## 8. Suggested go-live order

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
9. Separate the Neon branches (§7) before or alongside the above — it's independent of
   Production-access activation but should not wait indefinitely, since every day Preview and
   Production share a branch is a day Preview traffic can touch real data.
