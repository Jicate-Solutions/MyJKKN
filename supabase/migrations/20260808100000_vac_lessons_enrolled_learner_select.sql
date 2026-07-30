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
-- NO 42P17 RECURSION (checked)
--   Traced the chain rather than assuming: `vac_enrollments_select` reads
--   vac_courses, user_institution_access and profiles — never vac_lessons.
--   `vac_courses_select` reads user_institution_access and profiles — never
--   vac_lessons. No path returns to vac_lessons, so there is no self-referential
--   recursion.
--
-- WHY A SECURITY DEFINER HELPER IS USED ANYWAY — enrolment ALONE is not a
-- trustworthy read gate (this is a privilege-escalation fix, review it closely)
--   `vac_enrollments_insert` is `WITH CHECK (user_id = auth.uid() OR super_admin)`.
--   It constrains WHO the row is for, but places NO constraint whatsoever on
--   course_id. So any authenticated user can self-insert an enrolment naming ANY
--   course on the platform — including a course belonging to another institution
--   — with one POST to /rest/v1/vac_enrollments using the anon key that ships in
--   every browser bundle.
--
--   A read gate of "enrolled in this course" alone would therefore be a
--   cross-tenant read escalation: forge an enrolment, then read that course's
--   vac_lessons.case_scenario. The gate must not delegate trust to a table the
--   caller can write to at will, so the enrolment is paired with the check the
--   broken policy was actually missing — that the course belongs to the
--   learner's OWN institution (profiles.institution_id).
--
--   That institution check cannot be inlined in the policy: reading vac_courses
--   from inside the USING clause re-evaluates `vac_courses_select`, which itself
--   demands a user_institution_access row — the very thing these 544 learners do
--   not have. Inlining it would leave the defect 100% unfixed. A SECURITY
--   DEFINER helper evaluates the join without re-applying the caller's RLS to
--   the tables it reads, which is exactly what is required here.
--
--   Residual, and deliberate: within one institution a learner could still forge
--   an enrolment into another of their own college's courses. That grants no
--   more than the platform already grants every institution-scoped team member
--   through vac_lessons_select, and is a far smaller surface than a cross-tenant
--   read. The underlying fix is to constrain course_id in
--   `vac_enrollments_insert`; that policy is out of this change's scope and is
--   flagged separately.
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
--   A learner who can open the case must be able to read its scenario;
--   splitting the two predicates is what produced a half-visible case in the
--   first place. Note that status would add no security either way — the caller
--   sets it on the row they insert.
--
-- The helper is STABLE and takes the course_id as its only argument, so the
-- planner may reuse its result per distinct course within a statement; inside
-- it, auth.uid() is wrapped in a scalar subquery so it is evaluated once rather
-- than per joined row.
--
-- The (user_id, course_id) lookup is served by the existing UNIQUE constraint
-- on vac_enrollments(user_id, course_id); no new index is required.
--
-- BEFORE APPLYING, confirm the fix actually reaches the locked-out learners:
-- the helper requires profiles.institution_id = vac_courses.institution_id, so
-- run the "does the institution actually match" query in the PR body first. If
-- those 545 learners' profiles carry a different institution_id than the course,
-- this closes the hole but does NOT open the door, and the mismatch must be
-- resolved before this is considered a fix.
--
-- Idempotent. Re-running is a no-op.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vac_learner_may_read_lesson(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.vac_enrollments e
    JOIN public.vac_courses    c ON c.id = e.course_id
    JOIN public.profiles       p ON p.id = e.user_id
    WHERE e.course_id        = p_course_id
      AND e.user_id          = (SELECT auth.uid())
      AND c.institution_id IS NOT NULL
      AND p.institution_id IS NOT NULL
      AND c.institution_id   = p.institution_id
  );
$fn$;

COMMENT ON FUNCTION public.fn_vac_learner_may_read_lesson(uuid) IS
  'True when the CALLER is enrolled in p_course_id AND that course belongs to the caller''s own institution (profiles.institution_id). SECURITY DEFINER because the institution check must read vac_courses without re-applying the caller''s RLS — vac_courses_select demands a user_institution_access row, which the locked-out learners do not have. Enrolment alone is deliberately NOT sufficient: vac_enrollments_insert does not constrain course_id, so a caller can forge an enrolment for any course. Never trusts a caller-supplied identity — it reads auth.uid() itself.';

-- Mandatory: Supabase default privileges grant anon EXECUTE on every new
-- function, separately from PUBLIC. Without this revoke the helper is callable
-- by any unauthenticated client holding the public anon key.
REVOKE EXECUTE ON FUNCTION public.fn_vac_learner_may_read_lesson(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_vac_learner_may_read_lesson(uuid) TO authenticated;

DROP POLICY IF EXISTS vac_lessons_select_enrolled_learner ON public.vac_lessons;

-- TO authenticated is REQUIRED, not stylistic. A policy with no TO clause
-- applies to PUBLIC, so the anon role would also evaluate the USING clause —
-- and anon has just had EXECUTE on the helper revoked. An unauthenticated
-- SELECT on vac_lessons would then raise
--   ERROR: permission denied for function fn_vac_learner_may_read_lesson
-- instead of returning zero rows: a hard error on every anon read path rather
-- than the empty result RLS is supposed to produce. Reproduced locally, then
-- fixed by this clause. Restricting to authenticated is also the correct
-- meaning — the door is about a logged-in learner.
CREATE POLICY vac_lessons_select_enrolled_learner
  ON public.vac_lessons
  FOR SELECT
  TO authenticated
  USING ( public.fn_vac_learner_may_read_lesson(vac_lessons.course_id) );

COMMENT ON POLICY vac_lessons_select_enrolled_learner ON public.vac_lessons IS
  'Additive read door: a learner enrolled in the lesson''s course, AND at the institution that owns that course, may read the lesson. Complements vac_lessons_select (institution-access + super_admin), which never consults enrolment and locked 544 of 545 enrolled learners out of their own clinical case. Permissive, so it can only widen read access, never narrow it. The institution half is not optional — vac_enrollments_insert lets a caller forge an enrolment for any course, so enrolment alone would be a cross-tenant read escalation.';
