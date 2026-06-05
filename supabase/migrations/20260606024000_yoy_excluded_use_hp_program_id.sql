-- Migration: 2026-06-06 02:40 IST
-- Purpose:
--   Mirror the trajectory RPC's common-courses logic in
--   fn_yoy_excluded_courses so the "Programs not in trajectory" panel is
--   consistent with the actual chart. Without this, Director sees the 18
--   PG specialty programs in both the chart (now correctly included) AND
--   the excluded panel (still using organic-only logic).
--
-- Same algorithm as fn_yoy_admission_trajectory:
--   course_year_set = organic_year_courses ∪ historical_year_courses
--   excluded = courses with COUNT(DISTINCT yr) < v_min_year_count

DROP FUNCTION IF EXISTS public.fn_yoy_excluded_courses(uuid);

CREATE OR REPLACE FUNCTION public.fn_yoy_excluded_courses(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_institution_id uuid,
  out_institution_name text,
  out_program_id uuid,
  out_program_name text,
  out_years_with_data integer[],
  out_exclusion_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_year int;
  v_years int[];
  v_lifecycle text[];
  v_min_year_count int := 2;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay
  WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;

  v_years := ARRAY[v_current_year - 2, v_current_year - 1, v_current_year];

  RETURN QUERY
  WITH
  program_resolution AS (
    SELECT
      p.id AS raw_id,
      p.institution_id,
      COALESCE(base.id, p.id) AS canonical_id
    FROM programs p
    LEFT JOIN programs base
      ON base.institution_id = p.institution_id
     AND base.program_id = REPLACE(p.program_id, '-SH', '')
     AND p.program_id LIKE '%-SH'
     AND base.program_id NOT LIKE '%-SH'
  ),
  organic_year_courses AS (
    SELECT DISTINCT
      ay.institution_id,
      pr.canonical_id AS program_id,
      ay.year AS yr
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    WHERE ay.year = ANY(v_years)
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  historical_year_courses AS (
    SELECT DISTINCT
      ay.institution_id,
      hp.program_id,
      ay.year AS yr
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.year = ANY(v_years)
      AND hp.program_id IS NOT NULL
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  all_year_courses AS (
    SELECT * FROM organic_year_courses
    UNION
    SELECT * FROM historical_year_courses
  ),
  course_year_set AS (
    SELECT
      ayc.institution_id,
      ayc.program_id,
      ARRAY_AGG(DISTINCT ayc.yr ORDER BY ayc.yr) AS years_with_data
    FROM all_year_courses ayc
    GROUP BY ayc.institution_id, ayc.program_id
  )
  SELECT
    cys.institution_id,
    i.name::text AS institution_name,
    cys.program_id,
    p.program_name::text AS program_name,
    cys.years_with_data,
    CASE
      WHEN ARRAY_LENGTH(cys.years_with_data, 1) = 1 THEN 'single_year_only'::text
      ELSE 'unknown_reason'::text
    END AS exclusion_reason
  FROM course_year_set cys
  JOIN institutions i ON i.id = cys.institution_id
  JOIN programs p ON p.id = cys.program_id
  WHERE ARRAY_LENGTH(cys.years_with_data, 1) < v_min_year_count
  ORDER BY i.name, p.program_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_yoy_excluded_courses(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_excluded_courses(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_yoy_excluded_courses(uuid) IS
  'Excluded-from-trajectory programs (paired with fn_yoy_admission_trajectory). Inclusion considers organic AND historical via HP.program_id. Director-locked 2026-06-06.';
