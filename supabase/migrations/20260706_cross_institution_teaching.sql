-- Cross-institution staff collaboration (staff planning → timetable → attendance)
-- 2026-07-06
--
-- Business context: JKKN staff routinely teach across sister institutions (e.g.
-- Dental faculty taking classes for AHS and Pharmacy). A visiting staff keeps their
-- single home-institution `staff` row; their staff.id is written into the TARGET
-- institution's staff_plan_courses (and from there into timetable_data.staff_ids).
-- No shadow staff rows are created — duplicate staff rows are a known bug pattern
-- that gets merged by cleanup migrations.
--
-- This migration adds the DB pieces that make the downstream reads work for a
-- visiting staff, without touching any existing policy:
--   1) staff_teaches_in_institution(uuid)            — "does the CURRENT USER teach there?"
--   2) fn_staff_teaching_institutions(uuid)          — "which institutions does staff X teach in?"
--   3) staff_is_visiting_in_accessible_institution() — "is staff X visiting somewhere I can access?"
--   4) staff SELECT policy: visiting staff visible where they teach
--   5) lookup tables (courses/sections/semesters/degrees/departments/programs):
--      visiting teachers can read the academic structure of institutions they teach in
--   6) fn_attendance_roster gate: accept teaching-based access
--   7) student_attendance: permission-gated visiting read/write path
--
-- All helpers are SECURITY DEFINER because the deriving tables (staff_plan_courses,
-- staff_plans) are themselves RLS-scoped to the *viewer's own* institution — a
-- visiting staff cannot read the target institution's plan rows directly, and
-- policies referencing these tables would otherwise nest RLS evaluation.

