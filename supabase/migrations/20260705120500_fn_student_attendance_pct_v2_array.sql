-- 2026-07-05 - fn_student_attendance_pct v2 (array input, scope-filtered merge)
-- Supersedes the single-uuid version (migration 20260704161500). "Split" colleges
-- fan out to several MyJKKN institution ids (COE institutions.myjkkn_institution_ids[]),
-- so the insight now totals attendance across ALL of a college's halves.
--
-- SECURITY: SECURITY DEFINER, but it aggregates ONLY the ids the caller may access:
-- super-admins keep every id; everyone else keeps only ids passing
-- role_has_institution_access(). NULL ids are dropped explicitly (role_has_institution_access(NULL)
-- returns TRUE, which would otherwise be a cross-tenant leak). anon EXECUTE revoked.

-- Drop the old single-uuid overload so the array version is unambiguous (avoids PGRST203).
DROP FUNCTION IF EXISTS public.fn_student_attendance_pct(uuid);

CREATE OR REPLACE FUNCTION public.fn_student_attendance_pct(p_institution_ids uuid[])
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
DECLARE
  v_ids uuid[];
BEGIN
  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_institution_ids is required';
  END IF;

  -- Keep only ids the caller is allowed to see. Super-admins keep all; NULL ids
  -- are dropped (role_has_institution_access(NULL)=TRUE would leak otherwise).
  IF is_super_admin() THEN
    SELECT array_agg(x) INTO v_ids
    FROM unnest(p_institution_ids) AS x
    WHERE x IS NOT NULL;
  ELSE
    SELECT array_agg(x) INTO v_ids
    FROM unnest(p_institution_ids) AS x
    WHERE x IS NOT NULL AND role_has_institution_access(x);
  END IF;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN; -- caller can access none of the requested institutions
  END IF;

  RETURN QUERY
  WITH periods AS (
    SELECT val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = ANY(v_ids)
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

REVOKE EXECUTE ON FUNCTION public.fn_student_attendance_pct(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_student_attendance_pct(uuid[]) TO authenticated;
