## RCLTP — Continuation Brief (2026-07-22)

RCLTP's **provisional reading-comprehension scoring engine** and a **live, populated principal dashboard** shipped this session (Phases 1–3 of the approved plan; PRs **#2252** + **#2253** merged & deployed to jkkn.ai). A clearly-labelled **`[TEST]` class of 16 synthetic learners** (grade 3/4 × section A/B, 48 scored sittings across cycles 1–3) is live at **Nattraja Vidhyalya CBSE** (`institution_id 29c221d1-b918-4c46-9d67-857273b0b553`) and is **KEPT seeded** (director: "keep it for now" — do NOT tear it down). Every scored surface carries a persistent **"Provisional — pending EKSAQ validation"** banner. Nattraja RCLTP is **ENGLISH-ONLY** (no Tamil pipeline).

## Verify Current State (run FIRST — all read-only)

```bash
# 1) Both PRs merged?
gh pr view 2253 --repo Jicate-Solutions/MyJKKN --json state,title,mergedAt
gh pr view 2252 --repo Jicate-Solutions/MyJKKN --json state,title,mergedAt

# 2) Set up Supabase Management API (token + project ref)
TOKEN="$(tr -d '\n' < ~/.supabase/access-token)"; REF="kvizhngldtiuufknvehv"
q(){ curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\":\"$1\"}"; }

# 3) Dashboard RPC exists in prod?  (expect one row: fn_rcltp_school_dashboard)
q "SELECT proname FROM pg_proc WHERE proname = 'fn_rcltp_school_dashboard';"

# 4) [TEST] class still seeded?  (expect 16)
q "SELECT count(*) FROM learners_profiles WHERE institution_id='29c221d1-b918-4c46-9d67-857273b0b553' AND first_name LIKE '[TEST]%';"

# 5) Scored results present?  (expect 48)
q "SELECT count(*) FROM rcltp_assessment_results r JOIN rcltp_assessments a ON r.assessment_id=a.id JOIN learners_profiles l ON a.learner_id=l.id WHERE l.first_name LIKE '[TEST]%' AND l.institution_id='29c221d1-b918-4c46-9d67-857273b0b553';"
```
If PRs show `MERGED`, the RPC exists, learners=16, and results=48 → reality matches the brief; proceed. If any drift, reconcile before building.

## Next Tasks (ALL FOUR are P0 — director said "all the above 4 of them"; drops = none)

