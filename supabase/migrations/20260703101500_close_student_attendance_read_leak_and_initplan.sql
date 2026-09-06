-- =====================================================================================
-- Migration: Close student_attendance cross-tenant read leak (executes #1739's intent)
--            + initplan/array-subplan performance hardening on the same policies
-- Date:      2026-07-03
-- Status:    ALREADY APPLIED to production (out-of-band via Management API,
--            2026-07-03 ~10:15 IST, Director-approved via interview). Recorded here so
--            the repo matches prod. Re-applying is idempotent.
--
-- SUPERSEDES the policy body in 20260731000000_fix_student_attendance_rls_is_admin_leak.sql
-- (same intent; this version adds the initplan form and the sibling-policy fixes that
-- migration documented as follow-ups).
--
-- WHAT THIS DOES (three policies on public.student_attendance):
--  1) student_attendance_select_dashboard_institution_access:
--     - REMOVES the is_admin() global role-name bypass (the cross-tenant leak:
--       a scope='own' admin could read every institution's rows; proven 6,876
--       foreign rows for test.admin2).
--     - PREREQUISITE grant executed first (Director-approved): the 'administrator'
--       custom_role received {"academic.attendance.dashboard.view": true} so real
--       group admins (deepanj@, vg@, deepakkumar@ — scope='all') keep full access
--       through the PROPER channel.
--     - role_has_institution_access is evaluated ONCE PER INSTITUTION (~14) via an
--       array-initplan instead of once per row (7.4k). Without this, removing the
--       is_admin() fast-path exposes an ~18s/8s-timeout tax on permission-path users
--       (exact failure mode seen on admission_leads the same morning).
--  2) "Comprehensive attendance access by role" (cmd=ALL — the sibling leak):
--     - REMOVES the p.role = ANY('{super_admin,admin,faculty}') global bypass
--       (any legacy 'admin'/'faculty' profile could read/write ALL institutions).
--     - Faculty keep institution-scoped access (staff join, now an array-initplan);
--       hod/principal keep department-scoped access (array-initplans).
--  3) student_attendance_select_own_student:
--     - Adds a once-per-query "(SELECT get_current_user_role()) = 'student'" guard so
--       non-students skip the expensive per-row learners_profiles EXISTS entirely
--       (it cascaded into learners_profiles RLS: 145,610 nested policy evaluations
--       per full-table count). Students: unchanged semantics (the EXISTS already
--       required p.role='student').
--
-- VERIFIED (live prod, pre/post, JWT-claims impersonation):
--   deepanj@   (administrator, inst NULL, scope=all, +grant): 7,451 -> 7,451 (kept; 5.5s -> 0.03s)
--   deepakkumar@ (administrator, has inst, +grant):           7,451 -> 7,451 (kept)
--   director@  (super admin):                                 7,451 -> 7,451 (kept)
--   test.admin2 (role=admin, scope own, NO perm):             7,451 -> 571, foreign 6,880 -> 0  << LEAK CLOSED
--   akdhd@     (faculty):                                     571 own-institution only (== expected)
--   harinishri (student, 30d window):                         33 -> 33 (identical)
--   UI: /academic/attendance/dashboard + /learners/my-attendance render correctly post-change.
-- =====================================================================================

BEGIN;

-- 0) Prerequisite grant (idempotent) — administrator role sees attendance dashboards
UPDATE custom_roles
SET permissions = permissions || '{"academic.attendance.dashboard.view": true}'::jsonb
WHERE role_key = 'administrator';

-- 1) Dashboard read policy — leak fix + initplan form
DROP POLICY IF EXISTS "student_attendance_select_dashboard_institution_access" ON public.student_attendance;
CREATE POLICY "student_attendance_select_dashboard_institution_access" ON public.student_attendance
  FOR SELECT TO authenticated USING (
    (SELECT is_super_admin())
    OR ((SELECT user_has_permission('academic.attendance.dashboard.view'))
        AND (institution_id = ANY ((SELECT array_agg(i.id) FROM institutions i WHERE role_has_institution_access(i.id))::uuid[])))
  );

-- 2) Sibling ALL policy — remove role-array global bypass, keep scoped branches
DROP POLICY IF EXISTS "Comprehensive attendance access by role" ON public.student_attendance;
CREATE POLICY "Comprehensive attendance access by role" ON public.student_attendance
  FOR ALL USING (
    (SELECT is_super_admin())
    OR (institution_id = ANY ((SELECT array_agg(s.institution_id)
          FROM profiles p JOIN staff s ON s.institution_email = p.email
          WHERE p.id = auth.uid() AND (s.role_key)::text = 'faculty')::uuid[]))
    OR (department_id = ANY ((SELECT array_agg(p.department_id)
          FROM profiles p WHERE p.id = auth.uid() AND p.role = 'hod')::uuid[]))
    OR (department_id = ANY ((SELECT array_agg(p.department_id)
          FROM profiles p WHERE p.id = auth.uid() AND p.role = 'principal')::uuid[]))
  );

-- 3) Own-student read policy — non-student short-circuit guard
DROP POLICY IF EXISTS "student_attendance_select_own_student" ON public.student_attendance;
CREATE POLICY "student_attendance_select_own_student" ON public.student_attendance
  FOR SELECT USING (
    ((SELECT get_current_user_role()) = 'student')
    AND (EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = auth.uid()) AND (p.role = 'student'::text) AND (p.learner_id IN ( SELECT learners_profiles.id
               FROM learners_profiles
              WHERE ((learners_profiles.section_id = student_attendance.section_id) AND (learners_profiles.lifecycle_status = ANY (ARRAY['active'::lifecycle_status, 'graduated'::lifecycle_status]))))))))
  );

COMMIT;
