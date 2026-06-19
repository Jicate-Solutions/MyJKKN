-- FIX 1 (BUG batch academic/attendance 2026-06-19): attendance-capable roles see an empty student list.
--
-- Root cause: learners_profiles_select_policy grants SELECT only to roles holding
-- learners.admissions.view / learners.profiles.view / learners.view. Faculty/HOD/
-- staff_counselor who can mark attendance but hold none of those keys get ZERO
-- students even on a fully-enrolled section (verified: MBA section with 47 active
-- learners returned empty for the faculty marking attendance).
--
-- Approach A (scoped SECURITY DEFINER RPC): expose ONLY the roster columns needed
-- to mark attendance, gated by an attendance permission + institution access, instead
-- of broadening the table-level RLS (which would expose every learners_profiles column
-- to anyone who can mark attendance). Table RLS is left unchanged.

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
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (
      role_has_institution_access(p_institution_id)
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

-- Supabase grants EXECUTE to anon by default for SECURITY DEFINER functions; a bare
-- REVOKE ... FROM PUBLIC is a no-op there. Revoke from anon explicitly, grant only to authenticated.
REVOKE EXECUTE ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) IS
  'Returns active learner roster (roster columns only) for attendance marking. Gated by academic.attendance.mark/view/reports + institution access. Lets attendance-capable roles read the roster without broadening learners_profiles table RLS. Added 2026-06-19 (FIX 1).';
