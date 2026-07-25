# PDE Clinical-Case Assignment — Design (assign-to-section)

**Date:** 2026-07-22 · **Status:** Design locked via user interview; build not started
**Context:** PDE module has ~0 real learner participation. The answer-key leak is closed (PR #2244/#2247) and a learner case list is live (PR #2245, `/pde/learn/cases`). Discoverability is fixed; the next adoption lever is letting a Senior Learner *push* a case to their class instead of hoping learners browse. CARRE audit = 35/100 "rebuild the experience layer."

## Decisions (from the user interview, 2026-07-22)

1. **Direction:** build case-assignment (the adoption lever) — chosen over lab-image ingestion (more supply, no demand) and pause.
2. **Class unit = academic section** (`learners_profiles.section_id`). Verified populated: 543/544 enrolled learners in the pilot course have a section; 55 distinct sections (~10 learners each). Assign to one or more sections. Effective audience = learners whose section ∈ assigned sections **AND** who are enrolled in the case's course.
   - `vac_enrollments` has NO section column (course-level only); the platform `cohorts`/`cohort_memberships` tables are effectively empty (1/18) — do NOT use them. Section on the learner profile is the populated, teacher-intuitive unit.
3. **Visibility model = OPEN BY DEFAULT + PER-CASE LOCK.**
   - Every published case stays visible to all enrolled learners (preserves the current `pde_assess_read` behavior — do not break it).
   - A teacher can optionally set a case to **class-only**: then only assigned sections (∩ enrolled) may see/attempt it.
   - The current 4 AI-draft cases stay open by default; a teacher can flip any to class-only.
4. **Nudge = notify + highlight.** On assignment, learners get an in-app notification AND the case is pinned/highlighted at the top of `/pde/learn/cases`.
5. **Due dates = optional.** Teacher may set a deadline; learners see "due in N days" / "overdue". Skippable — no date = "please do this".

## Edge cases (decided)

- **Locked case + learner not in an assigned section:** not shown in the list; a direct URL hit returns an explicit "This case isn't assigned to you" page — NOT a silent redirect (CLAUDE.md rule #27).
- **Learner already has an attempt (in-progress or completed) on a case that is later locked:** they retain access to their own attempt + review. Existing work is never revoked.
- **Who can assign:** any Senior Learner with the clinical-cases faculty permission for the course (same set who can already read the cases) + admins. Only **published** cases are assignable.
- **Multiple sections per case:** yes.
- **"Mrs. Lalitha" case (0de5e907):** left for faculty — no action.

## Proposed implementation (for the build session)

### Schema (new migration; validate rolled-back + impersonation-test first)
- `pde_assessments.visibility_mode text default 'open'` — `'open' | 'class_only'` (CHECK). Default keeps current behavior.
- `pde_case_assignments` — `id`, `assessment_id` FK, `section_id`, `assigned_by` (=auth.uid()), `due_at timestamptz null`, `created_at`. Unique(assessment_id, section_id). RLS: creator/staff write; a learner may read rows where the section is theirs (for the nudge/due badge).
- Standard `updated_at`, RLS enabled, anon locked on any new RPC.

### RLS — extend `pde_assess_read` (the learner branch)
Current learner branch: `is_active AND status='published' AND EXISTS(enrollment in course)`.
New learner branch: the above **AND** (`visibility_mode = 'open'` **OR** `EXISTS(pde_case_assignments a JOIN the learner's section WHERE a.assessment_id = pde_assessments.id AND a.section_id = <learner's section>)`).
- Learner's section = `learners_profiles.section_id` via `profiles.learner_id`. Confirm the join path in a rolled-back impersonation test: open case visible to all enrolled; class-only case visible only to assigned sections; creator/admin/staff unaffected.
- The answer-key RPCs from #2244 already gate on published+enrolled — extend their gate to also honor `visibility_mode`/assignment so a locked-out learner can't reach questions via the RPC either.

### Faculty UI (`/pde/faculty/cases/...`)
- On a published case: an "Assign / visibility" panel — toggle open↔class-only, multiselect sections (grouped by program/semester), optional due date per assignment. Writes `pde_case_assignments` + `visibility_mode`.

### Learner UI (`/pde/learn/cases`)
- Assigned cases pinned to top with an "Assigned by your teacher" badge + due badge ("due in 3 days" / "overdue").
- Notification on assignment (reuse the existing notifications system — see `project_notifications_global_count_epic`).
- Direct-URL guard on the attempt page for a locked-out learner → explicit 403-style message (rule #27), not `redirect()`.

### Verify (quality bar)
- Rolled-back impersonation on prod: open case seen by a non-assigned enrolled learner; class-only case hidden from a non-assigned learner but shown to an assigned one; creator/admin see all; a learner with a prior attempt keeps access after lock.
- Browser-test on prod: teacher assigns a case to a section + sets a due date; an enrolled learner in that section sees the pin + notification + due badge; a learner not in the section does not see a class-only case.
- Ship via worktree PR off `jicate/main`; JKKN terminology gate; deploy; re-verify live.

## Not in scope (this feature)
- Lab-image ingestion (separate, unblocked — see `pde-image-bridge-design-2026-07-21.md`; drive adoption first).
- Analytics on assignment completion (could follow).

---

## Follow-up decisions (interview 2026-07-22) — section picker + overdue block

**Not yet built.** Decided via user interview after the assign feature shipped.

1. **Section picker scope** — the assign page must show ONLY sections that have ≥1 learner enrolled in the case's course (join: `pde_assessments.course_id` → `vac_enrollments` → `profiles` → `learners_profiles.section_id`), NOT all `sections` in the institution. (Current code loads all institution sections — that's the bug.)
2. **Section label** — render **Programme · Semester · Section** by joining `sections.program_id → programs.program_name` and `sections.semester_id → semesters.semester_name`. Reason: "Section A" is dozens of different sections across programmes/semesters; the bare name is ambiguous. Verified on prod: the same "A" resolves to "B.E. Electrical… · Semester VI · A" vs "M.Sc. Chemistry · Semester III · A". The search box filters on the full label. NOTE: `vac_courses` column is `programme_id` (British spelling) and `name`; `programs`/`semesters` tables carry the readable names.
3. **Overdue = hard block, LOCKED cases only.** When a `class_only` case's assignment `due_at` has passed, block NEW attempts for assigned learners. An `open` case with a due date shows the "Overdue" badge only (no block) — avoids an assigned learner being more restricted than a random browser on the same open case.
   - Mid-attempt (started, not submitted) when the deadline passes → let them finish; block only new attempts.
   - Already-completed → review (model answers) always available.
   - Enforce in the attempt-entry page + surface an explicit "Overdue — closed" message (rule #27), not a bare 404.

Terminology for future sessions: **Programme** (degree, e.g. BDS) → **Course** (a subject the case attaches to) → **Semester** → **Section** (class group A/B/C).
