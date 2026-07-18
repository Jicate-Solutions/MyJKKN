TASK: In one push, build BOTH remaining work-signals spine phases. Phase 1.1 (deep-link empty states): turn every zero work-signal and the gentle empty-state card in `<WorkSignalsCard>` into a "start here" link to the page where that work begins — the director chose "ALL zeros link somewhere" (even downstream/received signals point to the closest relevant page, not only self-actionable ones). This needs a new `action_route` (and optional `action_label`) column on the `work_signal_types` registry (8 rows), seeded per signal, plus card render changes so a 0 renders as a link. Phase 2 (marking reconciliation, "DO BOTH"): (a) change `fn_faculty_metrics` `marking_compliance` so it credits ASSIGNED-and-marked days rather than only days the faculty personally clicked (`marker_id`), so delegating faculty stop being scored 0% unfairly; AND (b) surface both numbers ("assigned vs you personally") on the dashboard Teaching Excellence tile. This is scores+rankings work: `marking_compliance` feeds the TES percentile cache, so cluster standings shift for every delegating faculty and the mirror `fn_compute_tes_for_user` must get the identical change. Ship them as ONE coordinated push (one PR or two stacked PRs off the same fresh worktree — your call), fully tested.

PROJECT: /Users/omm/PROJECTS/MyJKKN (spine work ships via a worktree PR off `jicate/main`, NOT the local diverged `feat/campus-living-fee-compute-engine` branch — local is 720+ commits diverged and missing merged prod features).
DATABASE: Supabase prod ref kvizhngldtiuufknvehv. Management API token at /Users/omm/.supabase/access-token (Bearer; use a non-default User-Agent). Supabase MCP also has full prod read+write. Show-SQL-first; validate every migration on prod inside a BEGIN…ROLLBACK batch (results via RAISE) BEFORE applying for real.
SPEC: none — the memory file below is the source of truth.
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (bottom "Session END 2026-07-18" block has the decomposed Next-Session tasks + lessons)

