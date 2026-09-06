-- Migration: 2026-06-02 21:55
-- Purpose:
--   Fix the engineering-program duplication in the YoY chart's "Programs not
--   in trajectory" panel.
--
--   Root cause:
--     Engineering programs in MyJKKN's schema have TWO program_ids each:
--       Base code:    CSE / EEE / ECE / MECH / IT
--       Shared-first: CSE-SH / EEE-SH / ECE-SH / MECH-SH / IT-SH
--     Per existing fn_seat_analytics_daily_pivot, the -SH variants represent
--     the first-year shared-section pool that later merges into the base
--     program. They share the same program_name in DB.
--
--     Historical-pivot import (2024-25 + 2025-26) sat on the BASE codes;
--     organic learners_profiles data (2026-27) sits mostly on the -SH codes
--     (e.g., CSE-SH=57 organic 2026 learners vs base CSE=2). Common-courses
--     filter saw them as different programs and excluded BOTH variants,
--     producing the duplicate entries Director flagged in the screenshot.
--
--   Fix:
--     Resolve every (institution, program) tuple through a program_resolution
--     CTE that maps <NAME>-SH → <NAME> (matching pattern from
--     fn_seat_analytics_daily_pivot). Both RPCs now aggregate at the
--     canonical program level so SH variants merge into base.
--
-- Tier: function rewrite (TIER-3 by the migration-notification protocol),
-- backwards-compatible — same signatures, same OUT column names. Only the
-- internal aggregation rule changes.

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
  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay
  WHERE ay.is_active = true;

  IF v_current_year IS NULL THEN
    RETURN;
  END IF;

  v_years := ARRAY[v_current_year - 2, v_current_year - 1, v_current_year];

  RETURN QUERY
  WITH
  -- Resolve every program to its canonical (non-SH) UUID. Engineering -SH
  -- variants point to the base; everything else points to itself.
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
      AND lp.lifecycle_status IN ('admitted', 'active', 'graduated')
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
    HAVING COUNT(DISTINCT program_start_year) = ARRAY_LENGTH(v_years, 1)
  ),
  organic_daily AS (
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
      AND lp.lifecycle_status IN ('admitted', 'active', 'graduated')
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.program_start_year, day_n
  ),
  historical_daily AS (
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
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND NOT EXISTS (
        SELECT 1
        FROM learners_profiles lp2
        JOIN admission_years ay2 ON ay2.id = lp2.admission_year_id
        JOIN program_resolution pr2 ON pr2.raw_id = ay2.program_id
        WHERE ay2.institution_id = ay.institution_id
          AND pr2.canonical_id = pr.canonical_id
          AND ay2.program_start_year = ay.program_start_year
          AND lp2.lifecycle_status IN ('admitted', 'active', 'graduated')
      )
    GROUP BY ay.program_start_year, day_n
  ),
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
  'Cumulative admitted trajectory for current cycle + 2 prior years. X-axis is day-N-of-cycle (April 1 anchor). UNIONs learners_profiles + admission_historical_pivot, with -SH program variants merged into their base programs (matching fn_seat_analytics_daily_pivot pattern). Common-courses-only filter applied.';

REVOKE ALL ON FUNCTION public.fn_yoy_admission_trajectory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_admission_trajectory(uuid) TO authenticated;


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
  -- Same -SH resolution as fn_yoy_admission_trajectory so excluded list is
  -- deduplicated by canonical program (no more duplicate "B.E. EEE" entries).
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
      AND lp.lifecycle_status IN ('admitted', 'active', 'graduated')
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
  'Companion to fn_yoy_admission_trajectory: programs filtered out by the common-courses intersection. -SH variants resolved to base programs so each program appears at most once per institution.';

REVOKE ALL ON FUNCTION public.fn_yoy_excluded_courses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_excluded_courses(uuid) TO authenticated;
