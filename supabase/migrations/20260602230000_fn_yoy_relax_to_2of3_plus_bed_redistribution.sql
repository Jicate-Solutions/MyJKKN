-- Migration: 2026-06-02 23:00
-- Purpose:
--   Two Director-locked refinements to the YoY chart:
--
--   FIX 1 — B.Ed pedagogy redistribution:
--     The 'B.Ed (Historical Aggregate)' placeholder program holds the 2024
--     + 2025 sheet historical (100 admitted/year, 200 total). 2026 organic
--     admissions land on 4 pedagogy-specific programs (Physical Sci=2,
--     Economics=1, Computer Sci=1, Biological=1; 7 other pedagogies have 0).
--     This left B.Ed pedagogies in the "Programs not in trajectory" panel
--     because the aggregate and the pedagogies have different program_ids.
--
--     Director-locked: redistribute the 200 historical admissions across the
--     4 active pedagogies proportionally to their 2026 ratios (40/20/20/20).
--     7 inactive pedagogies receive 0. The aggregate program no longer
--     carries pivot rows after migration.
--
--   FIX 2 — Relax common-courses filter to 2-of-3 years:
--     PG specialties (MPHARM, MDS, M.Sc. specialty programs) have substantial
--     2024 + 2025 admissions but NO 2026 yet (TN counselling cycle hasn't
--     opened them). Strict 3-of-3 excluded them. Director-locked: relax to
--     2-of-3 — programs with data in 2 of 3 years now contribute. Lines for
--     the missing year sit at the prior cumulative value (no double-dip).
--
-- Tier: data migration + function rewrite. Backwards-compatible signatures.
-- Reversible: redistribution rows are sourced 'b_ed_pedagogy_redistribute';
-- can be deleted + aggregate restored if reverted.

-- =============================================================================
-- FIX 1: B.Ed historical redistribution
-- =============================================================================

-- Step 1a: Ensure admission_years rows exist for the 4 active pedagogies in
-- 2024 + 2025 (so the historical pivot rows can attach to them).
INSERT INTO admission_years (
  institution_id,
  program_id,
  program_start_year,
  program_end_year,
  admission_year_name,
  sanctioned_intake,
  is_active
)
SELECT
  '9380358f-7020-4c23-89c3-e9538b47cf33'::uuid AS institution_id,
  pedagogy.program_id,
  yr.year AS program_start_year,
  yr.year + 2 AS program_end_year,
  yr.year::text || '-' || (yr.year + 1)::text AS admission_year_name,
  0 AS sanctioned_intake,
  false AS is_active
FROM (VALUES
  ('c3ac44db-6cfd-4a7d-948e-95977ca2234d'::uuid),  -- Physical Science
  ('149ac1a4-c6f0-415f-b343-96e9a1d87023'::uuid),  -- Economics
  ('ce4d19b0-afad-4ac9-acfa-638ed68305cb'::uuid),  -- Computer Science
  ('fe43f2c7-0d3d-4c19-ac2e-ad85d1c4a9a9'::uuid)   -- Biological Science
) AS pedagogy(program_id)
CROSS JOIN (VALUES (2024), (2025)) AS yr(year)
ON CONFLICT (institution_id, program_id, program_start_year) DO NOTHING;

-- Step 1b: Redistribute existing aggregate pivot rows across 4 pedagogies
-- using 40/20/20/20 ratios.
INSERT INTO admission_historical_pivot (
  admission_year_id,
  admission_date,
  admitted_count,
  source,
  imported_by
)
SELECT
  new_ay.id AS admission_year_id,
  hp.admission_date,
  GREATEST(ROUND(hp.admitted_count * r.ratio)::int, 0) AS admitted_count,
  'b_ed_pedagogy_redistribute:' || hp.source AS source,
  'fix-b-ed-pedagogy-split' AS imported_by
FROM admission_historical_pivot hp
JOIN admission_years old_ay ON old_ay.id = hp.admission_year_id
JOIN programs old_p ON old_p.id = old_ay.program_id
CROSS JOIN (VALUES
  ('c3ac44db-6cfd-4a7d-948e-95977ca2234d'::uuid, 0.40),  -- Physical Science (2 of 5)
  ('149ac1a4-c6f0-415f-b343-96e9a1d87023'::uuid, 0.20),  -- Economics (1 of 5)
  ('ce4d19b0-afad-4ac9-acfa-638ed68305cb'::uuid, 0.20),  -- Computer Science (1 of 5)
  ('fe43f2c7-0d3d-4c19-ac2e-ad85d1c4a9a9'::uuid, 0.20)   -- Biological Science (1 of 5)
) AS r(pedagogy_id, ratio)
JOIN admission_years new_ay
  ON new_ay.institution_id = old_ay.institution_id
 AND new_ay.program_id = r.pedagogy_id
 AND new_ay.program_start_year = old_ay.program_start_year
WHERE old_p.program_name = 'B.Ed (Historical Aggregate)'
  AND hp.admitted_count > 0
  -- Skip cells where the rounded share would be 0 (don't add noise rows)
  AND ROUND(hp.admitted_count * r.ratio) > 0
ON CONFLICT (admission_year_id, admission_date) DO UPDATE
  SET admitted_count = EXCLUDED.admitted_count,
      source = EXCLUDED.source,
      imported_at = now();

-- Step 1c: Delete original aggregate pivot rows. The program itself stays
-- (FK from admission_years prevents drop and we don't need to anyway).
DELETE FROM admission_historical_pivot hp
WHERE EXISTS (
  SELECT 1
  FROM admission_years ay
  JOIN programs p ON p.id = ay.program_id
  WHERE ay.id = hp.admission_year_id
    AND p.program_name = 'B.Ed (Historical Aggregate)'
);

-- =============================================================================
-- FIX 2: Relax common-courses filter to 2-of-3 years
-- =============================================================================

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
  v_lifecycle text[];
  v_min_year_count int := 2;  -- Director-locked: 2-of-3 (was 3-of-3)
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
  -- 2-of-3 filter (Director-locked 2026-06-02): programs present in at
  -- least v_min_year_count years contribute to the trajectory.
  common_courses AS (
    SELECT institution_id, program_id
    FROM all_year_courses
    GROUP BY institution_id, program_id
    HAVING COUNT(DISTINCT program_start_year) >= v_min_year_count
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
  'Cumulative trajectory for current cycle + 2 prior. April 1 anchor. Common-courses filter relaxed to 2-of-3 (Director-locked 2026-06-02). UNIONs learners_profiles + admission_historical_pivot with -SH program merge.';

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

COMMENT ON FUNCTION public.fn_yoy_excluded_courses(uuid) IS
  'Companion to fn_yoy_admission_trajectory. With 2-of-3 relaxation, this returns ONLY programs with single-year data. Two-year programs now contribute to the trajectory.';

REVOKE ALL ON FUNCTION public.fn_yoy_excluded_courses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_excluded_courses(uuid) TO authenticated;
