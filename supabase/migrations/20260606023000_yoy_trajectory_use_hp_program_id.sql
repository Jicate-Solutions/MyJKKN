-- Migration: 2026-06-06 02:30 IST
-- Purpose:
--   Update fn_yoy_admission_trajectory to use the restored
--   admission_historical_pivot.program_id (added via migration
--   20260606022000) so the trajectory chart's "common-courses" filter
--   considers historical sheet data per program, not just organic
--   learners_profiles data.
--
-- Before this migration:
--   common_courses filter = organic_year_courses with COUNT(DISTINCT yr) >= 2
--   → only programs with ORGANIC learner records in 2+ of 3 years pass
--   → PG/specialty programs with first-cycle organic in 2026 only fail
--     (they had 2024+2025 in sheet data but program identity was erased
--     by today's schema collapse)
--
-- After this migration:
--   common_courses filter = (organic_year_courses ∪ historical_year_courses)
--   with COUNT(DISTINCT yr) >= 2 → programs with historical sheet data in
--   prior years + organic data in current year now pass.
--
-- Side fix: organic_prior_fallback's NOT EXISTS check changes from per-
-- (institution, year) to per-(institution, program, year) — now that HP
-- has program identity, the fallback should kick in only for programs
-- that genuinely lack their own historical data, not the whole institution.
--
-- Director-locked 2026-06-06 02:00 IST after surfacing 18 PG specialty
-- programs (MSC Nursing × 6, MPHARM × 6, PHARM D PB, BSC Allied Health × 9)
-- that should appear in trajectory but didn't.

DROP FUNCTION IF EXISTS public.fn_yoy_admission_trajectory(uuid);

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

  SELECT MAX(ay.year) INTO v_current_year
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
      ay.year AS yr
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    WHERE ay.year = ANY(v_years)
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  ),
  historical_year_courses AS (
    -- NEW: programs visible per-year from historical sheet data
    -- (post-restoration of HP.program_id via migration 20260606022000).
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
  common_courses AS (
    SELECT institution_id, program_id
    FROM all_year_courses
    GROUP BY institution_id, program_id
    HAVING COUNT(DISTINCT yr) >= v_min_year_count
  ),
  common_institutions AS (
    SELECT DISTINCT institution_id FROM common_courses
  ),
  organic_current AS (
    SELECT
      ay.year AS yr,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = pr.canonical_id
    WHERE ay.year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.year, day_n
  ),
  historical_prior AS (
    -- Per-program historical, filtered to common_courses (programs that
    -- pass the 2-of-3 filter via organic OR historical attribution).
    SELECT
      ay.year AS yr,
      (hp.admission_date - make_date(ay.year, 4, 1))::int AS day_n,
      SUM(hp.admitted_count)::bigint AS daily_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = hp.program_id
    WHERE ay.year = ANY(v_years)
      AND ay.year < v_current_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY ay.year, day_n
  ),
  organic_prior_fallback AS (
    -- For programs that genuinely lack historical sheet data (e.g., new
    -- programs created after sheet era), fall back to organic for prior
    -- years. NOT EXISTS check is now per-(program, year), not per-
    -- (institution, year).
    SELECT
      ay.year AS yr,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = lp.program_id
    JOIN common_courses cc
      ON cc.institution_id = ay.institution_id
     AND cc.program_id = pr.canonical_id
    WHERE ay.year = ANY(v_years)
      AND ay.year < v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM admission_historical_pivot hp2
        JOIN admission_years ay2 ON ay2.id = hp2.admission_year_id
        WHERE ay2.institution_id = ay.institution_id
          AND ay2.year = ay.year
          AND hp2.program_id = pr.canonical_id
      )
    GROUP BY ay.year, day_n
  ),
  combined_daily AS (
    SELECT * FROM organic_current
    UNION ALL
    SELECT * FROM historical_prior
    UNION ALL
    SELECT * FROM organic_prior_fallback
  ),
  daily_per_year AS (
    SELECT cd.yr, cd.day_n, SUM(cd.daily_count)::bigint AS daily
    FROM combined_daily cd
    GROUP BY cd.yr, cd.day_n
  )
  SELECT
    dpy.yr,
    dpy.day_n,
    SUM(dpy.daily) OVER (
      PARTITION BY dpy.yr
      ORDER BY dpy.day_n
    )::bigint AS cumulative
  FROM daily_per_year dpy
  ORDER BY dpy.yr, dpy.day_n;
END;
$$;

-- Defense-in-depth: explicit REVOKE FROM anon per CLAUDE.md standing rule
-- (enforced going forward via feedback_supabase_anon_execute_default_grant).
REVOKE EXECUTE ON FUNCTION public.fn_yoy_admission_trajectory(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_admission_trajectory(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_yoy_admission_trajectory(uuid) IS
  'YoY admission trajectory chart RPC. Programs enter via (organic OR historical) in >= 2 of 3 years. Per-program historical via HP.program_id (added 2026-06-06). Director-locked.';
