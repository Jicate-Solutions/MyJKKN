TASK: The single "start here" is getting PRs #2260 and #2267 merged to production and deployed. First check whether a developer has merged either PR into `Jicate-Solutions/MyJKKN` `main` (you cannot merge them yourself — a local pre-push guard blocks all pushes to main, and the Translator-Pattern rule forbids pushing the diverged `omm-dev` checkout to production). If BOTH are merged: run `/deploy-myjkkn` (fires the Vercel deploy hook from latest `main`) and then verify the live pages — the "Admin · AI Starters" sidebar entry renders, My AI Pulse still shows the 13 subjects' English+Tamil prompts, and the week-switcher (`?cycle=<id>`) loads a past cycle read-only. If NEITHER is merged: tell the Director plainly that a developer must click merge on #2260 and #2267 (the agent physically cannot), then move on to priority #2 while waiting — do not block. If one is merged and one is not, deploy the merged one and verify only its surface. Both PRs are type-clean (scoped tsc, CI is the authoritative gate); the migration inside #2260 is ALREADY APPLIED to prod, so the deploy is code-only and the migration is a no-op — but still do the post-deploy "is the schema present" sanity check since deploy ships CODE not migrations.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase project ref `kvizhngldtiuufknvehv` (prod). Management API token at `/Users/omm/.supabase/access-token`; call `POST https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query` with `curl -A "MyJKKN-Director-CLI/1.0"` (non-default UA — the default urllib/python UA is Cloudflare-blocked with `403 error code 1010`). App env at `/Users/omm/PROJECTS/MyJKKN/.env.production.local` (values may carry a literal `\n` — strip it). NOTE: the auto-mode classifier BLOCKS agent-run prod DB writes (Mgmt API UPDATE / CREATE FUNCTION) even inside rolled-back txns — stage the SQL as a script and have the Director run it via the `!` prefix; do NOT hide writes inside `bash script.sh` to evade the guard. Reads (SELECT) are fine.

SPEC: none — all four tasks are self-contained. Scope lives in progress.txt (top entry, 2026-07-22 [AI PULSE]) + memory `project_aipulse_domain_starter_loop.md`.

PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt

CURRENT STATE (as of brief-write time):
- Domain Starter feature is LIVE on jkkn.ai: kill switch `ai_pulse_policies.domain_starter_enabled=true` (committed), 13 subjects' prompts showing to learners in English + Tamil. Was DARK before this session.
- The 13 prompts were re-pointed onto the current card cycle `d9e6b0d4` (07-23) because the card resolves the LATEST `startup_events` by `demo_date`. The Thursday 09:00 UTC cron regenerates fresh prompts onto that same cycle+topic — so a fresh regeneration between now and the next session is expected, not a bug.
- Tamil is show-unless-`ta_review_status='rejected'` (approval step removed by Director decision; the wired admin page keeps a per-prompt reject kill-switch). `apply-tamil-noapproval` already ran on prod.
- Critical read-fn bug (`fn_ai_pulse_my_domain_starters` ambiguous `topic_type`, ERROR 42702) was fixed this session — proven by impersonating a real BPHARM learner in a rolled-back txn.
- TWO PRs OPEN awaiting a dev merge: **#2260** (read-gate + ambiguity-fix migration [already applied to prod] + Tamil no-approval + sidebar "Admin · AI Starters") and **#2267** (learner WEEK SWITCHER on My AI Pulse — `?cycle=<id>`, read-only past cycles, hides submit on past weeks).
- Branch/worktree facts: #2260 work lives in worktree `.claude/worktrees/aipulse-golive-cleanup`; #2267 in `.claude/worktrees/aipulse-cycle-switcher`. The main `omm-dev` checkout has UNRELATED uncommitted changes (hr/attendance, nav-config, activity-service, features.json) that are NOT from this work — do NOT stage or commit them. Only progress.txt was committed this session.

