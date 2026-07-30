-- ============================================================================
-- Migration: 20260808100000_vac_lessons_enrolled_learner_select
-- Date: 2026-08-08
-- NOT APPLIED to any database — Director-gated apply.
-- ============================================================================
-- WHAT IS BROKEN
--   A PDE clinical case renders "Case scenario missing" for real learners.
--   app/(routes)/pde/learn/cases/[caseSlug]/page.tsx reads the patient scenario
--   with the learner's own session:
--       sb.from('vac_lessons').select('case_scenario').eq('id', lesson_id)
--   RLS returns zero rows, `scenario` is null, and the page renders the
--   missing-scenario notice.
--
-- ROOT CAUSE
--   The only SELECT policy on vac_lessons (`vac_lessons_select`, defined in
--   supabase/setup/03_policies.sql) grants read through exactly two doors:
--     (a) an ACTIVE user_institution_access row matching the course institution
--     (b) profiles.role = 'super_admin'
--   It never consults profiles.institution_id and never consults enrolment, so
--   being an enrolled learner at the course's own college grants nothing.
--   Measured on production 2026-07-27 for course 128a9d24-1091-4bc8-ab24-0c77380fcb74
--   (BDS Clinical Reasoning): 545 enrolled learners, exactly ONE holding a
--   user_institution_access row => 544 locked out. The Senior Learner preview
--   route looked healthy only because door (b) short-circuits every gate.
--
-- MECHANISM CHOSEN — a SECOND permissive policy, NOT a rewrite of the first
--   Permissive SELECT policies combine with OR, so an additional policy is
--   semantically identical to adding an `OR` branch to the existing one, and it
--   PRESERVES both existing branches perfectly by never touching them.
--   DROP + CREATE of `vac_lessons_select` was rejected deliberately: this repo
--   has already shipped a regression where re-creating a live object from a
--   possibly-stale repo file silently reverted a tightening nobody could see in
--   the file. This migration therefore adds access and cannot remove any.
--
-- NO SECURITY DEFINER HELPER IS NEEDED (checked for error 42P17)
--   The enrolment branch reads vac_enrollments from inside a vac_lessons policy,
--   so vac_enrollments' own RLS is evaluated. Traced it: `vac_enrollments_select`
--   reads vac_courses, user_institution_access and profiles — never vac_lessons.
--   `vac_courses_select` reads user_institution_access and profiles — never
--   vac_lessons. No path returns to vac_lessons, so there is no self-referential
--   recursion. Its FIRST branch is `user_id = auth.uid()`, so a learner always
--   sees their own enrolment row. This exact expression is already live and
--   working for this exact role in `pde_assess_read`
--   (20260721234500_pde_assessment_write_rls.sql), which is why the assessment
--   itself loads for learners today while the scenario does not.
--
-- DELIBERATELY NO is_published GATE
--   app/api/pde/cases/route.ts hardcodes `is_published: false` on the lesson it
--   creates for a case, and nothing anywhere in the codebase ever flips it (one
--   single occurrence). Gating this branch on is_published would therefore leave
--   the defect 100% unfixed for every case ever created through the product.
--   The learner path is already fenced one level up: the page returns early
--   unless the linked pde_assessments row has status='published'.
--
-- DELIBERATELY NO enrolment-status GATE
--   Matches `pde_assess_read` exactly. A learner who can open the case must be
--   able to read its scenario; splitting the two predicates is what produced a
--   half-visible case in the first place.
--
-- auth.uid() is wrapped in a scalar subquery so the planner evaluates it once
-- per statement instead of once per candidate row.
--
-- The (user_id, course_id) lookup is served by the existing UNIQUE constraint
-- on vac_enrollments(user_id, course_id); no new index is required.
--
-- Idempotent. Re-running is a no-op.
-- ============================================================================

DROP POLICY IF EXISTS vac_lessons_select_enrolled_learner ON public.vac_lessons;

CREATE POLICY vac_lessons_select_enrolled_learner
  ON public.vac_lessons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.vac_enrollments e
      WHERE e.course_id = vac_lessons.course_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON POLICY vac_lessons_select_enrolled_learner ON public.vac_lessons IS
  'Additive read door: a learner enrolled in the lesson''s course may read the lesson. Complements vac_lessons_select (institution-access + super_admin), which never consults enrolment and locked 544 of 545 enrolled learners out of their own clinical case. Permissive, so it can only widen read access, never narrow it.';