**Task 1 — Populated learner view [P0, medium].** The `/rcltp/student` portal renders correctly-empty because no `[TEST]` learner has an auth login. Give ONE `[TEST]` learner a login and render their scored report:
- Pick a learner with a good arc, e.g. **`c0ffee00-0000-4000-8000-000000000001`** (`[TEST] Asha Kumar`, rises to super_proficient) — full list of the 16 `c0ffee00-…-000000000001..16` ids is in `rcltp-test-seed.sql`.
- Create `auth.users` via admin `createUser` (persona-harness pattern), then insert a `profiles` row: `id = <new auth uid>`, `role = 'student'`, `institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'`, `learner_id = 'c0ffee00-...-000000000001'`. Watch the `profiles.learner_id → learners_profiles` trigger chain.
- Render `/rcltp/student` as that user (admin-mint harness) → confirm their band/score/report shows with the provisional banner. Screenshot-verify (rule #25).

**Task 2 — Phase 4 voice-AI [P0, large — BLOCKED].** Read-aloud auto-scoring for Part A. **Requires an Azure Speech (Pronunciation Assessment) or Speechace API key — NONE in env, bills per recording, cannot self-provision. ASK the director for the key BEFORE starting any build.** When unblocked: build provider-swappable `lib/services/rcltp/voice-scoring/*`, wire the existing 501-stub `app/api/rcltp/recordings/[id]/score/route.ts`, hold low-confidence recordings for teacher review, feed `reading_score` into the engine. Until then reading score stays teacher hand-entry (Phase 1 fallback) and Tasks 1/3/4 are unaffected.

**Task 3 — Polish + harden [P0, small-med].** (a) Fix the **section-comparison bar-chart clip** — the 4th bar (Grade 4-B) clips under the angled x-axis labels in `principal-dashboard.tsx`; **render-only, data is complete** (raise chart bottom margin / rotate labels). (b) Add an **RPC permission-gate impersonation test** proving `fn_rcltp_school_dashboard` denies a learner/non-authorized role and allows `report.view_all`/`config.manage` (BEGIN…ROLLBACK impersonation on prod). (c) General tidy.

**Task 4 — CBSE/AI strategy one-pager [P0, medium].** Write-up (strategy threads were verbal-only this session, NOT yet written): **CBSE SAFAL personalised-CBT readiness** (RCLTP as the wedge — English-medium reading assessment feeding SAFAL/PISA readiness) + **AI-Max faculty-offload model** (30 live `ai_job_types`, 2879 jobs done; which faculty load → which AI job, live vs new, the approval flow; teacher becomes editor-of-AI). Follow rule #19 voice (no marketing words); flag any stat you're not certain of (rule #21).

## Key Decisions & Gotchas

- **Work in a `jicate/main` worktree — NOT the omm-dev root.** This checkout (`feat/campus-living-fee-compute-engine`) has **UNRELATED uncommitted changes** (hr/attendance, nav-config, activity-service, features.json) that are NOT from RCLTP — **do NOT commit them.** Ship via `/ship-myjkkn` worktree PRs.
- **To run the RCLTP engine over assessments, use a FACULTY minted session** (`anithaarulmary@jkkn.ac.in` — holds `rcltp.review`), **NOT Omm/superadmin** (Omm's minted session 401s "User profile not found" from `withAuth`).
- **Deployed engine route:** `POST /api/rcltp/assessments/[id]/score` (gate `rcltp.review`). Run helper: `rcltp-run-engine.mjs` (in the rcltp-test-class dir).
- **Dashboard RPC render needs ~15s to populate** (usePermissions → institution_id → RPC chain) — a short screenshot capture catches skeletons, not data. Wait before capturing.
- **Every provisional band/score MUST show the "Provisional — pending EKSAQ validation" banner** (hard contract from the spec; rules #21/#25). Band cutoffs live in CRUDable per-tenant `rcltp_band_config` (`is_system=true`) so EKSAQ can overwrite later with no rebuild.
- **Audit a role permission by VALUE** (`permissions->>'key' = 'true'`), not key existence (`?` operator) — faculty had `config.manage` present but value=`false`.
- **Nattraja RCLTP is ENGLISH-ONLY** — skip `work_pulse.translate` and the Tamil native-review guardrail for this school's outputs.
- **[TEST] teardown (do NOT run unless director asks):** `rcltp-test-teardown.sql`, scoped by `first_name LIKE '[TEST]%'` + institution `29c221d1…` (safe — does not touch the pre-existing `[TEST] The Little Garden` passage).

## Files / paths to read first

1. `/Users/omm/PROJECTS/MyJKKN/progress.txt` — **TOP block** "## Session: 2026-07-22 (END /cnext) [RCLTP]" (this session; source of truth).
2. `~/.claude/plans/soft-tickling-origami.md` — approved RCLTP build plan (Phases 1–4, guardrails, verification).
3. `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/rcltp-test-class/` — `rcltp-test-seed.sql` (the 16 `c0ffee00` learner ids + sections), `rcltp-run-engine.mjs` + `rcltp-run-engine.md` (how to run the engine as faculty), `rcltp-test-teardown.sql`.
4. `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_nattraja_vidhyalaya_rcltp_english_only.md` — English-only scoping + Phase 1–3 shipped status.
5. Code: `lib/services/rcltp/scoring-engine.ts`, `app/api/rcltp/assessments/[id]/score/route.ts`, `app/(routes)/rcltp/principal/_components/principal-dashboard.tsx`.
