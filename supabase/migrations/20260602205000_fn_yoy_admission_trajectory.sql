-- Migration: 2026-06-02 20:50
-- Purpose:
--   RPC fn_yoy_admission_trajectory powers the YoY chart on
--   /admission/group-dashboard?tab=seats (new YoY sub-tab in PR 4).
--
--   Returns the cumulative admitted-count trajectory for the current cycle
--   PLUS the 2 prior cycles, with each year as a separate line on the chart.
--   X-axis is day-N-of-cycle anchored to April 1 of program_start_year
--   (Director-locked anchor — admissions before April 1 land on negative
--   day-N).
--
-- Locked decisions from 2026-06-02 interview:
--   • Chart shape: 3 overlaid lines (cumulative admitted vs day-N)
--   • Day 0: April 1 of cohort's program_start_year
--   • Source preference: organic learners_profiles wins; admission_historical_pivot
--     is fallback for (institution, program, year) tuples with no organic data
--     (e.g., 2024-25 cohort where Arts & Sci Aided / B.Ed / Nursing weren't
--     migrated to MyJKKN)
--   • Common-courses filter: only courses present in ALL 3 years contribute
--     to the trajectory totals
--   • Lifecycle filter (organic side): IN ('admitted','active','graduated')
--     matches existing fn_seat_analytics_daily_pivot RPC
--   • Auto-roll-forward: comparison set = MAX(program_start_year WHERE
--     is_active=true) and 2 prior
--   • Scope: optional p_institution_id; group-wide when NULL
--
-- Returns one row per (program_start_year, day_n) — chart consumer pivots
-- this into 3 series. Cumulative_admitted is monotonically non-decreasing
-- within each year EXCEPT where a cancellation cell on historical_pivot
-- subtracts (honest data).
--
-- Excluded-courses companion view (fn_yoy_excluded_courses) returns programs
-- that were filtered out by the common-courses intersection — chart uses
-- this to render the BDS placeholder line (Director-locked behavior for
-- programs tracked outside MyJKKN like TN MCC state counselling).

-- DROPs first because CREATE OR REPLACE can't change OUT parameter names,
-- and these functions use out_-prefixed params to avoid ambiguity with
-- admission_years.program_start_year column reference inside the CTEs.
DROP FUNCTION IF EXISTS public.fn_yoy_admission_trajectory(uuid);
DROP FUNCTION IF EXISTS public.fn_yoy_excluded_courses(uuid);

