-- 2026-07-04 - fn_student_attendance_pct
-- Per-student attendance % for one institution, computed from
-- student_attendance.attendance_data (a JSONB of period -> {students:[{status, student_id}]}).
-- Powers the Attendance-vs-Internal-Marks insight (/api/internal-marks/attendance-insight):
-- MyJKKN is the sole system of record for attendance, so this rollup is computed here and
-- joined to COE CIA marks by the shared learners_profiles.id.
--
-- SECURITY DEFINER so it can read student_attendance across the institution, but it enforces
-- the caller's institution scope internally (is_super_admin OR role_has_institution_access),
-- mirroring the platform RLS pattern. anon EXECUTE is explicitly revoked (Supabase grants it
-- by default on every new function).

CREATE OR REPLACE FUNCTION public.fn_student_attendance_pct(p_institution_id uuid)
RETURNS TABLE (
  student_id uuid,
  present    integer,
  total      integer,
  pct        numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'p_institution_id is required';
  END IF;

  -- Institution scope: super admins see any institution; everyone else only the
  -- institutions their role grants. p_institution_id is NOT NULL here, so the
  -- role_has_institution_access(NULL)=TRUE edge case cannot apply.
  IF NOT (is_super_admin() OR role_has_institution_access(p_institution_id)) THEN
    RAISE EXCEPTION 'Forbidden: no access to institution %', p_institution_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH periods AS (
    SELECT val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = p_institution_id
      AND jsonb_typeof(sa.attendance_data) = 'object'
  ),
  studs AS (
    SELECT (s->>'student_id')::uuid AS sid,
           CASE WHEN lower(s->>'status') = 'present' THEN 1 ELSE 0 END AS is_present
    FROM periods p,
         LATERAL jsonb_array_elements(p.period->'students') AS s
    WHERE p.period ? 'students'
      AND (s->>'student_id') IS NOT NULL
      AND (s->>'student_id') <> ''
  )
  SELECT sid AS student_id,
         SUM(is_present)::int AS present,
         COUNT(*)::int AS total,
         ROUND(100.0 * SUM(is_present) / NULLIF(COUNT(*), 0), 1) AS pct
  FROM studs
  GROUP BY sid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_student_attendance_pct(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_student_attendance_pct(uuid) TO authenticated;
