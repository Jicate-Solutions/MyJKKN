-- Migration: 2026-06-03 06:15
-- Purpose:
--   Fix the chart's per-date distribution for historical years 2024-25 and
--   2025-26. Director-flagged 2026-06-03: post-June-2025 admissions visible
--   in the source sheets don't appear in the 2025-26 trajectory line.
--
-- Root cause:
--   The 1,745 learners_profiles rows for 2025-26 cohort were bulk-migrated
--   into MyJKKN in Jan-April 2026. Their COALESCE(activated_at, created_at)
--   timestamps reflect the migration date, NOT the real admission date.
--   Verified:
--     2025-26 organic monthly distribution:
--       Dec 2025: 10, Jan 2026: 433, Feb 2026: 357, Mar 2026: 501, Apr 2026: 444
--     Sheet historical_pivot monthly distribution (the real timeline):
--       Feb 2025: 5, Mar 2025: 56, Apr 2025: 202, May 2025: 620, Jun 2025: 290,
--       Jul 2025: 168, Aug 2025: 100, Sep 2025: 44, Oct 2025: 19, Nov 2025: 37
--
--   My previous "organic wins" preference suppressed the historical_pivot
--   for tuples where organic also existed, so the chart was using the
--   bulk-migrated dates and showing all 2025-26 admissions clustering in
--   Jan-Apr 2026.
--
-- Fix:
--   For prior years (year < current cycle), prefer admission_historical_pivot
--   for date distribution where it exists. Fall back to organic only when no
--   sheet data for that (institution, program, year) tuple.
--
--   For current cycle (2026-27 today), keep organic-wins — that's real-time
--   captured data with correct timestamps.
--
-- Tier: function rewrite, signature unchanged. Backwards-compatible.

DROP FUNCTION IF EXISTS public.fn_yoy_admission_trajectory(uuid);
DROP FUNCTION IF EXISTS public.fn_yoy_excluded_courses(uuid);
DROP FUNCTION IF EXISTS public.fn_yoy_per_institution_trajectory(int, uuid);
DROP FUNCTION IF EXISTS public.fn_yoy_per_category_trajectory(uuid);

