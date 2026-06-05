-- Migration: 2026-06-05 09:10
-- Purpose:
--   Fix the pace_per_inst CTE in fn_yoy_days_to_catchup_per_institution so the
--   "Days-to-Catch-Up Countdown" actually counts CURRENT-cycle admits made in
--   the last 7 days.
--
-- Bug origin (PR #1218):
--   The original CTE filtered on `lp.activated_at IS NOT NULL` + a 7-day window
--   against `lp.activated_at`. But `activated_at` is set by a trigger that only
--   fires when `lifecycle_status` transitions to 'active' (post-counsellor
--   verification). Brand-new current-cycle learners sit in 'reserved' /
--   'admitted' / 'lead_converted' for hours-to-days before that transition,
--   so they are excluded from pace even though they ARE the pace.
--
--   Diagnostic findings (Agent δ, commit e2ecbbdb1):
--     - 2026-cycle has 24 incremental admits in last 7d for JKKN Engineering
--       alone (per organic timestamp scan),
--     - the existing function returned 0 last-7d for ALL 2026 institutions,
--     - daily_pace clamped to the 0.1/day floor → days-to-catch-up = 2,560+
--       (alarmist, non-actionable).
--
-- Fix (3-line delta):
--   Replace `lp.activated_at IS NOT NULL` + the two `lp.activated_at` window
--   bounds with COALESCE(lp.activated_at, lp.created_at) on both window bounds.
--   When activated_at is NULL (most current-cycle rows), created_at carries
--   the real organic admission moment.
--
-- Canonical pattern reference:
--   supabase/migrations/20260603061500_fn_yoy_historical_wins_for_prior_years.sql
--   uses COALESCE(lp.activated_at, lp.created_at) for the same reason at lines
--   128, 140, 165, 178.
--
-- Idempotent: CREATE OR REPLACE. RETURNS TABLE shape, SECURITY DEFINER, SELECT
-- clause, signal CASE, ORDER BY, GRANT/REVOKE — all UNCHANGED. The single
-- delta is inside the pace_per_inst CTE.

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
  -- COALESCE(activated_at, created_at): activated_at is set by trigger only on
  -- lifecycle transition to 'active' and is NULL for the hours-to-days a new
  -- learner sits in 'reserved'/'admitted'/'lead_converted'. created_at carries
  -- the real organic admission moment in that gap. Pattern matches
  -- 20260603061500_fn_yoy_historical_wins_for_prior_years.sql.
  pace_per_inst AS (
    SELECT ay.institution_id,
           COUNT(*)::int AS incremental_last_7d
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.program_start_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND COALESCE(lp.activated_at, lp.created_at) >= (CURRENT_DATE - INTERVAL '7 days')
      AND COALESCE(lp.activated_at, lp.created_at) <= (CURRENT_DATE + INTERVAL '1 day')
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
  -- Institution filter: canonical helper from PR #1222
  -- (20260605083000_yoy_canonical_institution_filter.sql). MUST be applied
  -- before this migration. The helper mirrors the picker rule from
  -- yoy-institution-picker.tsx — single source of truth across all 5 actionable
  -- RPCs. This migration includes it explicitly so apply-order doesn't matter:
  -- whichever of PR #1222 or this PR applies last, the picker rule is preserved.
  WHERE public._yoy_admission_institution(i.name)
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
  'Per-institution days-to-catch-up countdown: at current 7-day pace, how many days needed to reach last year''s final admitted total, vs days remaining until the cycle window end (default Aug 31). Signals RED (won''t make it) / AMBER (tight) / GREEN (comfortable or already past) / NA (no LY data). Pace uses COALESCE(activated_at, created_at) so brand-new current-cycle admits whose activated_at trigger has not yet fired are counted.';

REVOKE ALL ON FUNCTION public.fn_yoy_days_to_catchup_per_institution(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_days_to_catchup_per_institution(uuid, int, int) TO authenticated;
