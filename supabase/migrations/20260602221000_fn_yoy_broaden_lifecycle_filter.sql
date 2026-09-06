-- Migration: 2026-06-02 22:10
-- Purpose:
--   Director-flagged from PR #1214 deployment: engineering programs still
--   appeared in the "Programs not in trajectory" panel even after the -SH
--   dedup fix, because the strict lifecycle filter excludes most cohort-2026
--   learners who haven't yet been moved to 'admitted' status.
--
--   2026-27 cohort lifecycle breakdown (per discovery 2026-06-02):
--     account            411  ← funnel-stage, paid nothing yet
--     reserved           312  ← paid reservation fee, financial commitment
--     enquiry_submitted  186  ← submitted application
--     admitted             9  ← formally admitted
--     approved             1
--     active               1  ← graduated through cycle
--     enquiry              4
--     rejected             7
--     inactive             1
--   Total: 932 learners in cohort
--
--   With the OLD strict filter (admitted/active/graduated), only 10 of 932
--   counted → engineering programs looked empty in 2026 → excluded by
--   common-courses filter.
--
-- Fix:
--   Broaden the lifecycle filter to include account + reserved + admitted +
--   active + graduated + enquiry_submitted (Director-locked 2026-06-02).
--   Picks up 919 of 932 cohort-2026 learners (everyone except 'enquiry' /
--   'rejected' / 'inactive' which are non-pursuing states).
--
--   This brings engineering programs back into the trajectory and means the
--   YoY chart reflects the FUNNEL view of admissions — matching what
--   Director and counselors see on the dashboard's Reserved / Fees Pending
--   / Admitted KPI strip.
--
-- Tier: function rewrite, backwards-compatible signature.

DROP FUNCTION IF EXISTS public.fn_yoy_admission_trajectory(uuid);
DROP FUNCTION IF EXISTS public.fn_yoy_excluded_courses(uuid);

-- Shared lifecycle-set constant. Kept as a SQL fn so future broadening (or
-- per-year variation) edits the rule in one place instead of two.
CREATE OR REPLACE FUNCTION public._yoy_admitted_lifecycle_set()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'admitted', 'active', 'graduated',
    'account', 'reserved', 'enquiry_submitted'
  ];
$$;

COMMENT ON FUNCTION public._yoy_admitted_lifecycle_set() IS
  'Lifecycle statuses counted as ''admitted'' for the YoY chart. Broader than fn_seat_analytics_daily_pivot''s strict filter to account for early-cycle funnel stages (Director-locked 2026-06-02).';


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
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
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
          AND lp2.lifecycle_status::text = ANY(v_lifecycle)
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
  'Cumulative admitted trajectory for current cycle + 2 prior years. April 1 day-0 anchor. UNIONs learners_profiles + admission_historical_pivot, with -SH program merge and a broader lifecycle filter (account/reserved/enquiry_submitted/admitted/active/graduated) to include funnel-stage commitments. Common-courses-only.';

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
  v_lifecycle text[];
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
  'Companion to fn_yoy_admission_trajectory. Same -SH merge + broader lifecycle filter so funnel-stage 2026 learners count toward "course present in year N".';

REVOKE ALL ON FUNCTION public.fn_yoy_excluded_courses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_excluded_courses(uuid) TO authenticated;
