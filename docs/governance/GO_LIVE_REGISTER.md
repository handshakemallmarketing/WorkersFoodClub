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
| Owner bootstrap | `POST /api/owner-bootstrap`, `public/owner-bootstrap.html` | **DONE (2026-09-18).** This row was stale — the rest of this file (§4 below) has documented since the same day that the endpoint was built, tested (7 unit tests), and run against real production with Willie Adofo's real Google account. Corrected here on 2026-09-24 after an independent scan flagged the contradiction between this summary row and §4. | Was: zero real `application_authority_grant` rows of type Owner existed, so nobody could hold `authority:owner` or grant Admin/Operator through `packages/authority/src/hierarchy.ts`. Now resolved — see §4 for full evidence. |
| Constitutional (C0–C10) ratification | `constitution/baseline.json` | **`PROPOSED_FOR_RATIFICATION`, unchanged since the file's original commit (`a27132a`, "SW0-02: bootstrap constitutional kernel")** | `docs/agents/README.md` and `docs/agents/work-orders/A9-governance-wave1.md` both describe "Ratified C0-C10" as the superior authority governing all agent work, but the canonical record has never actually been marked ratified, and no substantive C0–C10 corpus text exists anywhere on `main` — only the corpus *index* (`["C0","C1",...,"C10","CB-00"]`) in `baseline.json`. **This is a genuine open governance question, not a clerical bug — I have not changed this file.** Either (a) the constitution was ratified out-of-band and the record needs updating to reflect that, with evidence of who ratified it and when, following the same pattern as `docs/governance/TRANSFER_POLICY_GOVERNANCE-v1.md`; or (b) it was never actually ratified and the agent-facing docs asserting "ratified" are themselves wrong and need correcting. **Willie Adofo needs to say which.** Do not silently flip this to `RATIFIED` on anyone's behalf, including an AI agent's. |
| Preview/Production Neon database isolation | Vercel/Neon project configuration (not visible from this codebase) | **RESOLVED, stale row corrected 2026-09-24.** Preview and Production now have separate `DATABASE_URL` Vercel env var entries (distinct env var IDs) pointing at separate Neon branches (`br-purple-grass-aej54d2x` for Preview, `br-winter-poetry-ae8qho57` for Production, project `wispy-dawn-96331519`). This has held consistently across many dry-run/apply cycles in this engagement (e.g. BLV2-DEC-034, -035, -039, -044): every schema and data change was dry-run applied to the Preview branch first and independently verified before being applied to Production, and Production was repeatedly confirmed to hold zero of the Preview-only test data created during those dry-runs. This codebase still reads a single `process.env.DATABASE_URL` per environment (unchanged, and correct) — the isolation is enforced by which physical Neon branch that variable resolves to per Vercel target, not by application code. §7's proposed remediation is superseded; not independently re-verified via a Vercel/Neon console screenshot as the original 2026-09-18 finding was, so a human spot-check remains worthwhile. |

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

**Migrations 016-029 (the J1-J31 launch-journey program's membership/auth-model rework,
workforce tools, catalog administration, promotions and credit schema) were confirmed missing
2026-09-22** during a codebase review: `main` had 374 external commits building this schema, but
production still only had the 27 tables from migrations 001-015 — none of the new membership
model, workforce, catalog-admin, promotions or credit schema existed, meaning that entire program
was non-functional in production despite being merged and (per its own governance record)
policy-ratified.

