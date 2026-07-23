-- Migration: 2026-06-02 23:45
-- Purpose: Fix two SQL bugs in 20260602233000_fn_yoy_drill_down_rpcs.sql.
--
-- Bug 1 (fn_yoy_drill_at_day): ORDER BY referenced output column names but
-- the trailing query was a UNION of two CTEs — Postgres requires ORDER BY to
-- reference column names from the SELECT list. Wrap in subquery.
--
-- Bug 2 (fn_yoy_per_category_trajectory): SELECT used i.name inside the
-- helper function but the GROUP BY only listed the helper's result column.
-- Compute category in a subquery first, then aggregate.

DROP FUNCTION IF EXISTS public.fn_yoy_drill_at_day(int, int, uuid);

CREATE OR REPLACE FUNCTION public.fn_yoy_drill_at_day(
  p_year int,
  p_day_n int,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_kind text,
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
  ),
  combined_drill AS (
    SELECT kind, name, cumulative FROM by_institution
    UNION ALL
    SELECT kind, name, cumulative FROM by_program
  )
  SELECT cd.kind, cd.name, cd.cumulative
  FROM combined_drill cd
  ORDER BY cd.kind, cd.cumulative DESC;
END;
$$;

COMMENT ON FUNCTION public.fn_yoy_drill_at_day(int, int, uuid) IS
  'Top 5 institutions + top 5 programs contributing to cumulative at (year, day_n). Powers the click-point Sheet drill-down.';

REVOKE ALL ON FUNCTION public.fn_yoy_drill_at_day(int, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_drill_at_day(int, int, uuid) TO authenticated;


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
  -- Compute category per learner first; then aggregate
  organic_with_category AS (
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
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
  ),
  organic_daily AS (
    SELECT
      category,
      program_start_year,
      day_n,
      COUNT(*)::bigint AS daily_count
    FROM organic_with_category
    GROUP BY category, program_start_year, day_n
  ),
  historical_with_category AS (
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
  ),
  historical_daily AS (
    SELECT
      category,
      program_start_year,
      day_n,
      SUM(admitted_count)::bigint AS daily_count
    FROM historical_with_category
    GROUP BY category, program_start_year, day_n
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
