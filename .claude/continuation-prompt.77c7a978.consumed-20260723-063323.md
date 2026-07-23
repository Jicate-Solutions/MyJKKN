# RCLTP Remedial-Plan Loop — Continuation Brief (2026-07-23)

TASK: Continue building the **RCLTP remedial-plan draft loop** — the "give Senior Learners their learning-studio time back" build. An at-risk reader flagged by RCLTP (low_band | regression) gets an AI-drafted remedial reading plan that a **Senior Learner reviews, edits, and approves** (instead of hand-writing it — out-of-studio work converted to a review). Slice 1 (DB foundation) is DONE and live on prod. This session finishes the loop: **Slice 2 (AI generation handler) → Slice 3 (Senior-Learner review/approve UI) → Slice 4 (end-to-end proof on a `[TEST]` at-risk learner) → Slice 5 (open a Draft PR)**. User picked this over "adoption first" and "different offload" in the /cnext interview.

PROJECT: /Users/omm/PROJECTS/MyJKKN
WORKTREE (build here, NOT omm-dev root): /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/rcltp-remedial (branch `feat/rcltp-remedial-plan-loop`, off jicate/main)
DATABASE: Supabase prod ref `kvizhngldtiuufknvehv`; Management API token `~/.supabase/access-token` (USE A NON-DEFAULT User-Agent — Cloudflare 403s python-urllib); service key in /Users/omm/PROJECTS/MyJKKN/.env.production.local
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (TOP block = this session)

CURRENT STATE (as of brief-write time):
- **Slice 1 LIVE on prod** (migration `supabase/migrations/20260723060000_rcltp_remedial_plan_draft_loop.sql`, applied): table `rcltp_remedial_plans` (ai_draft + edited_content edit-capture + status queued/draft/approved/archived, RLS on, NO direct authenticated write policy); RPC `fn_rcltp_remedial_plan_ai_draft_upsert` (service_role-only); RPC `fn_rcltp_remedial_plan_approve(plan_id, edited_content)` (authenticated + `rcltp.review`; the ONLY path to status='approved'); `ai_job_types` row `rcltp.remedial_plan_draft` (lane='max' = ₹0 drain, enabled).
- Branch `feat/rcltp-remedial-plan-loop` commit `f0a8ed951` (Slice 1) — **NOT pushed, NOT PR'd yet**.
- EKSAQ→MyJKKN rename: PR #2283 MERGED + DEPLOYED (job xg6MWTxOUlO2pe1RBUJk). Validator is now "MyJKKN" everywhere.
- **0 REAL learners scored** — all 48 scored sittings are the 16 synthetic `[TEST]` learners at Nattraja (`institution_id 29c221d1-b918-4c46-9d67-857273b0b553`). Build + prove on the test cohort.

VERIFY CURRENT STATE (run BEFORE any work — all read-only):
```bash
TOKEN="$(tr -d '\n' < ~/.supabase/access-token)"; REF="kvizhngldtiuufknvehv"
q(){ curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "User-Agent: MyJKKN/1.0" -d "{\"query\":\"$1\"}"; }
# Slice 1 objects present? (expect tbl=1, both fns=1, jobtype=1)
q "SELECT (SELECT count(*) FROM information_schema.tables WHERE table_name='rcltp_remedial_plans') tbl, (SELECT count(*) FROM pg_proc WHERE proname='fn_rcltp_remedial_plan_ai_draft_upsert') g, (SELECT count(*) FROM pg_proc WHERE proname='fn_rcltp_remedial_plan_approve') a, (SELECT count(*) FROM ai_job_types WHERE job_type='rcltp.remedial_plan_draft') jt;"
cd /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/rcltp-remedial && git log --oneline -1   # expect f0a8ed951 Slice 1
gh pr view 2283 --repo Jicate-Solutions/MyJKKN --json state --jq .state              # expect MERGED
```
**If Slice 1 objects are missing or the branch/commit differs → STOP, report, do NOT execute the stale plan.**

