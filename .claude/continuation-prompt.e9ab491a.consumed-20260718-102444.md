# Continuation Brief — 2026-07-18 → next session

**Task:** Resume the autonomous **build loop** for the **Jicate Apps Control Tower → App Routines subsystem**.
The loop prompt (re-arm it): `/loop build the next item on the plan in each phases till we complete all the phases, then run tests, typecheck, and lint. Feed every failure back as the next instruction and fix it. Stop when the build is green and the checker has nothing left to report.`

**⚠️ CROSS-REPO:** the code lives in `/Users/omm/PROJECTS/jkkn-centralized-bug-reporter` (the reporter), NOT MyJKKN — even though CWD is MyJKKN. Ships via remote `jicate` (Jicate-Solutions/BugReporter), not `origin`.

---

## ⭐ P0 (user-stated verbatim, from /cnext interview)
> **"Resume the loop."** Merge PR #12 when green (fix advisory findings first) → build Phase 3 → build Phase 4 (App Advisor). Continue the plan to completion.
> Drops: **NONE — carry everything forward** (keep the full plan, locked decisions, and the paused YI Connect test routine `4d6f7b7d`).

---

## VERIFY CURRENT STATE (run first — reality-check)
```bash
cd /Users/omm/PROJECTS/jkkn-centralized-bug-reporter
gh pr view 12 --repo Jicate-Solutions/BugReporter --json state,mergeStateStatus   # expect OPEN
gh pr checks 12 --repo Jicate-Solutions/BugReporter | grep -vE "^Vercel Preview"   # Vercel/advisory/Risk = pass
git fetch jicate main && git log jicate/main --oneline -1                          # expect bed7e9c (Phase 1)
# reporter DB reachable via my Supabase Mgmt token (same as MyJKKN):
TOKEN=$(cat ~/.supabase/access-token | tr -d '[:space:]')
curl -s -X POST "https://api.supabase.com/v1/projects/adakhqxgaoxaihtehfqw/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select to_regclass('"'"'public.app_ai_routines'"'"') t, (select count(*) from public.app_ai_routines) n"}'
# ↑ expect table exists, n>=1 (the paused YI Connect test routine 4d6f7b7d)
```