CREATE OR REPLACE FUNCTION public.fn_yoy_admission_trajectory(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_year int,
  out_day_n int,
  out_cumulative_admitted bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_year int;
  v_years int[];
BEGIN
  -- Auto-roll: current cycle = MAX program_start_year that is_active.
  -- v_years = [current-2, current-1, current]
  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay
  WHERE ay.is_active = true;

  IF v_current_year IS NULL THEN
    RETURN;
  END IF;

  v_years := ARRAY[v_current_year - 2, v_current_year - 1, v_current_year];

  RETURN QUERY
  WITH
  -- Step 1: enumerate (institution, program, year) tuples that have ANY
  -- admission data in either source for the 3 comparison years.
  organic_year_courses AS (
    SELECT DISTINCT ay.institution_id, ay.program_id, ay.program_start_year
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.program_start_year = ANY(v_years)
      AND lp.lifecycle_status IN ('admitted', 'active', 'graduated')
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  historical_year_courses AS (
    SELECT DISTINCT ay.institution_id, ay.program_id, ay.program_start_year
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.program_start_year = ANY(v_years)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  all_year_courses AS (
    SELECT * FROM organic_year_courses
    UNION
    SELECT * FROM historical_year_courses
  ),
  -- Step 2: common-courses = present in ALL years in v_years
  common_courses AS (
    SELECT institution_id, program_id
    FROM all_year_courses
    GROUP BY institution_id, program_id
    HAVING COUNT(DISTINCT program_start_year) = ARRAY_LENGTH(v_years, 1)
  ),
  -- Step 3a: per-day organic admissions for common courses
  organic_daily AS (
    SELECT
      ay.program_start_year,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = ay.program_id
    WHERE ay.program_start_year = ANY(v_years)
      AND lp.lifecycle_status IN ('admitted', 'active', 'graduated')
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.program_start_year, day_n
  ),
  -- Step 3b: per-day historical admissions for common courses — fallback path.
  -- Only contribute rows from (institution, program, year) tuples that have
  -- NO organic learners_profiles rows (organic always wins per "DB is source
  -- of truth" decision). Prevents double-counting when both sources have data.
  historical_daily AS (
    SELECT
      ay.program_start_year,
      (hp.admission_date - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      SUM(hp.admitted_count)::bigint AS daily_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = ay.program_id
    WHERE ay.program_start_year = ANY(v_years)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND NOT EXISTS (
        SELECT 1
        FROM learners_profiles lp2
        JOIN admission_years ay2 ON ay2.id = lp2.admission_year_id
        WHERE ay2.institution_id = ay.institution_id
          AND ay2.program_id = ay.program_id
          AND ay2.program_start_year = ay.program_start_year
          AND lp2.lifecycle_status IN ('admitted', 'active', 'graduated')
      )
    GROUP BY ay.program_start_year, day_n
  ),
  -- Step 4: combine both source streams; aggregate per (year, day_n)
  combined_daily AS (
    SELECT * FROM organic_daily
    UNION ALL
    SELECT * FROM historical_daily
  ),
  daily_per_year AS (
    SELECT
      cd.program_start_year,
      cd.day_n,
      SUM(cd.daily_count)::bigint AS daily
    FROM combined_daily cd
    GROUP BY cd.program_start_year, cd.day_n
  )
  -- Step 5: cumulative window per year, ordered by day_n
  SELECT
    dpy.program_start_year,
    dpy.day_n,
    SUM(dpy.daily) OVER (
      PARTITION BY dpy.program_start_year
      ORDER BY dpy.day_n
    )::bigint AS cumulative
  FROM daily_per_year dpy
  ORDER BY dpy.program_start_year, dpy.day_n;
END;
$$;

COMMENT ON FUNCTION public.fn_yoy_admission_trajectory(uuid) IS
  'Cumulative admitted trajectory for current cycle + 2 prior years. X-axis is day-N-of-cycle (April 1 anchor of program_start_year). UNIONs learners_profiles (organic) with admission_historical_pivot (sheet-imported). Common-courses-only filter applied.';

REVOKE ALL ON FUNCTION public.fn_yoy_admission_trajectory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_admission_trajectory(uuid) TO authenticated;


-- =============================================================================
-- Companion: fn_yoy_excluded_courses
-- Returns the courses that the common-courses filter excluded from the
-- trajectory — used by the chart to render the BDS placeholder line and any
-- other "tracked outside MyJKKN" programs Director adds later.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_yoy_excluded_courses(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_institution_id uuid,
  out_institution_name text,
  out_program_id uuid,
  out_program_name text,
  out_years_with_data int[],
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
BEGIN
  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay
  WHERE ay.is_active = true;

  IF v_current_year IS NULL THEN
    RETURN;
  END IF;

  v_years := ARRAY[v_current_year - 2, v_current_year - 1, v_current_year];

  RETURN QUERY
  WITH
  organic_year_courses AS (
    SELECT DISTINCT ay.institution_id, ay.program_id, ay.program_start_year
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.program_start_year = ANY(v_years)
      AND lp.lifecycle_status IN ('admitted', 'active', 'graduated')
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  historical_year_courses AS (
    SELECT DISTINCT ay.institution_id, ay.program_id, ay.program_start_year
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.program_start_year = ANY(v_years)
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
      ARRAY_AGG(DISTINCT ayc.program_start_year ORDER BY ayc.program_start_year) AS years_with_data
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
      WHEN ARRAY_LENGTH(cys.years_with_data, 1) = 2 THEN 'two_years_only'::text
      ELSE 'unknown_reason'::text
    END AS exclusion_reason
  FROM course_year_set cys
  JOIN institutions i ON i.id = cys.institution_id
  JOIN programs p ON p.id = cys.program_id
  WHERE ARRAY_LENGTH(cys.years_with_data, 1) < ARRAY_LENGTH(v_years, 1)
  ORDER BY i.name, p.program_name;
END;
$$;

COMMENT ON FUNCTION public.fn_yoy_excluded_courses(uuid) IS
  'Companion to fn_yoy_admission_trajectory: returns programs filtered out by the common-courses intersection. Chart uses this to render the BDS-style placeholder line for programs tracked outside MyJKKN.';

REVOKE ALL ON FUNCTION public.fn_yoy_excluded_courses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_excluded_courses(uuid) TO authenticated;
