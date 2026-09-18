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
| `PRODUCTION_APPLICATION_ACCESS_ENABLED` | Vercel project env (production), project `workers-food-club` / team OriginOS (`prj_Ti1NOQryzFeImhMSwncMXNxs01I8`) | **CONFIRMED `true`, live on current `main` HEAD.** Willie Adofo confirmed 2026-09-18 he personally requested this be enabled for real-world testing. Verified independently: `GET /api/member-orders` on `https://workers-food-club.vercel.app` returns `401 AUTHENTICATION_REQUIRED` (not the `503 PRODUCTION_APPLICATION_ACCESS_DISABLED` a disabled switch would give), and `/api/build-info` confirms it's running exact commit `e67bf163...` (PR #97, current `main`). | `lib/production-access-policy.js` — the single fail-closed gate in front of all production identity/member/operator routes. Real application access (not live funds) is live right now on this project. |
| Production application-access **activation workflow** | `.github/workflows/production-application-access-activation.yml` + `sw1-production-application-access-activation-gate` branch | **Repointed 2026-09-18.** `ACTIVATION_SHA`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `PRODUCTION_BASE_URL`, and all six `--scope=food-club` CLI flags updated to the real, confirmed `workers-food-club` (OriginOS) project and current `main` HEAD (`e67bf163...`). Applied to the `main`-tracked copy of the workflow file. **The control branch's own copy (what GitHub Actions actually executes on trigger) still needs the same fix pushed to it separately** — see note below. Four older RC3-era rehearsal/canary workflows (`rc3-bounded-production-canary.yml`, `rc3-production-access-rollback-rehearsal.yml`, `rc3-bounded-production-identity-rehearsal.yml`, `rc3-production-identity-config-preflight.yml`) still reference the old org/project too, but are gated behind a different, seemingly-retired control branch (`sw1-rc3-production-identity-live-provider-falsification`) from an earlier release cycle — left untouched as out of scope for this cleanup; say if you want those retired or fixed too. |
| **Canonical Vercel project** | — | **RESOLVED 2026-09-18.** `workers-food-club.vercel.app` (OriginOS team, `prj_Ti1NOQryzFeImhMSwncMXNxs01I8`) is the one real, live project. The second one is identified: same project name (`workers-food-club`), same Project ID that was hardcoded in the old activation workflow (`prj_Y10EuTs8ttzcRg9LZl2BASSiOFUE`), under Vercel account `ghanafoodgroup@gmail.com`, team "FoodClub" (`vercel.com/food-club/workers-food-club`) — not an orphaned domain, an entirely separate account Willie also owns. **Willie has paused it** (Project Settings → paused; visitors now get `503 DEPLOYMENT_PAUSED`), a fully reversible action that stops it from ever serving traffic without deleting anything. Its own GitHub integration/status check still fires on every push to this repo (confirmed on PR #98) — pausing only stops it from serving, not from receiving deployments, so it will keep building quietly in the background unless also disconnected. There is now exactly one project actually reachable by real users. |
| `PAYSTACK_SECRET_KEY` live-mode gate | `api/paystack-rehearsal.js`, `packages/pilot-payments/src/paystack.ts` (`PaystackConfigurationGate.validate()`) | `sk_test_` only — live keys hard-rejected | Prevents any live Paystack charge. Requires **both** a `sk_live_` key **and** an explicit `liveEnabled: true` config flag to ever accept live mode. This is intentionally a separate, still-withheld authorization track — see §5. |
| Owner bootstrap | Not yet built (no script exists) | **Not started** | Zero real `application_authority_grant` rows of type Owner exist for any real person. Until a bootstrap process is written and run, nobody can hold `authority:owner`, and therefore nobody can grant Admin, and therefore no real Admin/Operator grants can be issued through the governed `packages/authority/src/hierarchy.ts` path. See §4. |
| Constitutional (C0–C10) ratification | `constitution/baseline.json` | **`PROPOSED_FOR_RATIFICATION`, unchanged since the file's original commit (`a27132a`, "SW0-02: bootstrap constitutional kernel")** | `docs/agents/README.md` and `docs/agents/work-orders/A9-governance-wave1.md` both describe "Ratified C0-C10" as the superior authority governing all agent work, but the canonical record has never actually been marked ratified, and no substantive C0–C10 corpus text exists anywhere on `main` — only the corpus *index* (`["C0","C1",...,"C10","CB-00"]`) in `baseline.json`. **This is a genuine open governance question, not a clerical bug — I have not changed this file.** Either (a) the constitution was ratified out-of-band and the record needs updating to reflect that, with evidence of who ratified it and when, following the same pattern as `docs/governance/TRANSFER_POLICY_GOVERNANCE-v1.md`; or (b) it was never actually ratified and the agent-facing docs asserting "ratified" are themselves wrong and need correcting. **Willie Adofo needs to say which.** Do not silently flip this to `RATIFIED` on anyone's behalf, including an AI agent's. |
| Preview/Production Neon database isolation | Vercel/Neon project configuration (not visible from this codebase) | **CONFIRMED P0 — Production and Preview share the same Neon branch** (confirmed 2026-09-18 by direct human check of the Vercel dashboard and Neon console) | Every route reads a single `process.env.DATABASE_URL` (confirmed by direct code search across all of `api/*.js`); there is no code-level distinction between Preview and Production connection strings. With both environments pointed at the same Neon branch, any Preview/sandbox request — including anything the automated Preview rehearsal suites write — lands in the same physical database as real Production data. **See §7 for the proposed non-destructive remediation.** |

**Who pushes the activation trigger commit:** Willie Adofo personally, after his own testing. This
is explicitly not delegated to an AI agent in this engagement — see `docs/governance/PRODUCTION_APPLICATION_ACCESS_ACTIVATION-v1.json` for the authorization record format the trigger depends on. In
practice, the actual enablement on `workers-food-club` (OriginOS) happened via a direct dashboard
toggle rather than that trigger commit — recorded as `BLV2-DEC-014` in the decision register. The
existing JSON authorization record has **not** been edited to match, since retroactively rewriting
declared evidence would misrepresent what actually happened; if you want a formal record of this
real-world-testing authorization, say so and a new one can be added following the same versioned
pattern (`...-v2.json` or similar), rather than silently editing the existing file.

---

## 2. Environment variables

Legend: **REQUIRED** = route/feature fails closed (503/deny) without it. **OPTIONAL** = feature degrades gracefully or isn't reachable in the current pilot. Status is what this session could verify from code, not from live Vercel/GitHub settings (I cannot read those).

| Variable | Required by | Purpose | Status |
|---|---|---|---|
| `DATABASE_URL` | all `/api/*` Neon-backed routes | Postgres connection string | **CONFIRMED set correctly on `workers-food-club` (OriginOS) Production** — `/api/db-health` returns `connected`. Preview scope confirmed repointed to the new isolated branch per §7. |
| `PRODUCTION_APPLICATION_ACCESS_ENABLED` | `lib/production-access-policy.js` | Master kill switch, §1 | **CONFIRMED `true`** on `workers-food-club` (OriginOS), current `main` HEAD. Not yet independently confirmed for `workers-food-club-chi.vercel.app` (unreachable from this session) — moot if that project turns out not to be real/canonical. |
| `OIDC_ISSUER` | `lib/production-oidc-auth.js` (`readProductionOidcConfig`) | Expected Google issuer (`https://accounts.google.com`) | Likely set — `/api/member-orders` returns `401 AUTHENTICATION_REQUIRED` rather than a 503 config error, consistent with OIDC being wired up. Not independently verified beyond that. |
| `OIDC_AUDIENCE` | same; also reused by `api/db-health.js` as the frontend's Google Sign-In Client ID | Expected JWT audience / OAuth client ID | Same as above — likely set, not independently verified as the *correct* production Google OAuth Client ID. |
| `OIDC_JWKS_URI` | same | Google's public JWKS endpoint for RS256 verification | Same as above. |
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

**RESOLVED 2026-09-18.** Migrations 001-011 were already applied to the real production Neon
branch (`br-winter-poetry-ae8qho57`, project `wispy-dawn-96331519`, org "Ghana Food Group").
**Migrations 012-015 were confirmed missing** (`BLV2-DEC-009`) — `employee_session`,
`member_application`, `beneficiary_invitation`, `membership_invoice(_settlement)`,
`member_product_request_survey`, `support_case(_transition)`, and
`membership_shopping_credit_entry/lot` did not exist, meaning every operator-scoped action would
fail (`503 APPLICATION_BINDING_LOOKUP_FAILED`, fail-closed but non-functional) and
UC-01/02/03/04/11/14/28 had no backing tables at all, independent of
`PRODUCTION_APPLICATION_ACCESS_ENABLED`.

**Remediation complete (`BLV2-DEC-010`):**
- [x] Forked a `preview` Neon branch (`br-purple-grass-aej54d2x`) from `production` and applied
      all 6 outstanding migration files to it first, to prove them clean before touching
      production, including the `014_wave2_support_case.sql` column-rename upgrade path.
- [x] With explicit human authorization, applied the same 6 migration files to the actual
      `production` branch (`br-winter-poetry-ae8qho57`), statement by statement. Verified via
      `get_database_tables`: all 27 expected tables/views now present, matching the fork exactly.
      Verified the `support_case`/`support_case_transition` column rename landed correctly
      (`created_by_authn_subject_ref`, `updated_by_authn_subject_ref`, `authn_subject_ref`).
      No data was deleted or altered — every statement was `CREATE TABLE/INDEX IF NOT EXISTS` or
      an additive/`NOT VALID`-then-`VALIDATE` constraint change on newly created tables only.
- [ ] Re-run `/api/build-info` / `/api/db-health` against the Production Vercel deployment once
      convenient, to confirm the running app sees the new tables end-to-end (not just that Neon
      has them).
- [ ] After applying to production, re-run `/api/build-info` / `/api/db-health` against the
      Production Vercel deployment to confirm the app sees the new tables.
- [ ] Run `api/db-health.js` (or the `/api/build-info` probe path) against production after
      migrating, to confirm schema/runtime agreement before enabling application access.

---

## 4. Identity and authority seed data (Owner bootstrap)

Zero real people currently hold any `application_authority_grant` row in production. This means
production application access is live (§1) with **no one yet able to reach the Operator
console**, because:

- `packages/authority/src/hierarchy.ts` requires an active Owner grant to exist before an Admin
  can ever be granted, and an active Owner or Admin before any ordinary operator grant can be
  issued.
- There is currently no live HTTP invite/grant/revoke API wired to that hierarchy module (it's
  pure logic only — not yet callable from production for *ordinary* Admin/Operator grants).

**Built 2026-09-18: `POST /api/owner-bootstrap`.** A one-time bootstrap endpoint, not a manual SQL
script — matches this codebase's existing pattern (`api/employee-session.js`) of requiring live,
fresh Google re-authentication rather than trusting a caller-supplied identity string. It:
- Requires production access enabled and a Google ID token issued within the last ~90 seconds
  (the same "verify again" freshness check used for employee-session step-up) — so the resulting
  Owner grant is provably bound to whoever is making the live request, never to an identity this
  agent was merely told about.
- **Refuses with `409 OWNER_ALREADY_BOOTSTRAPPED` if any active `authority:owner` grant already
  exists anywhere** — checked and enforced before any write. This is the one safety property that
  matters: it can only ever establish the *first* Owner. Adding further Owners (e.g. the two
  backup System Owners from the original spec) is a separate, Owner-authorized succession path —
  still unbuilt — not a second call to this endpoint.
- Creates a `SYSTEM` participant (`participant:system-bootstrap`) as the grant's `grantor_id`
  (idempotent, `ON CONFLICT DO NOTHING`), a `PERSON` participant for the caller if they don't
  already have an identity binding (reuses an existing one if they do), and the
  `application_authority_grant` row with `actions: ['authority:owner']`.
- Tested with 7 unit tests (`tests/node/sw1-owner-bootstrap.test.mjs`) covering the refusal path,
  freshness check, first-run creation, and identity-binding reuse. The exact SQL sequence was also
  dry-run against the real, isolated `preview` Neon branch (§7) — not production — end to end,
  then the test rows were deleted; every statement executed and returned the expected rows before
  cleanup.

**Not yet done: actually calling it against production.** This requires Willie's own fresh
Google sign-in — this agent cannot and should not fabricate that identity. See the go-live order
in §8 for how to do this.

**After that, in order:**
1. [x] Owner bootstrap mechanism built and dry-run proven. Not yet executed against production.
2. [ ] From that Owner identity, grant the intended Admin(s) — **no HTTP API exists for this
   yet**; still needs the invite/grant/revoke surface from §6's deferred list.
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

## 7. Neon branch separation — DONE (2026-09-18)

**Confirmed 2026-09-18:** Production and Preview both resolved `DATABASE_URL` to the same Neon
branch. Remediated the same day, then independently re-verified end-to-end — not just assumed
from the dashboard edit.

1. ✅ **Created a new Neon branch** (`preview`, `br-purple-grass-aej54d2x`) forked from the
   shared/production branch (`br-winter-poetry-ae8qho57`) — copy-on-write, did not touch the
   source branch.
2. ✅ **Applied all 6 outstanding migration files** (012–015; see §3) to the new branch first,
   proved clean, then applied the same statements to the real production branch with explicit
   authorization. Both branches now carry all 27 expected tables/views.
3. ✅ **Willie repointed the Preview scope of `DATABASE_URL`** in Vercel to the new branch's
   connection string, leaving Production's value untouched.
4. ✅ **End-to-end re-verified**, using the Preview-only
   `/api/db-health?probe=database-target-fingerprint` endpoint (added in PR #97), which returns a
   SHA-256 hash of `DATABASE_URL`'s hostname — never the hostname or credentials themselves. This
   agent independently computed the expected hash from the `preview` branch's real Neon connection
   hostname (via an authenticated Neon MCP call, never printed in chat) and Willie opened a live
   Preview deployment in his own browser and reported back the value. **They matched exactly:**
   `efecbc10be311dc3b95f981eb70329b7e2402e526399b4414083e96f56549946`. Two independent sources of
   truth (this agent's Neon-side computation, Willie's Vercel-side browser fetch) agree — this is
   real proof of isolation, not an assumption.
5. The old shared branch (now Production's branch of record) was never deleted, reset, or
   otherwise touched by this remediation. Production always kept using it unmodified.

**Gotcha discovered along the way:** the first attempt to test the fingerprint endpoint hit a
Preview deployment built from the `sw1-production-application-access-activation-gate` control
branch — weeks-old code that predates PR #97 and doesn't have the fingerprint probe at all, so it
silently fell through to the default `/api/db-health` handler instead of erroring. Re-tested
against a deployment built from a commit that actually has PR #97 merged in; that one matched.
Worth remembering when testing against Preview URLs on this project: which branch a deployment
was built from matters, not just "is it a Preview deployment."

---

## 8. Suggested go-live order

Status as of 2026-09-18 — several of these are now done; kept as a checklist, not rewritten as
prose, so it stays legible as a record of what's actually left.

1. ✅ **Apply all migrations to production Neon** (§3) — done, verified via `get_database_tables`.
2. ⬜ Provision `EMPLOYEE_SESSION_SECRET` and confirm all OIDC-related env vars (§2) on
   Production — not independently re-verified since §2 was last updated.
3. 🟡 Run Owner bootstrap (§4) — mechanism built (`POST /api/owner-bootstrap`) and dry-run
   proven against a safe Neon branch, but not yet actually called against production. Needs
   Willie to fire it himself, freshly signed into Google (see §4 for exactly why this can't be
   done on his behalf). Without this, the app has real application access (see item 6) but
   nobody can hold real Admin/Operator authority yet.
4. ✅ **Repoint the activation workflow's `ACTIVATION_SHA`/org/project** and re-issue the
   authorization record — done (grant v4), on both `main` and the control branch. See §1.
5. ⬜ Refresh `RC3_PRODUCTION_MEMBER_TOKEN` / `RC3_PRODUCTION_OPERATOR_TOKEN` GitHub secrets —
   only relevant if the formal activation-gate ceremony is used again; not required for how
   access was actually enabled (see item 6).
6. ✅ **Production application access is enabled**, on `workers-food-club.vercel.app` — done, but
   via a direct Vercel dashboard toggle for real-world testing (Willie's explicit request,
   `BLV2-DEC-014`), not via the documented ceremony. Worth deciding whether to keep using
   dashboard toggles going forward or switch back to the governed workflow now that it's fixed.
7. ⬜ Confirm the workflow's own falsification step passes — moot unless/until the formal
   ceremony is actually fired; the real enablement bypassed it.
8. **Leave §5 untouched** (live funds, live Paystack, CAGD, credit expansion) until each is
   separately, explicitly authorized with its own governance record. Still true — application
   access being live does **not** touch this boundary.
9. ✅ **Separate the Neon branches** (§7) — done and independently re-verified end-to-end via
   the fingerprint endpoint.
