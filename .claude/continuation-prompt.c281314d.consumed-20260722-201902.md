# CONTINUATION BRIEF — PDE Section-Picker + Overdue-Block

## TASK
Build the "section-picker + overdue-block" follow-up to the already-live PDE assign-to-section feature (three locked decisions, verbatim from a 2026-07-22 user interview). (1) **Section picker scope:** the assign page (`/pde/faculty/cases/[id]/assign`, API `app/api/pde/cases/[id]/assign/route.ts` GET) must show ONLY sections that have ≥1 learner enrolled in THIS case's course — NOT all institution sections (current bug). Join: `pde_assessments.course_id` → `vac_enrollments` → `profiles` → `learners_profiles.section_id`. (2) **Section label:** render "Programme · Semester · Section" (e.g. "B.E. Electrical and Electronics Engineering · Semester VI · Section A") by joining `sections.program_id` → `programs.program_name` and `sections.semester_id` → `semesters.semester_name`. Reason: bare "Section A" is dozens of different sections. NOTE: `vac_courses` column is `programme_id` (British spelling) + `name`. (3) **Overdue = hard-block LOCKED (class_only) cases only.** When a class_only case's assignment `due_at` has passed, block NEW attempts for assigned learners. Open cases with a due date get an "Overdue" badge only, no block. Mid-attempt (started, not submitted) learners finish; completed stays reviewable; explicit "Overdue — closed" message (rule #27), not a bare 404. Enforce in the attempt-entry page `app/(routes)/pde/learn/cases/[caseSlug]/page.tsx`. This is ACCESS-LOGIC → validate in a rolled-back impersonation txn before applying.

## PROJECT
`/Users/omm/PROJECTS/MyJKKN`

## DATABASE
MyJKKN Supabase, ref `kvizhngldtiuufknvehv`. Creds in `.env.production.local` (values carry a literal `\n` suffix — strip it, or curl gets HTTP 000). Management API token at `~/.supabase/access-token` — you CAN apply prod migrations, but **SHOW SQL FIRST** and validate in `BEGIN…ROLLBACK`. The Mgmt API `database/query` endpoint honors an explicit `BEGIN…ROLLBACK` (nothing persists). Impersonation test pattern:
```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"<uid>","role":"authenticated"}';
<query>;
ROLLBACK;
```

## SPEC
`specs/pde-case-assignment-design-2026-07-22.md` — read the bottom section **"## Follow-up decisions (interview 2026-07-22) — section picker + overdue block"**. That is the P0 build spec. The upper half documents the already-shipped assign feature (background/context). Terminology chain: **Programme** (degree, e.g. BDS) → **Course** (subject the case attaches to) → **Semester** → **Section** (class group A/B/C).

## VERIFY CURRENT STATE (read-only reality checks — run BEFORE building; if reality differs, STOP and report)
1. **Assign feature is live.** Confirm all three exist in prod: column `pde_assessments.visibility_mode` (default `'open'`, CHECK `'open'|'class_only'`); table `pde_case_assignments`; SECDEF fn `fn_pde_case_visible_to_learner` (it powers BOTH `pde_assess_read` and the answer-key RPCs).
2. **Answer-key leak stays closed.** Impersonate an enrolled learner and assert they read 0 answer-key rows for the published case:
   ```sql
   BEGIN;
   SET LOCAL ROLE authenticated;
   SET LOCAL request.jwt.claims TO '{"sub":"d0e59d85-24b5-4f26-90e5-bb0d21048ed9","role":"authenticated"}';
   SELECT count(*) FROM pde_assessment_questions
     WHERE assessment_id = 'eeba3849-a044-4e70-a752-aad19972439b';  -- expect 0
   ROLLBACK;
   ```
   (Enrolled learner reads via the SECDEF RPCs; base-table read is revoked.)
3. **Prod healthy.** `curl` `https://www.jkkn.ai/` returns 200.

**Known-good anchors (from the just-shipped feature):** pilot course `128a9d24-1091-4bc8-ab24-0c77380fcb74`; published case `eeba3849-a044-4e70-a752-aad19972439b`; test learners `d0e59d85` (section `4b487b63`) and `f18249b4` (section `40a47dbe`, different section); case creator `b2bcb548`.

## WHAT NEEDS TO HAPPEN
1. **[P0] Decision 1 — scope the section picker.** In the assign API GET (`app/api/pde/cases/[id]/assign/route.ts`), replace "all institution sections" with only sections having ≥1 learner enrolled in this case's course: `pde_assessments.course_id` → `vac_enrollments` → `profiles` → `learners_profiles.section_id`. Verify with a rolled-back query that the returned section set == distinct enrolled-learner sections for the pilot course.
2. **[P0] Decision 2 — disambiguated labels.** Render each section as "Programme · Semester · Section" by joining `sections.program_id` → `programs.program_name` and `sections.semester_id` → `semesters.semester_name`. Watch the British spelling: `vac_courses.programme_id` / `vac_courses.name`; `programs`/`semesters` carry the readable names. The picker's search box should filter on the full label.
3. **[P0] Decision 3 — overdue hard-block, class_only only.** In the attempt-entry page `app/(routes)/pde/learn/cases/[caseSlug]/page.tsx`: when a `class_only` case's assignment `due_at` for the learner's section has passed, block a NEW attempt with an explicit "Overdue — closed" message (rule #27, not a 404/redirect). Open cases with a due date → "Overdue" badge only, no block. Mid-attempt learners finish; completed learners keep review access. If enforcement needs a DB predicate, extend it in a migration (validate rolled-back + impersonation first). Prove three cases in a rolled-back impersonation txn: assigned+overdue+locked learner blocked; open+overdue learner not blocked; mid-attempt learner can finish.
4. **[P1] Lab-image ingestion (`kind:lab_report`)** — unblocked for 2024-25 images but STRATEGICALLY DEFERRED: drive adoption of existing cases before adding 14k more supply. Director ACL decision on the locked 2026 folder is still pending — do not proceed without it.
5. **[P2] "Mrs. Lalitha" case (`0de5e907`)** — user chose "leave for faculty." No action unless explicitly asked.

## CONSTRAINTS & RULES
- **JKKN terminology is a ZERO-TOLERANCE CI gate** (user-facing copy AND commit bodies AND SQL comments): "class/classes" → "section(s)", "teacher" → "Senior Learner", "student" → "learner", "staff" → "team members". Pre-swap before committing — the gate has caught prose 3× in prior sessions.
- **Ship code via worktree PRs off `jicate/main` ONLY.** NEVER push `omm-dev`/main-repo. A worktree at `.claude/worktrees/pde-answerkey` exists and can be reused (or make a fresh one: `git fetch jicate main && git checkout -B <branch> jicate/main`).
- **secdef-anon CI gate flags CREATE OR REPLACE of existing SECDEF fns as new.** If any new migration re-creates `fn_pde_case_visible_to_learner`, `fn_pde_get_case_questions`, `fn_pde_mark_objective`, etc., re-assert `REVOKE EXECUTE ON FUNCTION ...(argtypes) FROM anon, PUBLIC; GRANT EXECUTE ... TO authenticated;` at the end of that same migration. Run locally before pushing: `node scripts/ci/check-secdef-anon-revoke.mjs --base jicate/main` (prints "N new secdef function(s) checked, N locked.").
- **Do NOT `git reset --soft` to collapse wip commits then force-push** — `guard-git-push.sh` blocks force-push on the prod repo. Add a NEW commit on top instead (fast-forward).
- **Full-project `tsc` OOMs locally** — rely on PR-scoped CI TypeCheck. Note: CI SKIPS TypeCheck/terminology/reachability on DRAFT PRs — open the PR ready-for-review, or self-gate locally.
- **Validate every migration rolled-back + impersonation before applying.** Access-logic (Decision 3) especially — prove the boundary by impersonating, don't reason about it.

## KEY DECISIONS (with rationale)
- **Picker scope = enrolled sections only** (Decision 1): assigning to a section with zero enrolled learners is meaningless; current "all institution sections" is the bug.
- **Label = Programme · Semester · Section** (Decision 2): verified on prod that the same "A" resolves to "B.E. Electrical… · Semester VI · A" vs "M.Sc. Chemistry · Semester III · A" — bare name is unusable.
- **Overdue block = class_only only** (Decision 3): an assigned learner must never be MORE restricted than a random browser hitting the same open case; only a locked (class_only) case earns a hard stop.
- **probe_verdict: healthy** — priorities captured verbatim via a user interview immediately before this brief was written; no context drift.

## DO NOT
- Commit the other session's uncommitted main-repo work: hr/attendance, hod-hero-strip, activity-service, biometric spec, `features.json`. (The `omm-dev` checkout is on branch `feat/campus-living-fee-compute-engine` with a dirty tree that is NOT this task's work.)
- Count `pde_demonstrations` (222 rows) as participation — they are backfill, not real learner usage.
- Weaken the answer-key lock (`pde_questions_read` base-table revoke + the 3 SECDEF RPCs) or the assign visibility gate (`fn_pde_case_visible_to_learner`).

## VERIFY BY (post-execution)
- **Rolled-back impersonation on prod** proving: (a) the assign-API section set == only course-enrolled sections, each carrying a readable "Programme · Semester · Section" label; (b) the overdue block fires on class_only cases only — assigned+overdue learner blocked from a new attempt, open+overdue learner NOT blocked, mid-attempt learner finishes, completed learner still reviews.
- **Browser-test the assign page on prod** (`www.jkkn.ai/pde/faculty/cases/<id>/assign`) showing disambiguated section labels in the picker.
- Ship via worktree PR off `jicate/main`, pass the terminology + secdef-anon gates, deploy, re-verify live.

Reply 'go' to execute, or redirect to a different task.
