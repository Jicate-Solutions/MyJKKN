-- Migration: close cross-tenant READ leak on public.learners_profiles
-- Date: 2026-07-04
-- Why: learners_profiles_select_policy had an is_admin() OR-branch. is_admin()
--   returns true for any profiles.role IN ('admin','administrator') OR is_super_admin,
--   IGNORING institution scope -> a scope='own' admin could read all 6,585 student
--   PII rows across all 14 institutions. Proven live: test.admin2 (no learners.*.view
--   perm) saw all 6,585.
-- Fix: drop is_admin() (keep is_super_admin()); convert per-row role_has_institution_access
--   to an initplan array (0 NULL/orphan institution_id rows confirmed, so equivalent);
--   initplan-wrap surviving row-independent fn calls (perf: 6,585 rows).
-- Rehearsed rolled-back 2026-07-04 (true DROP/CREATE, 5 impersonated subjects):
--   test.admin2 6585->0 (leak closed); administrator 6585 (unchanged, scope=all+view);
--   super_admin 6585 (via is_super); scope-own faculty 227 (unchanged); student 1 (self).
--   ONLY the test account changes; zero real users affected; grant-first not required.
-- Self-view path preserved via student_email/college_email branches + the separate
--   students_view_own_learner_profile policy (untouched).

DROP POLICY IF EXISTS learners_profiles_select_policy ON public.learners_profiles;
CREATE POLICY learners_profiles_select_policy ON public.learners_profiles
FOR SELECT USING (
  (SELECT public.is_super_admin())
  OR (
    institution_id = ANY ((SELECT array_agg(i.id) FROM public.institutions i
                           WHERE public.role_has_institution_access(i.id))::uuid[])
    AND (
      (SELECT public.user_has_permission('learners.admissions.view'))
      OR (SELECT public.user_has_permission('learners.profiles.view'))
      OR (SELECT public.user_has_permission('learners.view'))
    )
  )
  OR (student_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
  OR (college_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
);
