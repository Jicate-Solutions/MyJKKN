-- 2026-06-24 — Let scope='all' / view_all_institutions roles read other colleges'
-- attendance on the dashboard (BUG-004284 "still not able to see all colleges").
--
-- ROOT CAUSE (data layer): none of the existing student_attendance SELECT policies
-- call role_has_institution_access(). They admit only super_admin/admin/faculty (by
-- role), hod/principal (own department), or own-institution. A custom role with
-- institution_scope='all' + academic.attendance.dashboard.view_all_institutions
-- (e.g. Executive Administrative Officer) therefore reads ONLY its own institution,
-- so the dashboard's "All Institutions" view silently shows a single college.
-- Verified live: eao (executive_admin_officer) read 1 of 9 institutions.
--
-- FIX: add ONE additive (permissive, ORs with existing) SELECT policy in the
-- canonical MyJKKN shape — gated on the attendance-dashboard view permission AND
-- role_has_institution_access(institution_id). role_has_institution_access already
-- encodes the scope rules (scope='all' role → every institution; otherwise own
-- institution + CAS siblings + explicit user_institution_access grants), so this
-- grants exactly the access the role is configured for and nothing more.
--
-- SAFETY (dry-run verified against live prod before applying):
--   - eao (dashboard.view + scope='all'): new predicate TRUE for other institutions.
--   - a faculty WITHOUT academic.attendance.dashboard.view: new predicate FALSE
--     (the permission gate blocks it) — no cross-institution over-grant from this policy.
-- No existing policy is dropped, so no user loses access; only dashboard-viewers
-- whose role scope allows it GAIN the cross-institution read they were meant to have.

DROP POLICY IF EXISTS "student_attendance_select_dashboard_institution_access" ON public.student_attendance;

CREATE POLICY "student_attendance_select_dashboard_institution_access"
ON public.student_attendance
FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('academic.attendance.dashboard.view')
    AND role_has_institution_access(institution_id)
  )
);
