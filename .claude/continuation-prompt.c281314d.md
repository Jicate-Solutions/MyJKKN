TASK: Three P0s, all fully, in one session. (1) FINISH ANSWER-KEY HARDENING — the PDE clinical-case answer key lives in `metadata.ground_truth` on the `pde_assessment_questions` row, and RLS is row-level not column-level, so an ENROLLED learner who queries that table directly still reads their own case's answer key (the learner-page payload was stripped this session, but the table column was not). Fully closing it = move `ground_truth` into a staff-only companion table and move MCQ marking server-side (~12 files that read/write ground_truth or grade client-side on `options[].is_correct`). This is the last real security gap from the PMS→PDE bridge work. (2) UNLOCK LAB RADIOGRAPHS — the bigger/better teaching set (`labreportuploads`, ~27,700 lab reports + radiographs, ~3× the 10,921 clinical photos already flowing) is apache-locked under `upload/Lab/` on the PMS box and the app account cannot read it. A read-only investigate-only prompt is already drafted; this P0 is just handing it to the SERVER Claude session to run and return findings. (3) CLOSE THE ADOPTION / DISTRIBUTION GAP — PDE has ZERO real learner participation because published cases are reachable only by pasting a UUID; `/pde/learn/cases` has no list UI and there is no assign-to-cohort. CARRE audit = 35/100 "rebuild the experience layer." Build the learner case list + assign-to-cohort.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: MyJKKN Supabase ref kvizhngldtiuufknvehv; creds in /Users/omm/PROJECTS/MyJKKN/.env.production.local (read, never paste keys; values carry a literal \n suffix — strip it). Management API token at ~/.supabase/access-token — you CAN apply prod migrations yourself, but SHOW SQL FIRST and validate in a BEGIN…ROLLBACK txn before applying.
SPEC: /Users/omm/PROJECTS/MyJKKN/specs/pde-image-bridge-design-2026-07-21.md
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (TOP entry = full state of the 2026-07-21/22 session)