-- =============================================================================
-- Main trajectory RPC with historical-wins-for-prior-years preference
-- =============================================================================
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
  v_lifecycle text[];
  v_min_year_count int := 2;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay
  WHERE ay.is_active = true;

  IF v_current_year IS NULL THEN
    RETURN;
  END IF;

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
  -- Course inventory (for common-courses filter)
  organic_year_courses AS (
    SELECT DISTINCT
      ay.institution_id,
      pr.canonical_id AS program_id,
      ay.program_start_year
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = ANY(v_years)
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  historical_year_courses AS (
    SELECT DISTINCT
      ay.institution_id,
      pr.canonical_id AS program_id,
      ay.program_start_year
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = ANY(v_years)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  all_year_courses AS (
    SELECT * FROM organic_year_courses
    UNION
    SELECT * FROM historical_year_courses
  ),
  common_courses AS (
    SELECT institution_id, program_id
    FROM all_year_courses
    GROUP BY institution_id, program_id
    HAVING COUNT(DISTINCT program_start_year) >= v_min_year_count
  ),
  -- Daily emissions:
  --   * CURRENT cycle: organic only (real-time, correct timestamps)
  --   * PRIOR years: historical_pivot wins; organic fallback for tuples with
  --                  no sheet data
  organic_current AS (
    SELECT
      ay.program_start_year,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = pr.canonical_id
    WHERE ay.program_start_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.program_start_year, day_n
  ),
  historical_prior AS (
    SELECT
      ay.program_start_year,
      (hp.admission_date - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      SUM(hp.admitted_count)::bigint AS daily_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = pr.canonical_id
    WHERE ay.program_start_year = ANY(v_years)
      AND ay.program_start_year < v_current_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY ay.program_start_year, day_n
  ),
  organic_prior_fallback AS (
    -- Organic for prior years ONLY where no historical_pivot exists for the
    -- (institution, program, year) tuple. Catches programs that weren't in the
    -- sheets (e.g., Aided arts & sci 2025).
    SELECT
      ay.program_start_year,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = pr.canonical_id
    WHERE ay.program_start_year = ANY(v_years)
      AND ay.program_start_year < v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM admission_historical_pivot hp2
        JOIN admission_years ay2 ON ay2.id = hp2.admission_year_id
        JOIN program_resolution pr2 ON pr2.raw_id = ay2.program_id
        WHERE ay2.institution_id = ay.institution_id
          AND pr2.canonical_id = pr.canonical_id
          AND ay2.program_start_year = ay.program_start_year
      )
    GROUP BY ay.program_start_year, day_n
  ),
  combined_daily AS (
    SELECT * FROM organic_current
    UNION ALL
    SELECT * FROM historical_prior
    UNION ALL
    SELECT * FROM organic_prior_fallback
  ),
  daily_per_year AS (
    SELECT
      cd.program_start_year,
      cd.day_n,
      SUM(cd.daily_count)::bigint AS daily
    FROM combined_daily cd
    GROUP BY cd.program_start_year, cd.day_n
  )
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
  'Cumulative trajectory: current cycle uses organic learners_profiles (real-time timestamps); prior years prefer admission_historical_pivot (real admission dates from sheet) over the bulk-migrated organic timestamps; fall back to organic for prior-year tuples with no sheet data.';

REVOKE ALL ON FUNCTION public.fn_yoy_admission_trajectory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_admission_trajectory(uuid) TO authenticated;


-- =============================================================================
-- Excluded courses RPC (no logic change — just same -SH + lifecycle pattern)
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
  v_lifecycle text[];
  v_min_year_count int := 2;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

  SELECT MAX(ay.program_start_year) INTO v_current_year
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
      ay.program_start_year
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = ANY(v_years)
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  historical_year_courses AS (
    SELECT DISTINCT
      ay.institution_id,
      pr.canonical_id AS program_id,
      ay.program_start_year
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
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
      ELSE 'unknown_reason'::text
    END AS exclusion_reason
  FROM course_year_set cys
  JOIN institutions i ON i.id = cys.institution_id
  JOIN programs p ON p.id = cys.program_id
  WHERE ARRAY_LENGTH(cys.years_with_data, 1) < v_min_year_count
  ORDER BY i.name, p.program_name;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_yoy_excluded_courses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_excluded_courses(uuid) TO authenticated;


-- =============================================================================
-- Per-institution trajectory RPC (apply same historical-wins logic)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_yoy_per_institution_trajectory(
  p_year int,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_institution_id uuid,
  out_institution_name text,
  out_day_n int,
  out_cumulative_admitted bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lifecycle text[];
  v_current_year int;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();
  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;

  RETURN QUERY
  WITH
  program_resolution AS (
    SELECT p.id AS raw_id, p.institution_id, COALESCE(base.id, p.id) AS canonical_id
    FROM programs p
    LEFT JOIN programs base
      ON base.institution_id = p.institution_id
     AND base.program_id = REPLACE(p.program_id, '-SH', '')
     AND p.program_id LIKE '%-SH'
     AND base.program_id NOT LIKE '%-SH'
  ),
  organic_current AS (
    SELECT
      ay.institution_id,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = p_year
      AND p_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.institution_id, day_n
  ),
  historical_prior AS (
    SELECT
      ay.institution_id,
      (hp.admission_date - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      SUM(hp.admitted_count)::bigint AS daily_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = p_year
      AND p_year < v_current_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY ay.institution_id, day_n
  ),
  organic_prior_fallback AS (
    SELECT
      ay.institution_id,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = p_year
      AND p_year < v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM admission_historical_pivot hp2
        JOIN admission_years ay2 ON ay2.id = hp2.admission_year_id
        JOIN program_resolution pr2 ON pr2.raw_id = ay2.program_id
        WHERE ay2.institution_id = ay.institution_id
          AND pr2.canonical_id = pr.canonical_id
          AND ay2.program_start_year = ay.program_start_year
      )
    GROUP BY ay.institution_id, day_n
  ),
  combined AS (
    SELECT * FROM organic_current
    UNION ALL
    SELECT * FROM historical_prior
    UNION ALL
    SELECT * FROM organic_prior_fallback
  ),
  daily_per_inst AS (
    SELECT institution_id, day_n, SUM(daily_count)::bigint AS daily
    FROM combined GROUP BY institution_id, day_n
  )
  SELECT
    dpi.institution_id,
    i.name::text,
    dpi.day_n,
    SUM(dpi.daily) OVER (PARTITION BY dpi.institution_id ORDER BY dpi.day_n)::bigint
  FROM daily_per_inst dpi
  JOIN institutions i ON i.id = dpi.institution_id
  ORDER BY i.name, dpi.day_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_yoy_per_institution_trajectory(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_per_institution_trajectory(int, uuid) TO authenticated;


-- =============================================================================
-- Per-category trajectory RPC (apply same historical-wins logic)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_yoy_per_category_trajectory(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_category text,
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
  v_lifecycle text[];
  v_current_year int;
  v_years int[];
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();
  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;
  v_years := ARRAY[v_current_year - 2, v_current_year - 1, v_current_year];

  RETURN QUERY
  WITH
  program_resolution AS (
    SELECT p.id AS raw_id, p.institution_id, p.program_name,
           COALESCE(base.id, p.id) AS canonical_id
    FROM programs p
    LEFT JOIN programs base
      ON base.institution_id = p.institution_id
     AND base.program_id = REPLACE(p.program_id, '-SH', '')
     AND p.program_id LIKE '%-SH'
     AND base.program_id NOT LIKE '%-SH'
  ),
  organic_current_raw AS (
    SELECT
      public._yoy_program_category(i.name, pr.program_name) AS category,
      ay.program_start_year,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    JOIN institutions i ON i.id = ay.institution_id
    WHERE ay.program_start_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
  ),
  organic_current AS (
    SELECT category, program_start_year, day_n, COUNT(*)::bigint AS daily_count
    FROM organic_current_raw
    GROUP BY category, program_start_year, day_n
  ),
  historical_prior_raw AS (
    SELECT
      public._yoy_program_category(i.name, pr.program_name) AS category,
      ay.program_start_year,
      (hp.admission_date - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      hp.admitted_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    JOIN institutions i ON i.id = ay.institution_id
    WHERE ay.program_start_year = ANY(v_years)
      AND ay.program_start_year < v_current_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  historical_prior AS (
    SELECT category, program_start_year, day_n, SUM(admitted_count)::bigint AS daily_count
    FROM historical_prior_raw
    GROUP BY category, program_start_year, day_n
  ),
  organic_prior_fallback_raw AS (
    SELECT
      public._yoy_program_category(i.name, pr.program_name) AS category,
      ay.program_start_year,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    JOIN institutions i ON i.id = ay.institution_id
    WHERE ay.program_start_year = ANY(v_years)
      AND ay.program_start_year < v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM admission_historical_pivot hp2
        JOIN admission_years ay2 ON ay2.id = hp2.admission_year_id
        JOIN program_resolution pr2 ON pr2.raw_id = ay2.program_id
        WHERE ay2.institution_id = ay.institution_id
          AND pr2.canonical_id = pr.canonical_id
          AND ay2.program_start_year = ay.program_start_year
      )
  ),
  organic_prior_fallback AS (
    SELECT category, program_start_year, day_n, COUNT(*)::bigint AS daily_count
    FROM organic_prior_fallback_raw
    GROUP BY category, program_start_year, day_n
  ),
  combined AS (
    SELECT * FROM organic_current
    UNION ALL
    SELECT * FROM historical_prior
    UNION ALL
    SELECT * FROM organic_prior_fallback
  ),
  daily_per_cat_year AS (
    SELECT category, program_start_year, day_n, SUM(daily_count)::bigint AS daily
    FROM combined GROUP BY category, program_start_year, day_n
  )
  SELECT
    dcy.category,
    dcy.program_start_year,
    dcy.day_n,
    SUM(dcy.daily) OVER (PARTITION BY dcy.category, dcy.program_start_year ORDER BY dcy.day_n)::bigint
  FROM daily_per_cat_year dcy
  ORDER BY dcy.category, dcy.program_start_year, dcy.day_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_yoy_per_category_trajectory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_per_category_trajectory(uuid) TO authenticated;
