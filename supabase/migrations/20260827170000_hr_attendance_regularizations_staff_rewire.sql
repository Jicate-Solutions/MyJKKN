-- Regularization requests re-wired from the dropped hr_employees to staff.
--
-- /hr/attendance/regularize failed on submit with "Could not find a
-- relationship between 'hr_attendance_regularizations' and 'hr_employees' in
-- the schema cache". Root cause: the table was created (20260429000001) with
-- employee_id REFERENCES hr_employees(id), and its SELECT/INSERT policies
-- matched auth.uid() against hr_employees.user_id. When hr_employees was
-- consolidated into staff and dropped, the cascade took the FK AND those two
-- policies with it — leaving:
--
--   * no employee_id FK at all, so the service's `employee:hr_employees(...)`
--     embed can never resolve (the schema-cache error, on every read and
--     write in regularization-service.ts);
--   * only the UPDATE/DELETE policies (they never referenced hr_employees),
--     so with RLS enabled the table was deny-all for SELECT and INSERT —
--     submits would have been refused even with the embed fixed.
--
-- employee_id has always held staff.id values (the service resolves identity
-- via fn_my_hr_context() -> staff); the table holds 0 rows today, so the FK
-- attaches cleanly. The policies are recreated with the staff-era equivalent
-- of the original clauses: fn_my_staff_ids() is the established SECURITY
-- DEFINER helper (same one hla_* and the leave queue use), so the self test
-- does not depend on staff's own RLS. Auth/permission calls are wrapped in
-- scalar subqueries per the InitPlan rule, matching the surviving policies.
--
-- hr_attendance_regs_emp_date_idx already leads on employee_id — no new
-- index is needed for the FK.

ALTER TABLE public.hr_attendance_regularizations
  DROP CONSTRAINT IF EXISTS hr_attendance_regularizations_employee_id_fkey;
ALTER TABLE public.hr_attendance_regularizations
  ADD CONSTRAINT hr_attendance_regularizations_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.staff(id);

DROP POLICY IF EXISTS hr_attendance_regs_select ON public.hr_attendance_regularizations;
CREATE POLICY hr_attendance_regs_select ON public.hr_attendance_regularizations
  FOR SELECT USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('hr.attendance.view_all'))
    OR (SELECT user_has_permission('hr.attendance.regularize_approve'))
    OR (SELECT user_has_permission('hr.attendance.approve_team'))
    OR (
      (SELECT user_has_permission('hr.attendance.regularize_self'))
      AND employee_id = ANY (COALESCE((SELECT public.fn_my_staff_ids()), ARRAY[]::uuid[]))
    )
  );

DROP POLICY IF EXISTS hr_attendance_regs_insert ON public.hr_attendance_regularizations;
CREATE POLICY hr_attendance_regs_insert ON public.hr_attendance_regularizations
  FOR INSERT WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('hr.attendance.override'))
    OR (
      (SELECT user_has_permission('hr.attendance.regularize_self'))
      AND employee_id = ANY (COALESCE((SELECT public.fn_my_staff_ids()), ARRAY[]::uuid[]))
    )
  );