CURRENT STATE (as of brief-write time):
- Image bridge is COMPLETE + E2E on prod: real de-identified radiograph renders inside PUBLISHED case eeba3849-a044-4e70-a752-aad19972439b ("Classification of Pulpal Disease — Patient X, 58M"). Direct faculty upload with server-side JPEG sanitize also shipped.
- 6 security/schema migrations APPLIED to prod (image bucket, immutable image-review audit, cross-tenant RLS fix, assessment write+browse RLS, at-risk log, at-risk unmask-low-score). 0 permissive policies now on the 5 PDE tables that held learner work. 2 dead Senior-Learner routes (cohort + transcripts) repaired; CSV export ported.
- All 10 session PRs merged (#2223 #2227 #2230 #2232 #2233 #2234 #2235 #2236 #2238 #2239). Build green, jkkn.ai 200.
- Branch = `feat/campus-living-fee-compute-engine` at repo root (docs/state only). ALL code ships via worktree PRs off `jicate/main` — NEVER push omm-dev to main.
- ⚠️ THE REMAINING GAP = P0 #1: `metadata.ground_truth` still sits on `pde_assessment_questions`; a learner can read it via direct table query. That is what this session closes.
- ⚠️ omm-dev root is 720+ commits diverged and MISSING merged features: the PMS-import files (`ImportFromPmsTab`, `case-author-draft.ts`, `import-from-pms/route.ts`) are NOT in this checkout — they live on `jicate/main`. Do the P0 #1 refactor in a FRESH `jicate/main` worktree so you touch the true current code, not stale omm-dev copies.

VERIFY CURRENT STATE (run BEFORE any work — all read-only; if reality differs, STOP and report):
1. Published case healthy: `SR=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.production.local | sed 's/^[^=]*=//' | tr -d '"'\'' \r\n'); curl -s "https://kvizhngldtiuufknvehv.supabase.co/rest/v1/pde_assessments?id=eq.eeba3849-a044-4e70-a752-aad19972439b&select=id,status" -H "apikey: $SR" -H "Authorization: Bearer $SR"` → expect `status:"published"`.
2. Zero permissive policies remain (uses the ALL-cmds sweep, not SELECT-only): via Supabase MCP run `SELECT tablename,policyname,cmd,coalesce(qual,'-') using_expr,coalesce(with_check,'-') check_expr FROM pg_policies WHERE schemaname='public' AND tablename IN ('pde_submissions','pde_assessments','pde_assessment_questions','pde_engagement_events','pde_engagement_daily') ORDER BY tablename,cmd;` → NO row should have `qual='true'` on SELECT/ALL or `with_check='true'` on INSERT/UPDATE/ALL.
3. The 6 migrations are on main: `git fetch jicate main && git ls-tree jicate/main -r --name-only | grep -iE 'pde.*(image|rls|at_risk|assess)'`.
4. The gap P0 #1 closes is REAL: `SELECT column_name FROM information_schema.columns WHERE table_name='pde_assessment_questions';` — confirm `ground_truth` (or `metadata`) still lives on this learner-readable table.

WHAT NEEDS TO HAPPEN:
1. [P0 — the big careful refactor, do FIRST] Move `ground_truth` off `pde_assessment_questions` into a staff-only companion table + move MCQ marking server-side. ~12 files reference ground_truth or grade client-side (verified paths in this repo; PMS-import files are on jicate/main):
   - app/(routes)/pde/learn/cases/[caseSlug]/page.tsx (learner attempt entry — already strips ground_truth from payload this session)
   - app/(routes)/pde/learn/cases/[caseSlug]/_components/MCQWarmupQuestion.tsx (grades CLIENT-SIDE on `options[].is_correct` — must go server-side)
   - app/(routes)/pde/learn/cases/[caseSlug]/_components/CaseAttempt.tsx
   - app/(routes)/pde/learn/cases/[caseSlug]/summary/[attemptId]/page.tsx (reads ground_truth AFTER submit — the legit post-attempt review path)
   - app/(routes)/pde/faculty/cases/_components/CaseFormBuilder.tsx
   - app/(routes)/pde/faculty/cases/_components/QuestionEditor.tsx
   - app/(routes)/pde/faculty/cases/_components/JsonImportTab.tsx
   - app/(routes)/pde/faculty/cases/_components/ImportFromPmsTab.tsx (on jicate/main)
   - lib/services/pde/case-author-draft.ts (on jicate/main — the AI draft carries ground_truth)
   - lib/services/pde-osce-scoring.ts
   - lib/services/pde-coach-clinical-reasoning.ts
   - app/api/pde/clinical-reasoning/score/route.ts
   - types/pde.ts and types/pde-clinical-reasoning.ts
   Approach: new staff-only table (e.g. `pde_assessment_answer_keys`, FK question_id) with RLS = creator+admin only (NO learner read); a SECDEF marking RPC that reads the key server-side and returns only correct/incorrect + score (REVOKE EXECUTE FROM anon,PUBLIC; GRANT authenticated); strip `ground_truth`/`is_correct` from every learner-facing payload and grade via the RPC. Migrate existing keys, then DROP the column from the learner-readable table. Validate the migration + an impersonation test (set request.jwt.claims to a learner) in a rolled-back txn on prod BEFORE applying — assert learner reads 0 keys, creator still authors.
2. [P0 — fast, do EARLY so the server session runs in parallel] Hand the drafted prompt to the SERVER Claude session: /private/tmp/claude-501/-Users-omm-PROJECTS-MyJKKN/c3e8e5eb-1e30-4f04-b007-bfd68b6171f4/scratchpad/lab-images-unlock-prompt.md — it is READ-ONLY investigation (no chmod/chown/chgrp/setfacl, no DB writes, recommend-don't-apply). Copy its contents to the user to paste into the server session; it returns folder mode/owner, file count + size, image-vs-PDF mix, metadata tag names, burned-in-pixel risk fraction, and a recommended unlock method. Then relay findings back. NOTE: the scratchpad path may be gone after /clear — if so, the prompt's content is captured in progress.txt's continuation block and the design spec's deferred section; regenerate from the bridge memory if needed.
3. [P0 — new build] Learner case list + assign-to-cohort: build app/(routes)/pde/learn/cases/page.tsx as a real list UI, and add an assign-to-cohort mechanism (schema + faculty UI) — the learner attempt page today gates ONLY on `status='published'` + enrolment in the course, no cohort assignment. Do the assign-to-cohort scoping so it does not break the published+enrolled path. JKKN brand green #0b6d41.

CONSTRAINTS & RULES:
- JKKN terminology is a ZERO-TOLERANCE CI gate (caught 3× last session): "student"→"learner", "faculty"→"Senior Learners", "staff"→"team members" in ALL user-facing copy AND commit bodies AND SQL_FILE_INDEX comments.
- Ship code via worktree PRs off jicate/main; NEVER push omm-dev. Worktree Step 0 = `git fetch jicate main && git checkout -B <branch> jicate/main`; verify `pwd` is this repo before any Agent worktree spawn.
- Validate every migration in a BEGIN…ROLLBACK txn on prod first; impersonation-test write/read policies (`set request.jwt.claims`) and assert learner=0 rows / creator=1.
- RLS sweep must query ALL cmds, separating `qual` (read gate) from `with_check` (write gate) — a SELECT-only sweep misses FOR ALL policies (the ones with DELETE + real data).
- Every new SECDEF RPC MUST `REVOKE EXECUTE FROM anon, PUBLIC` then `GRANT TO authenticated` (Supabase's default grants anon EXECUTE otherwise).
- Browser-test on prod before "done" — green unit tests are NOT enough; the Chrome-canvas APP2 ICC bug last session was caught only by a real upload.
- Repo compiles with strictNullChecks:false — discriminated unions do NOT narrow at call sites; use flat interfaces.
- Full-project `tsc` OOMs (indistinguishable from clean pass by error count) — use exit code or scoped `tsc -p`.

KEY FILES TO READ FIRST:
- /Users/omm/PROJECTS/MyJKKN/progress.txt — full session state (top entry).
- /Users/omm/PROJECTS/MyJKKN/specs/pde-image-bridge-design-2026-07-21.md — bridge design; "Explicitly deferred" at the bottom names the lab-report follow-up.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_pms_casesheet_to_pde_case_bridge.md — bridge history; top entry has the current image state + the OPEN ground_truth gap.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_rls_sweep_must_include_for_all_policies.md — the all-cmds sweep + the "RLS is row-level not column-level" fact that motivates P0 #1.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_pde_module_zero_participation.md — the adoption gap (P0 #3), incl. the pde_demonstrations backfill trap.
- /private/tmp/claude-501/-Users-omm-PROJECTS-MyJKKN/c3e8e5eb-1e30-4f04-b007-bfd68b6171f4/scratchpad/lab-images-unlock-prompt.md — the ready-to-paste P0 #2 prompt.

KEY DECISIONS MADE THIS SESSION (with rationale):
- Sanitize-not-validate for uploaded JPEGs — Chrome's canvas adds an APP2 ICC profile a validate-only gate rejects; `stripJpegMetadata` keeps only structural segments.
- Reference-based orphan sweep (not delete-on-delete) — PDE cases archive, not hard-delete.
- EXISTS-join tenant scoping (not a new institution_id column) — the join path `pde_submissions.assessment_id → pde_assessments.course_id → vac_courses.institution_id` already exists.
- Creator+admin writes (not admin-only) — case authoring writes as the authenticated user; admin-only would have broken authoring.
- DEFERRED the answer-key column move — it is ~12 files and needs daylight; that deferral is now P0 #1.

APPROACH: Sequential. Start P0 #2 immediately (just hand over the prompt — costs you nothing, unblocks the parallel server session). Then P0 #1 as the big careful refactor with rolled-back validation + impersonation proof. Then P0 #3 as a fresh build. All code in jicate/main worktrees.

QUALITY BAR: (1) An enrolled learner cannot read the answer key even via a direct `pde_assessment_questions` (or successor-table) query — PROVEN by an impersonation query returning 0 keys while the creator still authors and MCQ marking still returns correct scores server-side. (2) Lab-unlock investigation findings returned from the server session. (3) A learner can browse and attempt cases from /pde/learn/cases (screenshot on prod).

DO NOT: weaken de-ID or the faculty burned-in-pixel confirm gate; push omm-dev to main; apply any migration without rolled-back validation; paste patient identifiers into chat; count pde_demonstrations (222 backfill rows, submitted_at/created_by/validator all NULL, 100% passed) as participation.

VERIFY BY (post-execution): impersonation SQL proving learner=0 answer keys + creator/marking intact; screenshot of /pde/learn/cases rendering a browsable list on prod; the server session's written lab-unlock recommendation relayed back to the user.
