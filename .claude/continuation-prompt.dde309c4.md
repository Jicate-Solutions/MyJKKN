# CONTINUATION BRIEF — AI Pulse leaderboard build + close-out

**TASK (single start-here + ranked):** The Director ranked next session's work (verbatim): **(1) Verify the quiz-response + publication data substrate → (2) BUILD the AI Pulse leaderboard + gamification to a Draft PR [AUTO-BUILD TARGET] → (3) Post-session quiz ③ from the recording → (4) Merge PR #2316 + deploy — LAST.** Drops: none, carry everything. Must-read first, in order: `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_aipulse_leaderboard_gamification.md` (the 20-decision LOCKED spec — primary build source) + `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_aipulse_prompt_engineering_learning_loop.md` (parent loop) + `app/(routes)/ai-pulse/lab/[cycle]/_components/dept-ranking-panel.tsx` (existing dept-ranking panel to build on).

**PROJECT:** MyJKKN, `/Users/omm/PROJECTS/MyJKKN`, jkkn.ai, multi-tenant. This `omm-dev` checkout is SHARED and 720+ commits diverged from `jicate/main` — never `git add -A`, never push `omm-dev` to `main`. Ship via the **Translator Pattern**: worktree off `jicate/main` → copy files → Draft PR. Prod Supabase ref `kvizhngldtiuufknvehv`. Mgmt token at `~/.supabase/access-token` (send a NON-default User-Agent header or the API 403s). Every new SECURITY DEFINER RPC MUST `REVOKE EXECUTE ... FROM anon, PUBLIC` + `GRANT EXECUTE ... TO authenticated` (Supabase default-grants `anon` on every new function).

## WHAT HAPPENED LAST SESSION (all verified)
- **AI Pulse STARTER BATCH went LIVE.** Fired domain-starter jobs for 39 higher-ed programmes (1,413 active learners, 6 institutions) via `fn_ai_enqueue_system` (job_type `ai_pulse.domain_starter`, lane=max, payload `{prompt,_ctx}`, dedupe `aipulse_ds|<cycle>|programme|<topic_id>`). Cycle **`d9e6b0d4-4b99-4270-8c40-4be80c214327`**. All 39 generated + **COLLECTED via collect-only** (NOT the cron — the cron would re-enqueue the 13 originals) → `ai_pulse_domain_starters` now **52** (13 orig + 39). Verified end-to-end by impersonating a real BDS learner (auth `65f3ae8f`). **K-12 school grades (LKG/UKG/PREKG/GRADE 1-9/Standard 1-12 — 24 programmes / 778 learners) DELIBERATELY EXCLUDED as age-inappropriate. Do NOT reopen or fire for them.**
- **PR #2316 (Jicate-Solutions/MyJKKN) — Ready, on CI, all bespoke gates green.** Branch `aipulse-tamil-champion-fixes`, worktree `/Users/omm/PROJECTS/MyJKKN/.claude/worktrees/aipulse-fixes`. Three changes: (a) removed the domain-starter Tamil review gate (migration `20260723210000` ALREADY APPLIED to prod — `fn_ai_pulse_my_domain_starters` no longer checks `ta_review_status`; `tamil_available` = pack contains `'ta'`); (b) super_admin bypass on live-session poll control; (c) prompt-builder submit toasts. Also removed the champion Tamil-approval admin UI (`starter-tamil-review`). **2 orphaned RPCs left for post-deploy cleanup:** `fn_ai_pulse_domain_starter_ta_review`, `fn_ai_pulse_domain_starters_pending_tamil`.
- **Diagnosed 6 Director-reported items to root cause:** **B1** prompt-builder "submit does nothing" = `fn_ai_pulse_submit_prompt_build` raises `not_a_learner` for non-learners (Director is super_admin, `learner_id=null`) + card `onError` only logged → fixed via toasts in #2316. **B2** prompts land in `ai_pulse_prompt_builds`, AI-graded on the ₹0 Max lane. **B5** quiz leaderboard NEVER BUILT. **B6** LIVE POLLS FAILED (513 attended, 0 polls) — root cause: `usePermissions()` empties `userRoles` for super_admins so the `ai_pulse_champion` gate was false for every super_admin → fixed via `isSuperAdmin` bypass in #2316. **④** "400 prompts" reconciled to ~378 potential (63 programmes × 6). Also granted Director the `ai_pulse_champion` role (belt-and-suspenders; the real fix is the #2316 code).
- **Leaderboard + gamification FULLY DESIGNED** via a 20-question / 5-round plain-English interview. All decisions LOCKED in `project_aipulse_leaderboard_gamification.md`.