WHAT NEEDS TO HAPPEN (in order — this is one sequential pipeline):
1. **Slice 2 — generation handler.** Create `app/api/cron/rcltp-remedial-plan-generate/route.ts` mirroring `app/api/cron/curriculum-lesson-spine-generate/route.ts` (async Message-Batch submit/collect via `lib/services/platform/ai-clients/batch.ts` + `ai-jobs-lane.ts`, 50%-discount max lane). Ground the Claude prompt in the at-risk learner's real RCLTP data (latest band + overall_score from `rcltp_assessment_results`, weak areas from `rcltp_part_b_responses`, trigger low_band|regression). On collect, parse the plan and write it via `fn_rcltp_remedial_plan_ai_draft_upsert` (status='draft'). Auth: `CRON_SECRET` bearer. English-only (Nattraja is CBSE English-medium). Enqueue path: a Senior Learner action (Slice 3 button) inserts the ai_jobs row.
2. **Slice 3 — review/approve UI.** In the RCLTP teacher console (`app/(routes)/rcltp/teacher/...`), list at-risk learners (reuse the principal dashboard's atRisk source), a "Draft remedial plan" trigger, and a review panel that shows `ai_draft`, lets the Senior Learner EDIT it, and calls `fn_rcltp_remedial_plan_approve(plan_id, edited_content)`. Capturing `edited_content` distinct from `ai_draft` is the moat-loop edit-signal — do not skip it.
3. **Slice 4 — E2E proof** on a `[TEST]` at-risk learner (low_band: Chitra/Gowri/Lakshmi/Priya; regression: Deepa/Karthik/Omar): enqueue → draft appears (may need the max-lane drain to run — monitor) → edit → approve → row status='approved' + edited_content set. Browser-verify via `scripts/persona-harness/admin-mint-snapshot.mjs` (mint the Nattraja Senior Learner / faculty `anithaarulmary@jkkn.ac.in` who holds `rcltp.review`; FULLPAGE=0 for a viewport screenshot). Screenshot-eyeball (rule #25).
4. **Slice 5 — push + Draft PR** `feat/rcltp-remedial-plan-loop` to `jicate` remote; `gh pr create --base main`. Include the migration. STOP at the Draft PR — director merges.
5. **[P1] Rename** residual `specs/eksaq-rcltp-phase4-ui-plan.md` → `specs/myjkkn-rcltp-phase4-ui-plan.md` (last EKSAQ trace) + sweep its content EKSAQ→MyJKKN.

CONSTRAINTS & RULES:
- **JKKN terminology (zero-tolerance, BLOCKING delta CI gate):** teacher/faculty → **Senior Learner**; student → **learner**; classroom → **learning studio**; class → **session**. Applies to all copy AND comments on touched lines. Brand: green #0b6d41 + gold #ffde59 + cream #fbfbee.
- **Every new SECDEF RPC**: `REVOKE EXECUTE ... FROM anon, PUBLIC` explicitly (Supabase default-grants anon). Cron-only writers → GRANT service_role, NOT authenticated.
- **Never auto-merge/deploy** — MyJKKN is multi-tenant institutional; PRs are human-merged.
- **Work from the jicate/main worktree**, never omm-dev root (720+ commits diverged, missing merged features). The omm-dev root ALSO has unrelated uncommitted changes (hr/attendance) — do NOT touch/commit them.
- Dry-run every prod migration (swap trailing COMMIT→ROLLBACK, expect HTTP 201) before real apply; show SQL first.
- Validator is **MyJKKN** (not EKSAQ). Scores stay **provisional, aggregate-only** (principal sees; learners/parents do NOT — director-confirmed).

KEY FILES TO READ FIRST:
- /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/rcltp-remedial/supabase/migrations/20260723060000_rcltp_remedial_plan_draft_loop.sql — Slice 1 (the RPC signatures you call)
- /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/rcltp-remedial/app/api/cron/curriculum-lesson-spine-generate/route.ts — the generation-handler TEMPLATE to mirror
- ~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_aimax_offload_job_build_pattern.md — the 5-piece build pattern + the non-default-UA + dry-run gotchas
- ~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_nattraja_vidhyalaya_rcltp_english_only.md — RCLTP state, English-only, aggregate-only, test cohort ids
- /private/tmp/claude-501/-Users-omm-PROJECTS-MyJKKN/c1edf26d-0a2a-4b3a-aff4-875399eb5f2e/scratchpad/apply_sql.py — UA-patched migration dry-run/apply helper

KEY DECISIONS MADE THIS SESSION (with rationale):
- Chose the **remedial-plan loop** over question-bank / report-narrative offloads because it closes the RCLTP loop (assessment → plan → approve → next-cycle band movement) and is measurable. (User re-confirmed in interview.)
- Chose to **mirror the curriculum lesson-spine pattern** rather than invent AI plumbing — its approval gate is a DB status transition only a permissioned human can trigger (structural, not a prompt), exactly what the moat-loop verdict demanded.
- Director decisions: student scores stay **aggregate-only** (never show a child a provisional band); **Phase 4 voice-AI HELD** (no Azure/Speechace key); validator renamed **EKSAQ → MyJKKN**.
- **Building on the synthetic test cohort** knowingly — loop-lens flagged 0 real learners as the real constraint, but the user chose to build the capability now (the loop needs real learners for its OUTCOME arm + a control arm to become a verified moat; that's a later, non-code adoption step).

APPROACH: Sequential slices, each with a green gate. Build in the rcltp-remedial worktree. Dry-run any further migration. Verify Slice 4 by admin-mint browser snapshot (viewport-only), not fullPage (fullPage re-animates Recharts and lies). Push + Draft PR at the end; do not merge.

QUALITY BAR: A Senior Learner (Nattraja faculty with `rcltp.review`) can, for a `[TEST]` at-risk learner, request a plan, see the AI draft, edit it, and approve it — leaving a `rcltp_remedial_plans` row with status='approved' and `edited_content` distinct from `ai_draft`. Proven by a real browser snapshot. PR open, CI green (TypeCheck + terminology + reachability), Draft.

DO NOT:
- Auto-merge or deploy anything (institutional risk).
- Touch the omm-dev root's unrelated uncommitted changes.
- Show learners/parents a provisional band/score (aggregate-only stays).
- Build the other 3 offload job types (question-bank / report-narrative / parent-message) — out of scope this session.

VERIFY BY (post-execution): the Slice-4 E2E (row status='approved' + edited_content set) + a viewport screenshot of the approve UI + `gh pr view` showing an open Draft PR with green blocking checks.

EXECUTION DIRECTIVE:
PRECONDITION — do NOT begin building until the VERIFY CURRENT STATE checks above pass. If reality has drifted (Slice 1 objects missing, branch changed, #2283 not merged), STOP, report exactly what drifted, and wait for the user. Do NOT build on a stale plan.

If the reality-check passes, run this autonomous loop:
  Using /effort ultracode /loop, build the next slice in each phase — in the RANKED ORDER above (Slice 2 → 3 → 4 → 5, then P1) — until all are complete. After each slice run tests, typecheck, and lint; feed every failure back as the next instruction and fix it. Stop when the build is green AND the checkers have nothing left to report.

HARD STOPS (never cross without the user):
  - Stop at a DRAFT PR. NEVER merge, NEVER deploy — MyJKKN is multi-tenant (institutional risk).
  - No phased plan file exists; walk the ranked Slices 2→5 strictly in order with a green gate between each. If a slice needs design choices beyond this brief, offer /writing-plans rather than free-building.
  - Obey every CLAUDE.md rule (browser-test before "done" via admin-mint viewport snapshot, JKKN terminology, RLS/anon locks, stay-in-scope). Green unit tests + tsc are necessary but NOT sufficient — browser-verify the approve UI.
