-- hr_attendance_records_select: resolve "my own record" through fn_my_staff_ids()
-- instead of an inline EXISTS on `staff`.
--
-- BUG: the own-record clause was
--     EXISTS (SELECT 1 FROM staff s WHERE s.id = employee_id AND s.profile_id = auth.uid())
-- That subquery runs under the CALLER's RLS on `staff`. staff_select_scope_aware
-- requires staff.view (or a visiting-teacher permission), so any staff member
-- without it cannot see their OWN staff row, the EXISTS is false, and every one
-- of their attendance rows is hidden. No error - the page renders every day as
-- AEYP ("Attendance entries yet to be processed"). Reproduced for JAYAMMAL R
-- (NOTAHS006, librarian): 15 September rows in the table, 0 visible to her.
--
-- FIX: fn_my_staff_ids() is SECURITY DEFINER keyed on auth.uid() and is already
-- what hla_select (hr_leave_applications) uses for the same purpose.
-- Every other clause is unchanged.

ALTER POLICY hr_attendance_records_select ON public.hr_attendance_records
USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR employee_id IN (SELECT unnest(fn_my_staff_ids()))
  OR ((SELECT user_has_permission('hr.attendance.view_all'))
      AND institution_id IS NOT NULL
      AND role_has_institution_access(institution_id))
  OR ((SELECT user_has_permission('hr.attendance.override'))
      AND institution_id IS NOT NULL
      AND role_has_institution_access(institution_id))
);
