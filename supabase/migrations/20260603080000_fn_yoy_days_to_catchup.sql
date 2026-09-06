-- Migration: 2026-06-03 08:00
-- Purpose:
--   5th actionable insight for the YoY admission trajectory chart:
--   "Days-to-Catch-Up Countdown" — for each JKKN institution that is behind
--   its YoY pace, compute how many days are needed at the current 7-day
--   admission pace to catch last year's FINAL admitted total, and compare
--   that against the days remaining in the admission window (default Aug 31
--   of the current cycle year).
--
--   Output signal per institution:
--     NA    — no prior-year data (can't compute gap)
--     GREEN — already past LY final (gap <= 0) OR days-to-catchup <= 70% of
--             days-remaining (comfortable cushion)
--     AMBER — days-to-catchup <= days-remaining (tight but achievable)
--     RED   — days-to-catchup > days-remaining (won't make it at current pace)
--
-- Director-locked anchor: April 1 = day-0 for ALL cycle math.
--
-- Pace source:
--   incrementalLast7d = COUNT of CURRENT-cycle learners_profiles rows whose
--                       activated_at falls in (CURRENT_DATE - 7d .. CURRENT_DATE]
--                       AND lifecycle_status ∈ admitted-set.
--   For current cycle, lp.activated_at IS reliable (organic real-time
--   capture, not bulk migration — see
--   feedback_bulk_migration_timestamps_distort_time_series). The prior-year
--   distortion is irrelevant here; we read CURRENT-year rows only.
--   dailyPaceLast7d = GREATEST(incrementalLast7d / 7.0, 0.1) — min-clamp
--   avoids divide-by-zero / Infinity when an institution had zero admits
--   in the last week.
--
-- Prior-year final:
--   admission_historical_pivot is the canonical source for prior-year totals
--   (see 20260603061500_fn_yoy_historical_wins_for_prior_years.sql). For
--   2025-26 cohort, sheet timeline truth (1,541 rows Feb-Nov 2025) beats
--   bulk-migrated organic timestamps.

DROP FUNCTION IF EXISTS public.fn_yoy_days_to_catchup_per_institution(uuid, int, int);

CREATE OR REPLACE FUNCTION public.fn_yoy_days_to_catchup_per_institution(
  p_institution_id uuid DEFAULT NULL,
  p_window_end_month int DEFAULT 8,
  p_window_end_day int DEFAULT 31
)
RETURNS TABLE (
  out_institution_id uuid,
  out_institution_name text,
  out_current_admitted int,
  out_prior_final int,
  out_gap int,
  out_daily_pace_last_7d numeric,
  out_days_to_catchup int,
  out_days_remaining int,
  out_signal text,
  out_projected_final int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lifecycle text[];
  v_current_year int;
  v_prior_year int;
  v_window_end_date date;
  v_days_remaining int;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;
  v_prior_year := v_current_year - 1;

  v_window_end_date := make_date(v_current_year, p_window_end_month, p_window_end_day);
  v_days_remaining := GREATEST(v_window_end_date - CURRENT_DATE, 0);

  RETURN QUERY
  WITH
  -- Current cycle cumulative admitted (TODAY)
  current_admitted_per_inst AS (
    SELECT ay.institution_id, COUNT(lp.id)::int AS admitted
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.program_start_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
    GROUP BY ay.institution_id
  ),
  -- Prior cycle FULL-YEAR admitted total (from canonical sheet pivot)
  prior_final AS (
    SELECT ay.institution_id, SUM(hp.admitted_count)::int AS total
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.program_start_year = v_prior_year
    GROUP BY ay.institution_id
  ),
  -- Last-7-day incremental admits per institution (CURRENT cycle only)
  pace_per_inst AS (
    SELECT ay.institution_id,
           COUNT(*)::int AS incremental_last_7d
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.program_start_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND lp.activated_at IS NOT NULL
      AND lp.activated_at >= (CURRENT_DATE - INTERVAL '7 days')
      AND lp.activated_at <= (CURRENT_DATE + INTERVAL '1 day')
    GROUP BY ay.institution_id
  )
  SELECT
    i.id AS out_institution_id,
    i.name::text AS out_institution_name,
    COALESCE(cap.admitted, 0) AS out_current_admitted,
    COALESCE(pf.total, 0) AS out_prior_final,
    (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0)) AS out_gap,
    -- pace: min-clamped at 0.1/day so DIVISION never explodes
    GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
      AS out_daily_pace_last_7d,
    -- days to catch up = CEIL(gap / pace), NULL if already at-or-past LY total
    CASE
      WHEN COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0) <= 0 THEN NULL::int
      ELSE CEIL(
        (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
        / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
      )::int
    END AS out_days_to_catchup,
    v_days_remaining AS out_days_remaining,
    -- Signal classification
    CASE
      WHEN COALESCE(pf.total, 0) = 0 THEN 'NA'
      WHEN COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0) <= 0 THEN 'GREEN'
      WHEN CEIL(
             (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
             / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
           ) <= v_days_remaining * 0.7
        THEN 'GREEN'
      WHEN CEIL(
             (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
             / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
           ) <= v_days_remaining
        THEN 'AMBER'
      ELSE 'RED'
    END AS out_signal,
    -- Projected final = today's admitted + (current pace × days remaining)
    (
      COALESCE(cap.admitted, 0)
      + ROUND(
          GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
          * v_days_remaining
        )
    )::int AS out_projected_final
  FROM institutions i
  LEFT JOIN current_admitted_per_inst cap ON cap.institution_id = i.id
  LEFT JOIN prior_final pf ON pf.institution_id = i.id
  LEFT JOIN pace_per_inst ppi ON ppi.institution_id = i.id
  WHERE i.name LIKE 'JKKN%'
    AND i.name NOT LIKE 'JKKN Main Office%'
    AND i.name NOT LIKE 'JKKN Testing%'
    AND i.name NOT LIKE 'JKKN Nattraja Incubation%'
    AND i.name NOT LIKE 'Jicate Solutions%'
    AND (p_institution_id IS NULL OR i.id = p_institution_id)
  ORDER BY
    -- RED (1) → AMBER (2) → GREEN (3) → NA (4)
    CASE
      WHEN COALESCE(pf.total, 0) = 0 THEN 4
      WHEN COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0) <= 0 THEN 3
      WHEN CEIL(
             (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
             / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
           ) <= v_days_remaining * 0.7
        THEN 3
      WHEN CEIL(
             (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
             / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
           ) <= v_days_remaining
        THEN 2
      ELSE 1
    END,
    (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0)) DESC,
    i.name;
END;
$$;

COMMENT ON FUNCTION public.fn_yoy_days_to_catchup_per_institution(uuid, int, int) IS
  'Per-institution days-to-catch-up countdown: at current 7-day pace, how many days needed to reach last year''s final admitted total, vs days remaining until the cycle window end (default Aug 31). Signals RED (won''t make it) / AMBER (tight) / GREEN (comfortable or already past) / NA (no LY data).';

REVOKE ALL ON FUNCTION public.fn_yoy_days_to_catchup_per_institution(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_days_to_catchup_per_institution(uuid, int, int) TO authenticated;
