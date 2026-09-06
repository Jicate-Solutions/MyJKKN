-- Migration: 2026-06-02 23:30
-- Purpose:
--   Three new RPCs powering the YoY chart's drill-down redesign (Director
--   locked 2026-06-02 interview):
--
--   1. fn_yoy_per_institution_trajectory(p_year)
--      Returns per-institution cumulative-admitted-by-day-N for ONE year.
--      Powers the "click year legend → expand into 8 institutional sub-curves"
--      interaction. The chart redraws with 1 sub-line per institution for the
--      expanded year.
--
--   2. fn_yoy_drill_at_day(p_year, p_day_n)
--      Returns top 5 institutions + top 5 programs contributing to the
--      cumulative at a given (year, day_n). Powers the click-point Sheet
--      drill-down.
--
--   3. fn_yoy_per_category_trajectory()
--      Returns cumulative by (program_category, year, day_n) for all 3 years.
--      Powers the "Show by category" toggle that collapses 8 institutions into
--      8 program-categories (UG ENG / PG ENG / B.Ed / Nursing / Pharmacy /
--      Dental / Allied Health / Arts & Sci).
--
--   All three reuse the same conventions as fn_yoy_admission_trajectory:
--     - Lifecycle filter via _yoy_admitted_lifecycle_set()
--     - -SH program merge via program_resolution CTE
--     - April 1 day-0 anchor
--     - UNION of learners_profiles + admission_historical_pivot with organic-wins
--
-- Tier: additive, new functions. No existing behavior changes.