**Remediation complete (`BLV2-DEC-027`, `BLV2-DEC-028`):**
- [x] Dry-run applied all 16 outstanding migration files (the isolated `preview` Neon branch
      already had 016-019, `020_guest_membership_enrollment`,
      `021_j16_j17_j20_launch_journeys`, `021_member_native_auth`, and
      `027_catalog_administration_v1` applied by the external rework's own prior testing) to
      `br-purple-grass-aej54d2x`. All applied cleanly; preview went from 38 to 58 tables.
      **Found, documented, not fixed**: `application_membership.standing` is renamed
      inconsistently across `021_employee_membership_entitlement.sql` (→ `ACTIVE`/`GRACE`/
      `TERMINATED`), `027_final_policy_consistency_v1.sql` (reverts to `CURRENT`/`ENDED` with no
      data UPDATE), and `029_member_auth_runtime_consistency.sql` (→ `ACTIVE`/`ENDED`, the final
      state). This only avoided failing outright because no real membership row anywhere had a
      `standing` value that would violate the intermediate constraints. The migration files
      should be cleaned up into one consistent enum definition before anyone relies on applying
      them individually rather than as one batch.
- [x] With explicit human authorization ("Apply 016-029 to production now"), applied all 18
      files to the actual `production` branch (`br-winter-poetry-ae8qho57`), statement by
      statement. Verified via `get_database_tables`: all 58 expected tables now present, matching
      the preview fork exactly. Verified `application_membership_standing_check` and
      `application_membership_member_type_check` landed at their final ratified form. Verified
      the one real membership row (`membership:rc3:member:001`) was unaffected by the standing
      enum churn (`standing='INITIAL_FEE_DUE'` throughout). No data was deleted or altered — every
      statement was `CREATE TABLE/INDEX IF NOT EXISTS` or an additive/`DROP CONSTRAINT`-then-`ADD
      CONSTRAINT` change.
- [ ] Re-run `/api/build-info` / `/api/db-health` against the Production Vercel deployment to
      confirm the running app sees the new schema end-to-end.
- [ ] Exercise at least one real end-to-end flow through the new membership/auth model (self-
      service enrollment, Member Number issuance, authentication-before-settlement) against real
      production, the same way owner-bootstrap and the authority-invite flow were each proven with
      one real execution before being trusted.

**UC-08 product-offer payment atomicity (`BLV2-DEC-045`, 2026-09-24) — migration-free deploy.**
`api/pay-sandbox.js` had been a permanent `503 PREVIEW_PAYMENT_ATOMICITY_NOT_CERTIFIED` stub. The
full qualification-tier schema it needed (`preview_member_commitment.qualification_state`, the
30/50/70/100% ladder, `preview_sandbox_payment`, `preview_deadline_fulfillment_plan`,
`member_prepaid_balance_ledger`) already existed on both `preview` and `production` from migrations
022/025/027 — only the atomic payment-write application code was missing, which was built and
merged in PR #155. **No new migration file was added and none needs to be applied to production for
this change** — production's schema was already current. Note this is unrelated to whether the
route is *reachable* in production: per §5, `/api/pay-sandbox` remains hard-disabled in production
(`403 SANDBOX_PAYMENT_DISABLED_IN_PRODUCTION`) regardless of this change, unaffected and
re-verified — this entry documents schema readiness only, not a production activation.

(This narrative otherwise stops at migration 029, applied 2026-09-22; migrations 030-035 —
catalog/offer-listing linkage, membership-subscription settlement atomicity, and the
admin-editable membership fee — were each separately dry-run and applied to production during this
same engagement, see the decision register `BLV2-DEC-034`/`-035`/`-038`/`-043` for their own
evidence. This section has not been reconciled to list every migration individually since 029; the
decision register remains the authoritative, complete record.)

---

## 4. Identity and authority seed data (Owner bootstrap)

**DONE 2026-09-18.** Willie Adofo is the real, live System Owner. See the confirmed evidence at
the end of this section. The rest of this section is kept as the historical build record.

Previously: zero real people held any `application_authority_grant` row in production, meaning
production application access was live (§1) with **no one able to reach the Operator console**,
because:

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

**Confirmed 2026-09-18: executed against real production.** Willie signed into
`https://workers-food-club.vercel.app/owner-bootstrap.html` with his real Google account
(`ourpeoples@gmail.com`). `POST /api/owner-bootstrap` succeeded (201), reusing his existing
identity binding (`participant:rc3:operator:001`, a pre-existing record from earlier SW1-RC3
rehearsal work) rather than creating a duplicate — exactly the intended reuse path. Independently
verified directly against the real production Neon branch: `grant:ed0f75a4-311e-4ae2-b50a-3590a61b5d83`
exists with `actions=['authority:owner']`, `grantor_id=participant:system-bootstrap`,
`actor_id=participant:rc3:operator:001`, `revoked_at IS NULL` — and a separate query confirms
this is the **only** active `authority:owner` grant anywhere in the system. Recorded as
`BLV2-DEC-019`.

**Built 2026-09-18: `POST /api/authority-invite`, `POST /api/authority-invite-redeem`,
`POST /api/authority-revoke`.** The invite/grant/revoke HTTP surface referenced above. An existing
Owner or Admin (fresh OIDC + fresh step-up + a live `employee_session`) creates a bounded, expiring
invitation for someone who has never signed in before — only the token's SHA-256 digest is ever
stored (`packages/durability/sql/016_authority_invitation.sql`), the raw token is returned exactly
once in the response (no email provider wired; still "link-only," per the earlier deferred-email
decision). The invitee redeems the raw token with their own fresh Google identity; the inviter's
authority is re-checked **as of redemption time**, not assumed still valid from invite-creation
time, via `assertGrantIssuable`. Revocation mirrors this via `assertGrantRevocable` and does not
cascade to grants the revoked one delegated onward (`parent_grant_id` stays provenance-only, same
rule as `lib/application-principal-binding.js`). Covered by 22 unit tests across the three
endpoints; full `npm run conformance` green (591/591 node tests, canon/traceability/typecheck).
Migration 016 dry-run applied to the isolated `preview` Neon branch and its `CHECK` constraints
verified directly, then cleaned up. Recorded as `BLV2-DEC-020`. **Not yet merged to `main` or
exercised against production** — no real invite has been sent or redeemed yet.

**After that, in order:**
1. [x] Owner bootstrap mechanism built, dry-run proven, and executed against real production —
   verified directly in Neon, not just trusted from the page's own success message.
2. [x] Invite/grant/revoke HTTP API built and unit/dry-run tested (above) — **not yet merged or
   exercised against production**; Willie has not yet actually invited an Admin through it.
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

- ~~Live HTTP invite / grant / revoke API wired to `packages/authority/src/hierarchy.ts`~~ —
  **built 2026-09-18**, see §4. Still not merged/exercised against production.
- ~~Admin "Employees" management screen (grant/revoke UI, audit-log view)~~ — **built 2026-09-18**:
  `public/employees.js` (new SPA nav view), `api/authority-directory.js` (read-only roster,
  Owner/Admin gated), `api/authority-invite-cancel.js` (cancel a still-pending invite), and
  `public/redeem-invite.html` (the invitee's own acceptance page, modeled on
  `public/owner-bootstrap.html`). This is also the first working step-up UI anywhere in this
  frontend — every sensitive action re-triggers a fresh interactive Google sign-in at the moment
  of that specific request, which the `employee_session` mechanism (PR #93) has required since it
  was built but nothing ever actually drove. While building this, fixed a real defect in
  `api/authority-invite-redeem.js`: new identity bindings were created with an empty `scopes`
  column, which would have silently blocked every invited operator from using their granted
  `operator:*` actions (`lib/application-principal-binding.js` requires the scope in
  `application_identity_binding.scopes` in addition to the grant). Recorded as `BLV2-DEC-021`.
  Covered by 12 new unit tests, a headless-Chromium smoke test of both new pages, and a direct
  dry-run of the scopes-union fix against the isolated `preview` Neon branch. **Not yet merged to
  `main` or exercised against production** — no real invite has been sent or accepted through this
  UI.
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
2. 🔶 **Provision `EMPLOYEE_SESSION_SECRET`** on Production — **in progress 2026-09-18.** Confirmed
   missing when Willie hit `EMPLOYEE_SESSION_NOT_CONFIGURED` trying the new Employees screen's
   step-up flow in real production (the same gap this row already predicted). Willie added the
   variable via the Vercel dashboard, but the redeploy needed to pick it up got stuck twice
   (one attempt errored in ~10s with no build logs at all; a second sat in `INITIALIZING` for
   8+ minutes and was cancelled) — a Vercel platform-side issue, not a code or secret-value
   problem. Not yet independently verified end to end (a successful `/api/employee-session` call
   in production). Other OIDC-related env vars (§2) still not independently re-verified either.
3. ✅ **Run Owner bootstrap** (§4) — done. Willie is the real System Owner, verified directly in
   production Neon (`grant:ed0f75a4-311e-4ae2-b50a-3590a61b5d83`, sole active `authority:owner`
   grant). No HTTP API yet for him to grant Admin/Operator authority to anyone else — see §6.
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

---

## 9. P1: member sign-in admitted an authenticated non-member — RESOLVED 2026-09-19

**Built 2026-09-19.** `BLV2-DEC-023`. `public/auth.js`'s `authenticated()` now checks
`/api/membership-status` before ever treating an identity as signed in: no qualifying membership
→ `token`/`verifiedIdentity` are cleared and a dedicated denial screen is shown (routing to the
new `public/join.html` self-service application page, or "application already pending review" if
one exists) — never the old ambiguous "Signed in · access pending" state. Per Willie's refinement,
`SUSPENDED` (past-due) membership is still **admitted** (flagged `· restricted` in the UI), so a
delinquent member is never locked out of the remediation path back to good standing — only "no
membership row at all" or `ENDED` is denied. New: `packages/durability/sql/017_membership_application.sql`
(a `membership_application` table plus relaxing `application_identity_binding.authority_grant_id`
to nullable — a plain member binding has no authority grant to reference), `api/membership-status.js`,
`api/membership-apply.js`, `api/membership-application-decide.js` (Owner/Admin approve/reject,
added as a review section on `public/employee.html`). Covered by 25 new unit tests, full
`npm run conformance` green, migration dry-run proven end-to-end against the isolated preview Neon
branch, and headless smoke tests of all four gate scenarios (no membership / pending application /
SUSPENDED / ACTIVE) plus the approval and application flows. **Explicitly not built**: locking down
specific economic actions (purchase/payment) for `SUSPENDED` members app-wide — tracked as a
follow-on, not silently skipped. **Not yet exercised against real production.**

The original report, kept for the record:

**Flagged 2026-09-18 by Willie**, from real production testing of the (now separated, see below)
Employees screen. Signing in with Google currently leaves an authenticated identity with no
active `application_membership` row inside the app shell as **"Signed in · access pending"**,
rather than denying sign-in outright. Willie's assessment: this is a launch-blocking P1
authentication/authorization defect — not yet evidence of data exposure or privilege escalation,
but a violation of the intended access policy. His specified model:

> Google identity → membership lookup → active/eligible member binding → session established.
> If no qualifying membership exists, authentication should terminate with something like
> "We couldn't find an active WorkersFoodClub membership for this account," not a signed-in
> state.

**Status: scope agreed for an immediate fix, not yet built.** The two states that actually exist
in the schema today (`application_membership.state`: `ACTIVE`, `SUSPENDED`, `ENDED` — see
`packages/durability/sql/007_application_authority_membership.sql`) can be enforced now: no
`ACTIVE` row → deny sign-in outright with a clear message, instead of leaving `productionMemberAccessAvailable()`'s soft "access pending" state in `public/auth.js`. Willie's fuller proposed
access-state table (Anonymous / no-membership / Applicant-awaiting-approval / Approved-not-yet-
activated / Active-good-standing / past-due-restricted / Beneficiary-not-activated /
Activated-beneficiary / Employee-operator) names several states — Applicant, Approved-not-
activated, past-due-restricted, Beneficiary-not-activated — that do not exist in the schema and
have no self-service application/approval/activation flow anywhere in this codebase. Building
those is a separate, larger piece of work, not part of this immediate fix.

**Also resolved as part of scoping this:** the Employees screen (`public/employee.html`, moved
2026-09-18 from an embedded SPA tab — `BLV2-DEC-022`) is explicitly independent of membership.
Willie's own account holds only an `authority:owner` grant, no membership row; requiring
membership before the employee/operator path would have locked him out of the tool that manages
authority. The employee path's own auth (fresh OIDC + `employee_session` + Owner/Admin tier
check) is unaffected by whatever the member-sign-in fix ends up doing.
