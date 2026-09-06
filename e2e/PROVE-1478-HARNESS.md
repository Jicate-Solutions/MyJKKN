# Proving the guide-driven E2E auth harness (#1478) — PROD-SAFE runbook

The guide-E2E auth harness (`e2e/auth.setup.ts`, `e2e/persona-accounts.ts`,
`scripts/e2e-nav.ts`, `playwright.config.ts`) was merged in #1478 but has **never been run
end-to-end** — there was no safe environment to run it in. This is the exact, prod-safe
sequence to prove it.

**Audience:** a developer/devops with access to a **non-production** Supabase project.

> ⛔ **Never** run this against production. The seeding step CREATES 21 auth accounts; doing
> that on prod pollutes the live user table. `.env.local` in this repo is production. The
> whole flow is gated to dev by design — `/auth/test-login` is hard-disabled when
> `NODE_ENV=production`.

---

## Step 0 — Provision a safe environment (prerequisite / current blocker)

The repo ships no usable staging env (`.env.local` → prod; `.env.staging` has no Supabase
URL or service-role key). Obtain, for a **non-prod** Supabase project that is safe to seed:

- `STAGING_SUPABASE_URL` → `https://<ref>.supabase.co` (must NOT be the prod ref)
- `STAGING_SERVICE_ROLE_KEY` → that project's `service_role` key

Do not reuse a shared environment others depend on — seeding adds 21
`test.<role>@jkkn.ac.in` accounts.

## Step 1 — One shell, export staging vars, hard prod-guard

```bash
export NEXT_PUBLIC_SUPABASE_URL="<STAGING_SUPABASE_URL>"
export SUPABASE_SERVICE_ROLE_KEY="<STAGING_SERVICE_ROLE_KEY>"
export PERSONA_PASSWORD="<password to assign the 21 seeded test accounts>"

# Refuse to continue if this is the prod ref:
case "$NEXT_PUBLIC_SUPABASE_URL" in
  *kvizhngldtiuufknvehv*) echo "ABORT: that is PRODUCTION" ;;
  *) echo "OK: non-prod target $NEXT_PUBLIC_SUPABASE_URL" ;;
esac
```

`PERSONA_PASSWORD` is what Step 2's seeding script reads for every account it
creates — it isn't optional; the script has no default and will silently
create accounts with an empty password if you skip it. Set it to whatever
value you (or whoever owns the staging credential) have picked for that
project; it's unrelated to production's `NEXT_PUBLIC_TEST_PASSWORD`.

Shell-exported vars take precedence over `.env.local` in Next.js, so this does **not** modify
the prod `.env.local` file.

## Step 2 — Seed the 21 test accounts into staging

```bash
npx tsx scripts/create-test-accounts.ts
```

Creates `test.<role>@jkkn.ac.in` (21 roles), all with the password from
`PERSONA_PASSWORD` (exported in Step 1), in the staging project from Step 1.

> The script's own help text suggests `source .env.local` — **ignore it**, that points at
> prod. The explicit exports in Step 1 are what you want.

## Step 3 — Local dev server pointed at staging

A Vercel staging *deploy* won't work: it runs `NODE_ENV=production`, which disables
`/auth/test-login`. Use a **local** dev server (same staging vars from Step 1):

```bash
npm run dev   # note the port it prints
```

Sanity check: open `http://localhost:<port>/auth/test-login` — you should see the role cards,
NOT the "Test login is only available in development mode" guard.

## Step 4 — Generate the spec + run Playwright authenticated

```bash
npx playwright install chromium        # first run only

export GUIDE_E2E_BASE="http://localhost:<port>"   # match Step 3's port
export GUIDE_E2E_AUTHED=1

npm run gen:guide-e2e                  # writes e2e/guide-nav.generated.spec.ts
npx playwright test                    # setup (mints storageState) → guide-nav
```

## Step 5 — What success looks like

- `setup` mints one storageState per MAPPED persona under `.auth/`:
  `learner / facilitator / supervisor / module-admin / platform-admin` (the 5 CLEAN
  personas), plus `coordinator` + `external` (APPROX). `unit-lead` and `parent` mint nothing
  (null mapping → nav-only) — expected.
- The `guide-nav` spec passes its authenticated **login-bounce assertion** for the 5 clean
  personas (a valid persona must not be bounced to `/auth/login` on its own pages).
- Green run ⇒ #1478 is proven.

## Step 6 — Resolve the 4 flagged persona mappings (`e2e/persona-accounts.ts`)

| Canonical persona | Current stand-in | Status | Action |
|---|---|---|---|
| `coordinator` | `test.counselor@jkkn.ac.in` | APPROX | Confirm with the owner, or seed a dedicated account holding the coordinator-spanning keys |
| `external` | `test.guest@jkkn.ac.in` | APPROX | Confirm guest ≈ partner/visitor is acceptable |
| `unit-lead` | `null` | nav-only | Seed an account holding the unit-lead keys to enable the authed check |
| `parent` | `null` | nav-only | Seed a parent account |

**Keep these in sync as the registry grows.** As of the learners/learners-council/events
batch, two lanes widened:
- `unit-lead` now also spans council **member** (`learners_council.view`) + events
  **organiser/ops** (`events.marathon.view`).
- `coordinator` now also spans council **coordinator** (`learners_council.view`) + events
  **proposer** (`events.proposals.view`).

A dedicated `unit-lead` test account should therefore hold `learners_council.view` +
`events.marathon.view`; the `coordinator` stand-in should also hold `events.proposals.view`.

---

### Reference (the moving parts)
- Seeding: `scripts/create-test-accounts.ts` — needs `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` + `PERSONA_PASSWORD`; 21 accounts.
- Login page: `app/auth/test-login/page.tsx` — blocked when `NODE_ENV === 'production'`.
- Setup: `e2e/auth.setup.ts` — reads `GUIDE_E2E_BASE` (default `:3104`), `GUIDE_E2E_AUTH_DIR`
  (default `.auth`); no-op unless `GUIDE_E2E_AUTHED=1`.
- Config: `playwright.config.ts` — projects `setup` → `guide-nav`.
- Generator: `npm run gen:guide-e2e` = `tsx scripts/e2e-nav.ts`.
