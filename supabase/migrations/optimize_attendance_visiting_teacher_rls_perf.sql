-- Attendance-path RLS statement-timeout hardening (academic/attendance, 2026-07-16).
--
-- Same per-row anti-pattern fixed on `courses`: staff_teaches_in_institution(institution_id)
-- takes the row's institution_id (a Var) so it re-evaluates PER ROW. It gates the
-- visiting-teacher policies on the faculty attendance path. Worst case measured
-- (non-admin faculty, unbounded student_attendance scan): 1456ms / 418k buffers for 8797 rows;
-- student_attendance grows daily, so it will cross the 8s statement_timeout (57014), surfacing
-- as "roster loading forever" / "attendance not showing" / (on catch) a false "No classes scheduled".
--
-- Fix: replace the per-row function with a once-evaluated hashed sublink, and hoist the
-- Var-free permission check with a scalar sub-select:
--   staff_teaches_in_institution(institution_id)
--     -> institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
--   user_has_permission('...')
--     -> (SELECT user_has_permission('...'))
-- (`= ANY(fn())` does NOT hoist — see optimize_courses_select_rls_statement_timeout.sql.)
-- Equivalence: staff_teaches_in_institution(X) is true iff X ∈ staff_teaching_institution_ids();
-- a NULL institution_id is denied by both forms; other permissive policies still apply.
-- Verified: student_attendance scan 1456ms -> 63ms, identical 2351 visible rows for the test faculty.

-- ---- structure tables embedded in the My Classes timetables fetch ----
DROP POLICY IF EXISTS "sections_select_visiting_teacher" ON public.sections;
CREATE POLICY "sections_select_visiting_teacher" ON public.sections
  FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

DROP POLICY IF EXISTS "semesters_select_visiting_teacher" ON public.semesters;
CREATE POLICY "semesters_select_visiting_teacher" ON public.semesters
  FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

DROP POLICY IF EXISTS "departments_select_visiting_teacher" ON public.departments;
CREATE POLICY "departments_select_visiting_teacher" ON public.departments
  FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

DROP POLICY IF EXISTS "programs_select_visiting_teacher" ON public.programs;
CREATE POLICY "programs_select_visiting_teacher" ON public.programs
  FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

DROP POLICY IF EXISTS "degrees_select_visiting_teacher" ON public.degrees;
CREATE POLICY "degrees_select_visiting_teacher" ON public.degrees
  FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

-- ---- student_attendance: the large, hot table (roster + "already marked?" + dashboard) ----
DROP POLICY IF EXISTS "student_attendance_select_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_select_visiting_teacher" ON public.student_attendance
  FOR SELECT USING (
    (SELECT user_has_permission('academic.attendance.mark'::text))
    AND institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
  );

DROP POLICY IF EXISTS "student_attendance_update_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_update_visiting_teacher" ON public.student_attendance
  FOR UPDATE
  USING (
    (SELECT user_has_permission('academic.attendance.mark'::text))
    AND institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
  )
  WITH CHECK (
    (SELECT user_has_permission('academic.attendance.mark'::text))
    AND institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
  );

DROP POLICY IF EXISTS "student_attendance_insert_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_insert_visiting_teacher" ON public.student_attendance
  FOR INSERT
  WITH CHECK (
    (SELECT user_has_permission('academic.attendance.mark'::text))
    AND institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
  );