-- ============================================================================
-- 1) Does the CURRENT USER teach (via staff planning) in institution X?
--    Identity bridge mirrors the app: staff.profile_id = auth.uid() OR
--    staff.institution_email = auth.email().
-- ============================================================================
CREATE OR REPLACE FUNCTION public.staff_teaches_in_institution(p_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.staff_plan_courses spc ON spc.staff_id = s.id
    JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
    WHERE (s.profile_id = auth.uid() OR s.institution_email = auth.email())
      AND s.is_active = true
      AND sp.institution_id = p_institution_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.staff_teaches_in_institution(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.staff_teaches_in_institution(uuid) TO authenticated;

COMMENT ON FUNCTION public.staff_teaches_in_institution(uuid) IS
  'True when the current user''s active staff row has at least one staff_plan_courses assignment under a staff_plan of the given institution. Powers cross-institution (visiting) teaching access in RLS policies and fn_attendance_roster. Added 2026-07-06.';

-- ============================================================================
-- 2) Which institutions does staff X teach in? (own institution ∪ plan institutions)
--    Used by FacultyAttendanceService.getFacultyTodayPeriods to widen its
--    timetable query. Client-side derivation is impossible: staff_plan_courses
--    SELECT RLS only admits the caller''s own-institution plans.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_staff_teaching_institutions(p_staff_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_own boolean;
  v_result uuid[];
BEGIN
  -- SECURITY DEFINER bypasses RLS, so self-authorize: the caller must own the
  -- staff row, be an admin, or hold an attendance permission (never gate on
  -- hardcoded role names).
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = p_staff_id
      AND (s.profile_id = auth.uid() OR s.institution_email = auth.email())
  ) INTO v_is_own;

  IF NOT (
    v_is_own
    OR is_super_admin()
    OR is_admin()
    OR user_has_permission('academic.attendance.mark')
    OR user_has_permission('academic.attendance.view')
  ) THEN
    RAISE EXCEPTION 'Not authorized to view teaching institutions for this staff'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT t.inst_id), ARRAY[]::uuid[])
  INTO v_result
  FROM (
    SELECT s.institution_id AS inst_id
    FROM public.staff s
    WHERE s.id = p_staff_id
    UNION
    SELECT sp.institution_id
    FROM public.staff_plan_courses spc
    JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
    WHERE spc.staff_id = p_staff_id
  ) t
  WHERE t.inst_id IS NOT NULL;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_staff_teaching_institutions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_staff_teaching_institutions(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_staff_teaching_institutions(uuid) IS
  'Returns the staff''s own institution_id plus every distinct staff_plans.institution_id they are assigned under (visiting institutions). Self-authorized: own staff row, admin, or attendance permission holders. Added 2026-07-06.';

-- ============================================================================
-- 3) Is staff X a visiting teacher in an institution the CURRENT USER can access?
--    Wrapped in SECURITY DEFINER so the staff SELECT policy below does not nest
--    staff_plan_courses/staff_plans RLS evaluation (42P17-style recursion guard
--    + per-row performance).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.staff_is_visiting_in_accessible_institution(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_plan_courses spc
    JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
    WHERE spc.staff_id = p_staff_id
      AND role_has_institution_access(sp.institution_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.staff_is_visiting_in_accessible_institution(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.staff_is_visiting_in_accessible_institution(uuid) TO authenticated;

COMMENT ON FUNCTION public.staff_is_visiting_in_accessible_institution(uuid) IS
  'True when the given staff has a staff-plan assignment under an institution the current user can access (role_has_institution_access). Lets planners/faculty of the TARGET institution see a visiting staff''s row (name/designation) in embedded joins. Added 2026-07-06.';

-- ============================================================================
-- 4) staff SELECT: visiting staff visible where they teach.
--    Additive permissive policy — existing staff_select_permission is untouched.
--    Gated on an academic permission so the row is only visible to users who
--    legitimately work with plans/timetables/attendance.
-- ============================================================================
DROP POLICY IF EXISTS "staff_select_visiting_teacher" ON public.staff;
CREATE POLICY "staff_select_visiting_teacher" ON public.staff
FOR SELECT USING (
  (
    user_has_permission('academic.staff.planning.view')
    OR user_has_permission('academic.timetables.view')
    OR user_has_permission('academic.attendance.mark')
    OR user_has_permission('academic.attendance.view')
  )
  AND staff_is_visiting_in_accessible_institution(staff.id)
);

-- ============================================================================
-- 5) Visiting teachers can read the academic structure of institutions they
--    teach in. Additive SELECT-only policies; write policies untouched.
-- ============================================================================
DROP POLICY IF EXISTS "courses_select_visiting_teacher" ON public.courses;
CREATE POLICY "courses_select_visiting_teacher" ON public.courses
FOR SELECT USING (staff_teaches_in_institution(institution_id));

DROP POLICY IF EXISTS "sections_select_visiting_teacher" ON public.sections;
CREATE POLICY "sections_select_visiting_teacher" ON public.sections
FOR SELECT USING (staff_teaches_in_institution(institution_id));

DROP POLICY IF EXISTS "semesters_select_visiting_teacher" ON public.semesters;
CREATE POLICY "semesters_select_visiting_teacher" ON public.semesters
FOR SELECT USING (staff_teaches_in_institution(institution_id));

DROP POLICY IF EXISTS "degrees_select_visiting_teacher" ON public.degrees;
CREATE POLICY "degrees_select_visiting_teacher" ON public.degrees
FOR SELECT USING (staff_teaches_in_institution(institution_id));

DROP POLICY IF EXISTS "departments_select_visiting_teacher" ON public.departments;
CREATE POLICY "departments_select_visiting_teacher" ON public.departments
FOR SELECT USING (staff_teaches_in_institution(institution_id));

DROP POLICY IF EXISTS "programs_select_visiting_teacher" ON public.programs;
CREATE POLICY "programs_select_visiting_teacher" ON public.programs
FOR SELECT USING (staff_teaches_in_institution(institution_id));

-- ============================================================================
-- 6) fn_attendance_roster: accept teaching-based institution access.
--    Rebuilt from the latest body (20260619120000_fn_attendance_roster.sql);
--    the ONLY change is the gate — role_has_institution_access OR
--    staff_teaches_in_institution, still ANDed with an attendance permission.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_attendance_roster(
  p_institution_id uuid,
  p_section_ids uuid[] DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_semester_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  roll_number text,
  student_photo_url text,
  institution_id uuid,
  degree_id uuid,
  program_id uuid,
  department_id uuid,
  semester_id uuid,
  section_id uuid,
  lifecycle_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the access checks that learners_profiles_select_policy
  -- would normally enforce MUST be replicated here. Gate on institution access + an
  -- attendance permission key (never on hardcoded role names).
  -- Updated 2026-07-06: staff_teaches_in_institution() admits visiting staff — a
  -- staff member assigned (via staff planning) to teach in an institution other
  -- than their own can load the roster there.
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (
      (
        role_has_institution_access(p_institution_id)
        OR staff_teaches_in_institution(p_institution_id)
      )
      AND (
        user_has_permission('academic.attendance.mark')
        OR user_has_permission('academic.attendance.view')
        OR user_has_permission('academic.attendance.reports')
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view the attendance roster for this institution'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lp.id,
    lp.first_name,
    lp.last_name,
    lp.roll_number,
    lp.student_photo_url,
    lp.institution_id,
    lp.degree_id,
    lp.program_id,
    lp.department_id,
    lp.semester_id,
    lp.section_id,
    lp.lifecycle_status::text
  FROM public.learners_profiles lp
  WHERE lp.lifecycle_status = 'active'
    AND lp.institution_id = p_institution_id
    AND (p_degree_id   IS NULL OR lp.degree_id   = p_degree_id)
    AND (p_program_id  IS NULL OR lp.program_id  = p_program_id)
    AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
    -- Department is intentionally NOT filtered: faculty can teach learners from other
    -- departments (subdivision groups / electives); section scoping already narrows rows.
    AND (p_section_ids IS NULL OR lp.section_id = ANY (p_section_ids))
  ORDER BY lp.first_name ASC, lp.last_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) IS
  'Returns active learner roster (roster columns only) for attendance marking. Gated by academic.attendance.mark/view/reports + institution access (role_has_institution_access OR staff_teaches_in_institution for visiting staff). Added 2026-06-19 (FIX 1); visiting-staff gate 2026-07-06.';

-- ============================================================================
-- 7) student_attendance: permission-gated visiting read/write path.
--    The existing write policy''s Path 1 already admits profiles.role='faculty'
--    with no institution scope, but visiting staff whose profile role is hod or
--    a custom role had no path. Gate on the attendance permission + an actual
--    teaching assignment in that institution.
-- ============================================================================
DROP POLICY IF EXISTS "student_attendance_select_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_select_visiting_teacher" ON public.student_attendance
FOR SELECT USING (
  user_has_permission('academic.attendance.mark')
  AND staff_teaches_in_institution(institution_id)
);

DROP POLICY IF EXISTS "student_attendance_insert_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_insert_visiting_teacher" ON public.student_attendance
FOR INSERT WITH CHECK (
  user_has_permission('academic.attendance.mark')
  AND staff_teaches_in_institution(institution_id)
);

DROP POLICY IF EXISTS "student_attendance_update_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_update_visiting_teacher" ON public.student_attendance
FOR UPDATE USING (
  user_has_permission('academic.attendance.mark')
  AND staff_teaches_in_institution(institution_id)
) WITH CHECK (
  user_has_permission('academic.attendance.mark')
  AND staff_teaches_in_institution(institution_id)
);