## VERIFY CURRENT STATE (read-only — run BEFORE acting)
```bash
# 1. Is #2316 merged yet / CI green?
gh pr view 2316 --repo Jicate-Solutions/MyJKKN --json state,mergeStateStatus,statusCheckRollup

# 2. Starters still 52 for the cycle + switches still on (Mgmt API, non-default UA)
#    SELECT count(*) FROM ai_pulse_domain_starters WHERE cycle_id='d9e6b0d4-4b99-4270-8c40-4be80c214327';
#    SELECT config_key, value_jsonb FROM ai_pulse_policies
#      WHERE config_key IN ('domain_starter_enabled','prompt_build_enabled','domain_starter_autorevert_enabled') AND is_active;

# 3. Leaderboard-build substrate introspection (Mgmt API):
#    Quiz table?     SELECT table_name FROM information_schema.tables
#                      WHERE table_schema='public' AND table_name ILIKE '%quiz%';
#    Publication?    SELECT table_name FROM information_schema.tables
#                      WHERE table_schema='public' AND (table_name ILIKE '%publication%' OR table_name ILIKE '%publish%');
#    Build cols:     SELECT column_name FROM information_schema.columns
#                      WHERE table_name='ai_pulse_prompt_builds';   -- expect learner_id, grade(jsonb), institution_id
#    Learner dims:   confirm learners_profiles.department_id, institution_id, lifecycle_status='active'

# 4. Confirm active population (~4,180):
#    SELECT count(*) FROM learners_profiles WHERE lifecycle_status='active';
```
If a **quiz-response** table or a **publication** table does NOT exist, STOP and surface that to the Director before building those axes — do NOT invent tables.

## THE LEADERBOARD BUILD (rank 2 — AUTO-BUILD TARGET) — 20 LOCKED DECISIONS
**One point pool: participation + quality, EQUAL weight.** Earn for doing, bonus for doing well.
- **Publishing (IG / GitHub / LinkedIn) = worth the MOST** — requires LIGHT PROOF (student pastes a post link/screenshot on the publish claim; champions glance at flagged ones — NOT pure honor system).
- **Build-a-prompt only counts if it passes the 4-part quality check** (role / context / task / format the grader already runs) + a grade bonus.
- **Quiz = FIRST attempt only** (stops answer-hunting); scored **RELATIVE to that week's quiz-takers** (percentile) so a hard week doesn't punish points.
- **Starter-use = small points** (`ai_pulse_domain_starters.copies`).
- **Reported + champion-confirmed-bad prompt LOSES its points** (report path = the loop's quality signal, feeds anti-farming).
- **Three boards:** (a) **individual** — weekly **and** all-time, **FULLY PUBLIC**, ties broken by higher QUALITY score; (b) **dept within-college**; (c) **dept all-JKKN**. Both dept boards ranked by **average points per ACTIVE student** (non-participation drags a dept down → drives broad adoption).
- **Streak** = any ONE activity that week (build OR quiz OR starter-use) keeps it alive; consecutive weeks.
- **Badges (all 4):** First Prompt · Gold Prompt · **Quiz Ace = top 10% of the week's quiz-takers** · Loyal Streak.
- **Staff / faculty / champions = SEPARATE staff board** (not on the students-only main board).
- **New/mid-year joiners:** the weekly board is their fair shot; all-time deliberately rewards long-timers. NO separate newcomer board, NO per-joiner clock.

**Craft (Claude decides at build):** point values (draft: publish **30**, build **10 + grade bonus**, quiz **10 + relative bonus**, starter **5**); min dept size **≥3 ACTIVE** to appear (privacy floor); no-department learners → individual board only; publish-proof UI = link/screenshot field on the publication claim. **New leaderboard RPCs are SECURITY DEFINER → MUST REVOKE anon, PUBLIC + GRANT authenticated.** Build on the existing `dept-ranking-panel.tsx` in the Lab console; deliver RPCs + views + a leaderboard page + badges.

## KEY DECISIONS (rationale — do NOT relitigate)
- **K-12 excluded** — age-appropriate; leave the 24 school programmes / 778 learners out permanently.
- **Leaderboard trusts the loop to self-correct** (report → confirm-bad → lose points) — that's WHY there are no manual approval gates.
- **Merge #2316 + deploy ranked LAST by the Director** — multi-tenant institutional risk; human-gated.
- **Super_admin poll bug is why polls never fired** (513 attended, 0 polls) — `usePermissions()` empties `userRoles` for super_admins; fixed by the `isSuperAdmin` bypass in #2316. See `feedback_usepermissions_empties_userroles_for_superadmins.md`.
- **Tamil gate removed permanently** (Director decision — the loop self-corrects Tamil quality; migration already live).
- **probe_verdict: healthy** — context held a very long multi-thread session accurately.

## EXECUTION DIRECTIVE (autobuild ARMED)
On `go`: **FIRST run VERIFY CURRENT STATE.** Then proceed autonomously through the ranked priorities, with the **LEADERBOARD BUILD (rank 2) as the primary autonomous build** — its first step IS rank 1 (verify the quiz/publish data substrate). Then build the leaderboard (RPCs + views + leaderboard page + badges) per the 20-decision spec to a **DRAFT PR via the Translator Pattern** (worktree off `jicate/main`). **STOP at the Draft PR — do NOT merge, do NOT deploy** (multi-tenant institutional risk). **Rank 4 (merge #2316 + deploy) is HUMAN-gated — surface it for the Director, do not do it autonomously.** Post-session quiz ③ (rank 3) only if a recording exists. If the quiz-response / publication tables do NOT exist, surface that to the Director before building those axes rather than inventing tables.