CURRENT STATE (as of brief-write time):
- Phases 0+1 are LIVE + deployed + verified. Engine `fn_work_signals_for(p_from date, p_to date)` (self-scoped auth.uid()→email, SECURITY DEFINER, anon REVOKE'd) + registry `work_signal_types` (8 rows) are live. Shared `<WorkSignalsCard>` renders on the faculty/HOD dashboard AND My Pulse (verified live as Dr.V: "Sessions marked 52 · you:0" + 7 signals).
- Phase 1.1 + Phase 2 are DECIDED (director, 2026-07-18) but NOT built.
- `fn_scf_my_pulse` is now orphaned (only prior caller repointed) — do NOT drop it in these PRs; it is a separate strangler follow-up (task #3) after confirming zero external callers.
- Main-repo branch: `feat/campus-living-fee-compute-engine` (unrelated). Clean Phase-1 worktree exists at .claude/worktrees/spine-p1; the .claude/worktrees/dash-cards-fix worktree is contaminated/drifted — do NOT reuse it, let the janitor clean it.

VERIFY CURRENT STATE (run BEFORE any work — if reality differs, STOP, report, do not execute a stale plan):
- `cd /Users/omm/PROJECTS/MyJKKN && git fetch jicate main && git show jicate/main:components/work-signals/work-signals-card.tsx >/dev/null && echo "Phase1 present"`
- SQL (via Supabase MCP or Management API): `SELECT count(*) FROM work_signal_types;` (expect 8) and confirm columns — `action_route` should be ABSENT (you are adding it).
- SQL shape check for Phase 2: confirm `fn_faculty_metrics` `marking_compliance` currently keys on `student_attendance.marked_by_details.marker_id` (personal) and `fn_compute_tes_for_user` mirrors it.

WHAT NEEDS TO HAPPEN:
1. Phase 1.1 DB — migration adding `action_route TEXT` (and optional `action_label TEXT`) to `work_signal_types`, then seed the 8 rows with these exact routes: `sessions_marked`→`/academic/attendance/mark`; `lessons_linked`→`/academic/attendance/mark`; `pulses_run`→`/academic/session-feedback/faculty`; `verdicts_given`→`/academic/session-feedback/faculty`; `sessions_witnessed`→`/academic/session-feedback/faculty`; `notes_received`→`/academic/session-feedback/faculty`; `votes_received`→`/academic/session-feedback/faculty`; `marks_coverage`→closest COE/session-feedback page (use `/academic/session-feedback/faculty` unless a better marks page exists — verify).
2. Phase 1.1 frontend — `<WorkSignalsCard>` renders each zero-value signal (and the whole-card empty state) as a link to its `action_route` ("start here" affordance). `fn_work_signals_for` must return `action_route` in each signal's jsonb so the card doesn't need a second fetch — patch the engine's SELECT to join the registry column. Keep the existing gentle-empty tone, dual-attribution display, unmatched-account flag, 10s timeout race, never-ranks behavior.
3. Phase 2 DB — new migration changing `fn_faculty_metrics` `marking_compliance` to credit ASSIGNED-and-marked days (assigned faculty on the timetable slot + the day was marked by anyone) instead of `marker_id`-personal; apply the SAME change to the mirror `fn_compute_tes_for_user` (in the cluster-rank-private migration). Remember the timetable shape trap: any periods[]→timetable_data slot lookup MUST `COALESCE(period->>'period_id', period->>'id')` (179/205 timetables are `id`-shape; see the feedback memory).
4. Phase 2 ranking re-run — after applying, re-run `fn_precompute_percentile_cache` and validate the TES distribution did not break (compare before/after cluster counts; expect delegating faculty like Dr.V — 0 personal vs 20 assigned marking-days in 30d — to move UP, not a mass collapse).
5. Phase 2 frontend — Teaching Excellence tile shows BOTH "assigned vs you personally" marking numbers.
6. Ship via a FRESH worktree PR off `jicate/main`; after checkout verify `git diff --name-only` == intended files ONLY (reused worktrees drift and autosave nearly swept 23 unrelated files last time).

CONSTRAINTS & RULES:
- Any new RPC/column: explicit `REVOKE EXECUTE … FROM anon, PUBLIC; GRANT … TO authenticated` (Supabase's default grants anon EXECUTE on new functions).
- SQL file policy: functions → `supabase/setup/02_functions.sql` ONLY (update, never new files); update `supabase/SQL_FILE_INDEX.md` after; add dated comments.
- JKKN terminology (CI-gated): "sessions" not "classes", "learner/facilitator" not "student/teacher".
- Deploy ships CODE, not DB migrations: apply DB via Management API / Supabase MCP yourself, then fire the Vercel deploy hook manually (merge-queue merges do NOT auto-fire a Vercel build). Deploy hook (current token, verified this session): `curl -X POST "https://api.vercel.com/v1/integrations/deploy/prj_yH37MwPX0aAAUXNjZX1YlOHoowRM/Y0RfATZ0rv"`.
- Local full `tsc` OOMs (46min/10.6GB) → rely on CI PR-scoped typecheck (~1m30s) as the gate, not local.

KEY FILES TO READ FIRST (absolute paths):
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_work_signals_spine.md (PRIMARY — all locked decisions + Phase 1.1/Phase 2 specifics)
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_timetable_periods_id_vs_period_id_shape.md (the period_id/id COALESCE trap you MUST apply in Phase 2)
- /Users/omm/PROJECTS/MyJKKN/components/work-signals/work-signals-card.tsx (the card you extend for deep-links)
- /Users/omm/PROJECTS/MyJKKN/lib/services/work-signals-service.ts (`WorkSignalsService.getWorkSignals(from?, to?)`)
- The live `fn_faculty_metrics` `marking_compliance` block and its mirror `fn_compute_tes_for_user` (read via Supabase MCP; canonical copy in /Users/omm/PROJECTS/MyJKKN/supabase/setup/02_functions.sql)
- /Users/omm/PROJECTS/MyJKKN/app/api/academic/session-feedback/marks-coverage/route.ts (marks_coverage logic, for the 8th signal route)

KEY DECISIONS MADE (with rationale):
- Phase 2 = "DO BOTH" (fix scoring AND show both numbers) over score-only or show-only: director wants fairness AND transparency, and explicitly accepted the resulting ranking shift.
- Deep-links = "ALL zeros link somewhere" over "only self-actionable zeros": director wants every empty signal to be a nudge.
- Provider pattern, not a physical merge (each feature registers signals into the spine — avoids a god-object).
- Case-by-case ranking: the self-view engine NEVER ranks (preserves the codified SCF "presence, not scores, no ranks" doctrine + the bottom-quartile fix already shipped); comparison is allowed only inside later gated leadership views. Director initially said "compare everywhere" and was moved off it because it reversed the doctrine.
- `fn_scf_my_pulse` retirement is a separate strangler step, not part of this push.

APPROACH / QUALITY BAR: This is correctness-critical (scores + rankings). Validate every migration on a prod rolled-back txn first; after applying Phase 2, re-run `fn_precompute_percentile_cache` and diff the distribution to prove no mass collapse. After deploy, preview live as Dr. Venkateswaramurthy (faculty persona, previously 53/0 delegation case) via /users/permissions-audit?tab=resolver → search → "See as this user" (Read-only) and confirm: (a) his marking is no longer an unfair 0%, (b) the tile shows both assigned+personal numbers, (c) every zero signal renders as a working "start here" link.
DO NOT: reuse the dash-cards-fix worktree; drop `fn_scf_my_pulse` in-PR; skip the `COALESCE(period_id,id)` on any timetable slot lookup; push local `feat/campus-living-fee-compute-engine` to main; trust a local tsc pass as the gate.
VERIFY BY: CI PR-scoped typecheck + JKKN-terminology check green; rolled-back-txn SQL proof pasted; percentile distribution before/after pasted; live browser preview as Dr.V screenshotted (visual-artifact eyeball, not just HTTP 200).
