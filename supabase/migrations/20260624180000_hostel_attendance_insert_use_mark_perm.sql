-- Fix: hostel_attendance INSERT policy gated on a non-existent permission key.
--
-- The persona-design RLS generator (20260421000002_persona_design_pr4_rls_retrofit)
-- created every campus_living INSERT policy as `<base>.create`. For
-- hostel_attendance the catalogued key for recording attendance is
-- `campus_living.attendance.mark` (lib/constants/permissions.ts) — there is NO
-- `campus_living.attendance.create` key, and it is granted to no role. Result:
-- every non-super-admin/non-admin user (including chief wardens, who DO hold
-- campus_living.attendance.mark) was RLS-blocked from inserting, so Mark
-- Attendance silently failed and hostel_attendance stayed empty.
--
-- Re-key the INSERT policy to the catalogued `.mark` permission. Institution +
-- block scoping (role_has_institution_access / role_has_block_access) are
-- unchanged.
--
-- NOTE: the same generator also keyed DELETE on `campus_living.attendance.delete`
-- (also absent from the catalog), so deleting attendance stays admin-only. That
-- is intentionally left as-is (no catalogued delete key; deletes are sensitive).

DROP POLICY IF EXISTS hostel_attendance_insert_permission ON public.hostel_attendance;
CREATE POLICY hostel_attendance_insert_permission ON public.hostel_attendance
  FOR INSERT
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('campus_living.attendance.mark')
      AND role_has_institution_access(institution_id)
      AND role_has_block_access(block_id)
    )
  );

COMMENT ON POLICY hostel_attendance_insert_permission ON public.hostel_attendance IS
  'Marking attendance is gated on the catalogued campus_living.attendance.mark permission (NOT .create, which does not exist) + institution + block access. Fixes chief wardens / all non-admin markers being silently blocked.';