-- =============================================================================
-- HELPER: program-category mapping
-- =============================================================================
-- Returns the high-level category a program belongs to, derived from the
-- institution name. Director-locked categories: UG ENG, PG ENG, B.Ed, Nursing,
-- Pharmacy, Dental, Allied Health, Arts & Sci.
CREATE OR REPLACE FUNCTION public._yoy_program_category(
  p_institution_name text,
  p_program_name text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_institution_name ILIKE '%Engineering and Technology%' THEN
      CASE
        WHEN p_program_name ILIKE 'M.E.%' OR p_program_name ILIKE 'Master of Business%' THEN 'PG ENG'
        ELSE 'UG ENG'
      END
    WHEN p_institution_name ILIKE '%Education%' THEN 'B.Ed'
    WHEN p_institution_name ILIKE '%Nursing%' THEN 'Nursing'
    WHEN p_institution_name ILIKE '%Pharmacy%' THEN 'Pharmacy'
    WHEN p_institution_name ILIKE '%Dental%' THEN 'Dental'
    WHEN p_institution_name ILIKE '%Allied Health%' THEN 'Allied Health'
    WHEN p_institution_name ILIKE '%Arts and Science%' THEN 'Arts & Sci'
    ELSE 'Other'
  END;
$$;

COMMENT ON FUNCTION public._yoy_program_category(text, text) IS
  'Maps (institution, program) → high-level category for the YoY chart''s by-category view.';

REVOKE ALL ON FUNCTION public._yoy_program_category(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._yoy_program_category(text, text) TO authenticated;


-- =============================================================================
-- 1) PER-INSTITUTION TRAJECTORY for a single year
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_yoy_per_institution_trajectory(int, uuid);

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
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

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
  organic_daily AS (
    SELECT
      ay.institution_id,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = p_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.institution_id, day_n
  ),
  historical_daily AS (
    SELECT
      ay.institution_id,
      (hp.admission_date - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      SUM(hp.admitted_count)::bigint AS daily_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = p_year
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
    GROUP BY ay.institution_id, day_n
  ),
  combined_daily AS (
    SELECT * FROM organic_daily
    UNION ALL
    SELECT * FROM historical_daily
  ),
  daily_per_inst AS (
    SELECT
      cd.institution_id,
      cd.day_n,
      SUM(cd.daily_count)::bigint AS daily
    FROM combined_daily cd
    GROUP BY cd.institution_id, cd.day_n
  )
  SELECT
    dpi.institution_id,
    i.name::text,
    dpi.day_n,
    SUM(dpi.daily) OVER (
      PARTITION BY dpi.institution_id
      ORDER BY dpi.day_n
    )::bigint AS cumulative
  FROM daily_per_inst dpi
  JOIN institutions i ON i.id = dpi.institution_id
  ORDER BY i.name, dpi.day_n;
END;
$$;

COMMENT ON FUNCTION public.fn_yoy_per_institution_trajectory(int, uuid) IS
  'Per-institution cumulative-by-day-N for a single year. Powers the YoY chart''s click-legend institutional drill-down.';

REVOKE ALL ON FUNCTION public.fn_yoy_per_institution_trajectory(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_per_institution_trajectory(int, uuid) TO authenticated;


-- =============================================================================
-- 2) DRILL AT DAY — top institutions + top programs at (year, day_n)
-- =============================================================================
-- Returns aggregated counts of WHO contributed to the cumulative as of day_n.
-- Two result sets in one SETOF record via two CTEs UNION'd with a category col.
DROP FUNCTION IF EXISTS public.fn_yoy_drill_at_day(int, int, uuid);

CREATE OR REPLACE FUNCTION public.fn_yoy_drill_at_day(
  p_year int,
  p_day_n int,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_kind text,             -- 'institution' or 'program'
  out_name text,
  out_cumulative bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lifecycle text[];
  v_cutoff_date date;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();
  v_cutoff_date := make_date(p_year, 4, 1) + p_day_n;

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
  organic_counts AS (
    SELECT
      ay.institution_id,
      pr.canonical_id AS program_id,
      COUNT(*)::bigint AS cnt
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = p_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND COALESCE(lp.activated_at, lp.created_at)::date <= v_cutoff_date
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY ay.institution_id, pr.canonical_id
  ),
  historical_counts AS (
    SELECT
      ay.institution_id,
      pr.canonical_id AS program_id,
      SUM(hp.admitted_count)::bigint AS cnt
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    WHERE ay.program_start_year = p_year
      AND hp.admission_date <= v_cutoff_date
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
    GROUP BY ay.institution_id, pr.canonical_id
  ),
  combined AS (
    SELECT * FROM organic_counts
    UNION ALL
    SELECT * FROM historical_counts
  ),
  by_institution AS (
    SELECT
      'institution'::text AS kind,
      i.name::text AS name,
      SUM(c.cnt)::bigint AS cumulative
    FROM combined c
    JOIN institutions i ON i.id = c.institution_id
    GROUP BY i.name
    ORDER BY SUM(c.cnt) DESC
    LIMIT 5
  ),
  by_program AS (
    SELECT
      'program'::text AS kind,
      (i.name || ' / ' || p.program_name)::text AS name,
      SUM(c.cnt)::bigint AS cumulative
    FROM combined c
    JOIN programs p ON p.id = c.program_id
    JOIN institutions i ON i.id = c.institution_id
    GROUP BY i.name, p.program_name
    ORDER BY SUM(c.cnt) DESC
    LIMIT 5
  )
  SELECT * FROM by_institution
  UNION ALL
  SELECT * FROM by_program
  ORDER BY out_kind, out_cumulative DESC;
END;
$$;

COMMENT ON FUNCTION public.fn_yoy_drill_at_day(int, int, uuid) IS
  'Top 5 institutions + top 5 programs contributing to cumulative at (year, day_n). Powers the click-point Sheet drill-down.';

REVOKE ALL ON FUNCTION public.fn_yoy_drill_at_day(int, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_drill_at_day(int, int, uuid) TO authenticated;


-- =============================================================================
-- 3) PER-CATEGORY TRAJECTORY across all 3 comparison years
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_yoy_per_category_trajectory(uuid);

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
      p.program_name,
      COALESCE(base.id, p.id) AS canonical_id
    FROM programs p
    LEFT JOIN programs base
      ON base.institution_id = p.institution_id
     AND base.program_id = REPLACE(p.program_id, '-SH', '')
     AND p.program_id LIKE '%-SH'
     AND base.program_id NOT LIKE '%-SH'
  ),
  organic_daily AS (
    SELECT
      public._yoy_program_category(i.name, pr.program_name) AS category,
      ay.program_start_year,
      (COALESCE(lp.activated_at, lp.created_at)::date
        - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      COUNT(*)::bigint AS daily_count
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    JOIN institutions i ON i.id = ay.institution_id
    WHERE ay.program_start_year = ANY(v_years)
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY category, ay.program_start_year, day_n
  ),
  historical_daily AS (
    SELECT
      public._yoy_program_category(i.name, pr.program_name) AS category,
      ay.program_start_year,
      (hp.admission_date - make_date(ay.program_start_year, 4, 1))::int AS day_n,
      SUM(hp.admitted_count)::bigint AS daily_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN program_resolution pr ON pr.raw_id = ay.program_id
    JOIN institutions i ON i.id = ay.institution_id
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
    GROUP BY category, ay.program_start_year, day_n
  ),
  combined AS (
    SELECT * FROM organic_daily
    UNION ALL
    SELECT * FROM historical_daily
  ),
  daily_per_cat_year AS (
    SELECT
      c.category,
      c.program_start_year,
      c.day_n,
      SUM(c.daily_count)::bigint AS daily
    FROM combined c
    GROUP BY c.category, c.program_start_year, c.day_n
  )
  SELECT
    dcy.category,
    dcy.program_start_year,
    dcy.day_n,
    SUM(dcy.daily) OVER (
      PARTITION BY dcy.category, dcy.program_start_year
      ORDER BY dcy.day_n
    )::bigint AS cumulative
  FROM daily_per_cat_year dcy
  ORDER BY dcy.category, dcy.program_start_year, dcy.day_n;
END;
$$;

COMMENT ON FUNCTION public.fn_yoy_per_category_trajectory(uuid) IS
  'Cumulative trajectory grouped by program-category × year. Powers the YoY chart''s "Show by category" toggle.';

REVOKE ALL ON FUNCTION public.fn_yoy_per_category_trajectory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_per_category_trajectory(uuid) TO authenticated;