## TASK STEPS (resume the loop)
1. **Finish Phase 2 (PR #12):** the advisory PASSED (no blockers) but flagged **3 findings — fix before merge:**
   - **MED** `app/api/internal/routines/run/route.ts` (~L159): the `'running'` run-row `insert(...).select('id').single()` **ignores its error** → orphaned engine job + `runId:null` → client polls `?runId=null` → 400 loop → result lost. Fix: destructure insert error; on failure return 502 `UPSTREAM_ERROR` (record an error run). (Same silent-failure class already fixed in `dispatcher.ts` — mirror it.)
   - **MED** `_components/routines-manager.tsx` `runNow` (~L220): the POST + GET polls have **no `AbortController`/timeout** → a hung POST = stuck spinner forever. Fix: wrap in `AbortSignal.timeout(...)` + toast on abort (mirror the AI-card timeout fix from PR #9 `b2ddccf`).
   - **LOW** `lib/routines/catalog.ts` `hhmmToMinute` clamps >23:45→1425 but the card's local `time` state isn't re-synced after save → input shows `23:50`, saves `23:45`, Save button lingers. Fix: reject >23:45 in `hhmmToMinute` (return null) OR re-sync local state from props after save.
   - Then: `tsc --noEmit` (expect 1 pre-existing `resend` err only) + `eslint` (0) → push → wait build+advisory green → **squash-merge** `gh pr merge 12 --repo Jicate-Solutions/BugReporter --squash --delete-branch` → verify main advanced + homepage 200.
2. **Phase 3:** add `app.dupe-scan` (weekly duplicate report, NEVER auto-closes) + `app.new-bug-digest` (nightly summarize+categorize) as `ROUTINE_CATALOG`/registry kinds (1 entry + `buildInput` + a client renderer each). Plus the **tabbed control-surface IA** on the per-app view: Overview · Bugs · AI · Routines · Uptime (+ a nav link to `/org/[slug]/routines`, which has none yet — currently URL-only).
3. **Phase 4 — App Advisor:** one-click per-app button. Reads the app's **Jicate-Solutions repo** (locked: apps mostly there → Max-lane engine = Claude Code clones w/ Director's GitHub auth; context-fallback if no repo) → suggests routines + loops with reasons → **adopt** (routines → paused `app_ai_routines` rows; loops → a "proposed loops" spec backlog, since apps have NO loop engine yet). Needs `applications.repo_url` + a new engine clone-and-analyze `ai_job_types` recipe. Suggest≠auto-adopt; human curates.
4. Per phase: own branch off `jicate/main` → tsc/eslint → PR → **wait for the advisory ultracode panel** (it caught real HIGH/MED LOGIC bugs on EVERY routines PR, invisible to green build) → fix genuine findings → merge on green → verify. Re-arm the /loop wakeup between waits (self-paced, ~300-360s for build+advisory).

## WHAT'S DONE (this session)
- **Per-app AI** (earlier): PR #10 `a2f767d` LIVE — AI Max cards scoped to one app on `/org/[slug]/bugs?app=`; PRs #8/#9 (dashboard + timeout) also live.
- **Phase 1 routines backend: MERGED + LIVE + PROVEN ₹0** — PR #11 `bed7e9c`. 3 prod migrations `20260718_app_ai_routines{,_fix,_fix2}.sql` (APPLIED via Mgmt API): `app_ai_routines` + `app_ai_routine_runs` + 3 service-role RPCs (`fn_app_routine_claim_due`/`_record_fire`/`_prune`) + admin-write RLS. `lib/routines/{engine,registry,dispatcher,catalog}.ts` + cron `/api/cron/app-routine-dispatcher` (*/15m, `vercel.json`). Survived **3 advisory ultracode-panel passes**. **RUNTIME PROOF:** seeded YI Connect `app.brief` (routine `4d6f7b7d`, org `73ee3a1c-6c63-4ffa-b961-94c1d9a88cbe`, app `a35f7abc-e9fc-46e3-ba30-adebd5138b1d`) fired at 03:01 UTC → real 118-bug briefing stored ₹0. **Now PAUSED (enabled=false) — KEEP it** (user carry-forward; it's demo data + one successful run in history).
- **Phase 2 routines UI: PR #12 OPEN, all checks green, 3 advisory findings to fix (above).** Files: `app/(dashboard)/org/[slug]/routines/page.tsx` + `_components/routines-manager.tsx` + `app/api/internal/routines/run/route.ts` (POST enqueue + GET poll) + `lib/routines/catalog.ts`.

## KEY DECISIONS (locked — §0 of the plan doc)
admins-only writes (RLS) · new routines start PAUSED · 90-day retention · empty-run="all clear" (no engine call) · **panel-only output, NO email** · **read-only kinds auto-run only** (runtime-guarded) · ₹0 Max lane · reporter OWNS scheduling, MyJKKN unchanged executor via the AI Door · extensible `ROUTINE_CATALOG` registry is the spine · build order: routines fully, THEN Advisor. Full plan: `/private/tmp/claude-501/-Users-omm-PROJECTS-MyJKKN/b9b3e3bd-c277-4883-89ba-146564495a0c/scratchpad/per-app-routines-plan.md` (may be gone if scratchpad cleared — the plan is fully in memory `project_jicate_ai_door.md`).

## MUST-READ MEMORY
- `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_jicate_ai_door.md` (top paragraph = full routines-subsystem status + all facts)
- `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_reporter_bug_reports_schema_drift.md` ⚠️ reporter `bug_reports`: NO priority/is_resolved cols; statuses new/seen/in_progress/resolved/wont_fix; category='security'=risk flag; wrong-col select compiles but crashes.

## GOTCHAS
- **Reporter DB write = Supabase Mgmt API** (POST `/v1/projects/adakhqxgaoxaihtehfqw/database/query`, token `~/.supabase/access-token`). Migrations are files + this API; **NOT auto-applied by CI**. Show SQL first (additive DDL only). Apply migration BEFORE merging the code that uses it (schema-first ordering).
- **Checker = `tsc --noEmit` + `eslint`** only (NO test suite). Always 1 pre-existing `resend` tsc error — ignore it.
- The **advisory ultracode panel is the real correctness gate** — it found real HIGH/MED logic bugs invisible to green build/tsc/eslint on every routines PR. WAIT for it before merging infra; fix genuine HIGH/consensus-MED; converge (don't chase single-lens LOWs to literal zero on an adversarial panel).
- Reporter auto-deploys prod on merge to `main` (unlike MyJKKN). Pixel-eyeball of the Routines UI is Director-login-gated (`/org/jicate-solution/routines`).
- `new Date()`/`Date.now()` are FINE in reporter app code (the ban is only inside the Workflow-tool script sandbox).