VERIFY CURRENT STATE (run BEFORE any work — all read-only):
- PR merge status: `~/bin/gh pr view 2260 --repo Jicate-Solutions/MyJKKN --json state,mergedAt,mergeable` and the same for `2267`.
- Switch still on: `curl -s -A "MyJKKN-Director-CLI/1.0" -X POST https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query -H "Authorization: Bearer $(cat ~/.supabase/access-token)" -H "Content-Type: application/json" -d '{"query":"select domain_starter_enabled from ai_pulse_policies limit 1"}'` — expect `true`.
- Whether PR files are on main yet: `git fetch jicate main` then `git ls-tree jicate/main -r --name-only | grep -iE "domain-starter|ai-pulse"` and diff the relevant migration/sidebar/card files against `jicate/main`.
- If reality differs from this brief (e.g. both already merged+deployed, or switch flipped off) → STOP, report to the Director, do NOT execute the stale plan.

WHAT NEEDS TO HAPPEN (order = Director's ranking):
1. [P0] Merge + deploy PRs #2260 + #2267 — check merge status → if merged, `/deploy-myjkkn` + verify live pages; if not, ask Director to have a dev merge, then proceed to #2. (Small once merged.)
2. [P0] Quiz leaderboard — Quizizz-style, post-session ranking first, then live-during-session. Files: `app/(routes)/ai-pulse/live/[cycle]/_components/quiz-panel.tsx` + `lib/services/ai-pulse/quiz-service.ts`. The only ranking surface that exists today is the dept-ranking panel in Lab — read it for the pattern before inventing one. (Medium-large.)
3. [P0] Attendance in Proof — wire the `ai_pulse_live_attendance` table into My Proof's "Presence"/Attendance section, which currently EXCLUDES AI Pulse. Files: `components/proof-record/record-sections.tsx` (`AttendanceSection`) + `app/api/proof-record/route.ts` + `lib/services/ai-pulse/learner-service.ts` (`getMyStreak`/`getMyAttendance`). (Medium.)
4. [P1] Verify week switcher (#2267) visually on the Vercel preview (or prod once deployed) as a real learner — confirm past cycles load read-only and submit actions are hidden. (Small.)
Tasks #2 and #3 touch different file trees (quiz-panel/quiz-service vs proof-record/proof-record-route) and are INDEPENDENT — parallelize via two subagents if you take them on together.

CONSTRAINTS & RULES:
- JKKN terminology gate: "learner" not "student", etc. — sweep PROSE too (commit bodies, error strings, SQL_FILE_INDEX), not just UI labels. Invoke the `jkkn-terminologies` skill for any user-facing copy.
- Brand: green `#0b6d41` (do NOT ship all-green — full palette adds gold `#ffde59` + cream `#fbfbee`, but green is the app theme default).
- Every NEW SECURITY DEFINER RPC migration MUST include `REVOKE EXECUTE ON FUNCTION ... FROM anon, PUBLIC;` + `GRANT EXECUTE ... TO authenticated;` (Supabase's default grants anon EXECUTE on every new function). A cron/system-only RPC grants `service_role`, NOT `authenticated`.
- Ship via `/ship-myjkkn` (Translator-Pattern worktree PR) — NEVER push `omm-dev` to `main` (it's 720+ commits diverged and MISSING merged prod features). Deploy via `/deploy-myjkkn` after a PR merges.
- Avoid branch names containing the substring "main" — the pre-push guard is a crude substring matcher and false-positives on "domain", "remained", "maintenance". Rename with `git branch -m` to a name without that substring before pushing.
- Full-project `tsc` OOMs locally (exit 134 / false exit-0 when backgrounded) → use a scoped tsconfig (`extends ./tsconfig.json`, narrow `include`) and diff errors against the pristine `jicate/main` copy of the same files. Errors on BOTH = baseline noise; errors only on your copy = your regression. CI is the authoritative full-project gate.
- Deploy ships CODE not migrations — any PR carrying a `supabase/migrations/*` file needs the migration applied separately via the Mgmt API AND a live "schema present" verify.
- Local dev server / browser testing → ALWAYS from a `jicate/main` worktree, NEVER this `omm-dev` checkout (serves stale code missing merged features).

KEY FILES TO READ FIRST (absolute paths):
- `/Users/omm/PROJECTS/MyJKKN/progress.txt` — top entry (2026-07-22 [AI PULSE]) is this session; the full task list with file paths.
- `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_aipulse_domain_starter_loop.md` — complete feature state, grain model, the 42702 bug, the two open PRs, job type `ai_pulse.domain_starter`.
- `/Users/omm/PROJECTS/MyJKKN/CLAUDE.md` — production-sweep-before-plan gate, ship/deploy Translator Pattern, RLS/permission conventions, anon-revoke RPC rule.
- Memory `feedback_deploy_ships_code_not_migrations_management_api_apply` — the Mgmt-API apply path + curl UA gotcha, for the post-deploy migration sanity check.
- Memory `feedback_prepush_guard_main_substring_blocks_domain_branches` and `feedback_tsc_oom_use_scoped_tsconfig_and_diff_baseline` — the two guard/tooling traps you WILL hit on tasks #2/#3.
- Memory `feedback_admin_mint_persona_render_any_real_user` — how to render a prod/preview page as a real learner (generateLink→verifyOtp, zero mutation) for task #4 and for verifying #2/#3.
- For task #2/#3 code: `app/(routes)/ai-pulse/live/[cycle]/_components/quiz-panel.tsx`, `lib/services/ai-pulse/quiz-service.ts`, `components/proof-record/record-sections.tsx`, `app/api/proof-record/route.ts`, `lib/services/ai-pulse/learner-service.ts`.

KEY DECISIONS MADE THIS SESSION (with rationale):
- Re-pointed the 13 prompts onto the current cycle `d9e6b0d4` rather than waiting for the next gen — the card resolves latest-by-`demo_date`, which had rolled to the empty upcoming week, and the Director wanted them live NOW. The week-switcher (#2267) is the durable fix: future weeks keep their own prompts and no data-moving is ever needed again.
- Tamil = show-unless-rejected (not pure always-show) so the just-wired admin page retains a per-prompt reject kill-switch — a middle ground between the removed approval gate and no control at all.
- Kept the switch ON (real go-live) per Director — do NOT flip it back to dark.

APPROACH / QUALITY BAR:
- Start with the read-only VERIFY block above. Treat MCP/memory as possibly stale; Bash + a live prod read is ground truth.
- For #1: the whole task may be "check status, deploy if merged, verify, report." If not merged, the honest deliverable is telling the Director a dev must merge — that is success, not failure. Then advance to #2.
- For #2/#3 (real builds): read the existing pattern (dept-ranking panel for #2; the current Proof sections for #3) BEFORE writing new code. Stay in scope (rule #22) — touch only files the task requires; the `omm-dev` dirty tree is off-limits. Simplest version that solves the ask (rule #23).
- New RPCs follow the anon-revoke template. New DB writes are staged for the Director to run via `!` (classifier blocks agent writes).

DO NOT:
- Push `omm-dev` to `main`, or merge the PRs yourself (you can't — and must not fake it).
- Commit the unrelated dirty files in the `omm-dev` checkout.
- Name a branch with the "main" substring.
- Trust a backgrounded full-project `tsc` exit-0 as a real pass.
- Flip `domain_starter_enabled` back to false.

VERIFY BY: PR JSON `state:"MERGED"` + a real deploy hook fire + live page content (not SHA) — sidebar "Admin · AI Starters" present, My AI Pulse shows a subject's EN+Tamil prompt, `?cycle=<pastId>` loads read-only. For #2/#3, browser-test as a minted real learner (persona harness) — automated green checks are not proof for anything visual.
