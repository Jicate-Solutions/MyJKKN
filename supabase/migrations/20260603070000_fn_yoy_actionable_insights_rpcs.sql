-- Migration: 2026-06-03 07:00
-- Purpose:
--   Four RPCs powering the YoY chart's actionable-insights additions
--   (Director-locked 2026-06-03 06:43 IST from workflow output):
--
--   1. fn_yoy_institution_health_signals
--      Per-institution stoplight (Red/Amber/Green) for the
--      8-College Health Stoplight strip. Worst-of-3 signal rule.
--
--   2. fn_yoy_deposits_leaking
--      Top 5 programs by reserved-stale count. Paid-but-not-admitted
--      worklist. Surfaces which programs have deposits piling up
--      without movement to "admitted".
--
--   3. fn_yoy_counselor_accountability_grid
--      institution × counsellor matrix of stale-reserved counts.
--      Names accountable counsellor for each red cell.
--
--   4. fn_yoy_first_touch_breaches
--      Leads captured but no activity within 48h of creation. Surfaces
--      routing-rule failures + counsellor unresponsiveness.
--
-- All four accept p_institution_id for institution-scoped filtering.

-- =============================================================================
-- 1) Institution Health Signals (Stoplight)
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_yoy_institution_health_signals(uuid);

CREATE OR REPLACE FUNCTION public.fn_yoy_institution_health_signals(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_institution_id uuid,
  out_institution_name text,
  out_sanctioned_intake int,
  out_current_admitted int,
  out_prior_year_admitted_same_day int,
  out_prior_year_final int,
  out_fill_pct_current numeric,
  out_fill_pct_prior_same_day numeric,
  out_reserved_count int,
  out_stale_reserved_count int,
  out_signal text,
  out_pace_delta_pct numeric
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
  v_today_day_n int;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();
  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;
  v_prior_year := v_current_year - 1;
  v_today_day_n := CURRENT_DATE - make_date(v_current_year, 4, 1);

  RETURN QUERY
  WITH
  intake_per_inst AS (
    SELECT ay.institution_id, SUM(ay.sanctioned_intake)::int AS intake
    FROM admission_years ay
    WHERE ay.program_start_year = v_current_year
    GROUP BY ay.institution_id
  ),
  current_admitted_per_inst AS (
    SELECT ay.institution_id, COUNT(lp.id)::int AS admitted
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.program_start_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
    GROUP BY ay.institution_id
  ),
  reserved_per_inst AS (
    SELECT ay.institution_id,
           COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved')::int AS reserved,
           COUNT(*) FILTER (
             WHERE lp.lifecycle_status::text = 'reserved'
               AND lp.updated_at < NOW() - INTERVAL '10 days'
           )::int AS stale_reserved
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.program_start_year = v_current_year
    GROUP BY ay.institution_id
  ),
  -- Prior year admitted at same day-N (from historical_pivot if exists; fallback organic)
  prior_at_same_day AS (
    SELECT ay.institution_id,
           SUM(hp.admitted_count)::int AS cumulative_at_today_dayn
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.program_start_year = v_prior_year
      AND hp.admission_date <= make_date(v_prior_year, 4, 1) + v_today_day_n
    GROUP BY ay.institution_id
  ),
  prior_final AS (
    SELECT ay.institution_id, SUM(hp.admitted_count)::int AS total
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.program_start_year = v_prior_year
    GROUP BY ay.institution_id
  )
  SELECT
    i.id AS out_institution_id,
    i.name::text AS out_institution_name,
    COALESCE(ipi.intake, 0) AS out_sanctioned_intake,
    COALESCE(cap.admitted, 0) AS out_current_admitted,
    COALESCE(pasd.cumulative_at_today_dayn, 0) AS out_prior_year_admitted_same_day,
    COALESCE(pf.total, 0) AS out_prior_year_final,
    CASE
      WHEN COALESCE(ipi.intake, 0) > 0
      THEN ROUND((COALESCE(cap.admitted, 0)::numeric / ipi.intake) * 100, 1)
      ELSE NULL
    END AS out_fill_pct_current,
    CASE
      WHEN COALESCE(ipi.intake, 0) > 0
      THEN ROUND((COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / ipi.intake) * 100, 1)
      ELSE NULL
    END AS out_fill_pct_prior_same_day,
    COALESCE(rpi.reserved, 0) AS out_reserved_count,
    COALESCE(rpi.stale_reserved, 0) AS out_stale_reserved_count,
    -- Signal: RED if behind LY by >15pp OR stale_reserved > 20; AMBER if behind 5-15pp OR stale_reserved 10-20; GREEN otherwise
    CASE
      WHEN COALESCE(ipi.intake, 0) = 0 THEN 'NA'
      WHEN (COALESCE(cap.admitted, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 <
           (COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 - 15
           OR COALESCE(rpi.stale_reserved, 0) > 20
        THEN 'RED'
      WHEN (COALESCE(cap.admitted, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 <
           (COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 - 5
           OR COALESCE(rpi.stale_reserved, 0) > 10
        THEN 'AMBER'
      ELSE 'GREEN'
    END AS out_signal,
    -- Pace delta = current fill % - prior fill % at same day-N
    CASE
      WHEN COALESCE(ipi.intake, 0) > 0
      THEN ROUND(
        ((COALESCE(cap.admitted, 0)::numeric / ipi.intake) * 100) -
        ((COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / ipi.intake) * 100),
        1)
      ELSE NULL
    END AS out_pace_delta_pct
  FROM institutions i
  LEFT JOIN intake_per_inst ipi ON ipi.institution_id = i.id
  LEFT JOIN current_admitted_per_inst cap ON cap.institution_id = i.id
  LEFT JOIN reserved_per_inst rpi ON rpi.institution_id = i.id
  LEFT JOIN prior_at_same_day pasd ON pasd.institution_id = i.id
  LEFT JOIN prior_final pf ON pf.institution_id = i.id
  WHERE i.name LIKE 'JKKN%'
    AND i.name NOT LIKE 'JKKN Main Office%'
    AND i.name NOT LIKE 'JKKN Testing%'
    AND (p_institution_id IS NULL OR i.id = p_institution_id)
  ORDER BY
    CASE
      WHEN COALESCE(ipi.intake, 0) = 0 THEN 4
      WHEN (COALESCE(cap.admitted, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 <
           (COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 - 15
           OR COALESCE(rpi.stale_reserved, 0) > 20 THEN 1
      WHEN (COALESCE(cap.admitted, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 <
           (COALESCE(pasd.cumulative_at_today_dayn, 0)::numeric / NULLIF(ipi.intake, 0)) * 100 - 5
           OR COALESCE(rpi.stale_reserved, 0) > 10 THEN 2
      ELSE 3
    END,
    i.name;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_yoy_institution_health_signals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_institution_health_signals(uuid) TO authenticated;


-- =============================================================================
-- 2) Deposits Leaking — top 5 programs by reserved-stall count
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_yoy_deposits_leaking(uuid, int);

CREATE OR REPLACE FUNCTION public.fn_yoy_deposits_leaking(
  p_institution_id uuid DEFAULT NULL,
  p_top_n int DEFAULT 5
)
RETURNS TABLE (
  out_program_id uuid,
  out_program_name text,
  out_institution_name text,
  out_reserved_count int,
  out_admitted_count int,
  out_stale_14d_count int,
  out_avg_stale_days int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_year int;
BEGIN
  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH per_program AS (
    SELECT
      p.id AS program_id,
      p.program_name,
      i.name AS institution_name,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved') AS reserved,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active','graduated')) AS admitted,
      COUNT(*) FILTER (
        WHERE lp.lifecycle_status::text = 'reserved'
          AND lp.updated_at < NOW() - INTERVAL '14 days'
      ) AS stale_14d,
      AVG(EXTRACT(EPOCH FROM (NOW() - lp.updated_at)) / 86400.0)
        FILTER (WHERE lp.lifecycle_status::text = 'reserved') AS avg_stale_days_numeric
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN programs p ON p.id = ay.program_id
    JOIN institutions i ON i.id = ay.institution_id
    WHERE ay.program_start_year = v_current_year
      AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    GROUP BY p.id, p.program_name, i.name
    HAVING COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved') > 0
  )
  SELECT
    pp.program_id AS out_program_id,
    pp.program_name::text AS out_program_name,
    pp.institution_name::text AS out_institution_name,
    pp.reserved::int AS out_reserved_count,
    pp.admitted::int AS out_admitted_count,
    pp.stale_14d::int AS out_stale_14d_count,
    COALESCE(pp.avg_stale_days_numeric, 0)::int AS out_avg_stale_days
  FROM per_program pp
  ORDER BY pp.stale_14d DESC, pp.reserved DESC
  LIMIT p_top_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_yoy_deposits_leaking(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_deposits_leaking(uuid, int) TO authenticated;


-- =============================================================================
-- 3) Counselor Accountability Grid — institution × counsellor stale-reserved
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_yoy_counselor_accountability_grid(uuid);

CREATE OR REPLACE FUNCTION public.fn_yoy_counselor_accountability_grid(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_institution_id uuid,
  out_institution_name text,
  out_counselor_id uuid,
  out_counselor_name text,
  out_stale_reserved_count int,
  out_total_reserved_count int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_year int;
BEGIN
  SELECT MAX(ay.program_start_year) INTO v_current_year
  FROM admission_years ay WHERE ay.is_active = true;
  IF v_current_year IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH stale_leads AS (
    -- Lead-level: reserved status + idle > 10 days
    SELECT
      al.institution_id,
      COALESCE(al.assigned_counselor_id, al.counselor_id) AS counselor_id,
      COUNT(*) FILTER (WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - INTERVAL '10 days') AS stale_cnt,
      COUNT(*) AS total_cnt
    FROM admission_leads al
    WHERE al.is_active = true
      AND al.funnel_stage::text IN ('reserved','admitted')
      AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
    GROUP BY al.institution_id, COALESCE(al.assigned_counselor_id, al.counselor_id)
  )
  SELECT
    i.id AS out_institution_id,
    i.name::text AS out_institution_name,
    sl.counselor_id AS out_counselor_id,
    COALESCE(c.name, 'Unassigned')::text AS out_counselor_name,
    sl.stale_cnt::int AS out_stale_reserved_count,
    sl.total_cnt::int AS out_total_reserved_count
  FROM stale_leads sl
  JOIN institutions i ON i.id = sl.institution_id
  LEFT JOIN admission_counselors c ON c.id = sl.counselor_id
  WHERE sl.stale_cnt > 0
  ORDER BY sl.stale_cnt DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_yoy_counselor_accountability_grid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_counselor_accountability_grid(uuid) TO authenticated;


-- =============================================================================
-- 4) First-Touch SLA Breaches — leads with no activity within 48h of capture
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_yoy_first_touch_breaches(uuid, int);

CREATE OR REPLACE FUNCTION public.fn_yoy_first_touch_breaches(
  p_institution_id uuid DEFAULT NULL,
  p_window_days int DEFAULT 7
)
RETURNS TABLE (
  out_breach_count int,
  out_institution_id uuid,
  out_institution_name text,
  out_counselor_id uuid,
  out_counselor_name text,
  out_kind text -- 'by_institution' or 'by_counselor' or 'total'
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH breach_leads AS (
    SELECT
      al.id,
      al.institution_id,
      COALESCE(al.assigned_counselor_id, al.counselor_id) AS counselor_id
    FROM admission_leads al
    WHERE al.is_active = true
      AND al.created_at > NOW() - (p_window_days || ' days')::interval
      AND COALESCE(al.last_activity_at, al.created_at) <
          al.created_at + INTERVAL '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM admission_lead_activities ala
        WHERE ala.lead_id = al.id
          AND ala.created_at <= al.created_at + INTERVAL '48 hours'
      )
      AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
  ),
  by_inst AS (
    SELECT
      'by_institution'::text AS kind,
      institution_id,
      NULL::uuid AS counselor_id,
      COUNT(*)::int AS cnt
    FROM breach_leads
    GROUP BY institution_id
  ),
  by_csl AS (
    SELECT
      'by_counselor'::text AS kind,
      NULL::uuid AS institution_id,
      counselor_id,
      COUNT(*)::int AS cnt
    FROM breach_leads
    GROUP BY counselor_id
  ),
  total AS (
    SELECT
      'total'::text AS kind,
      NULL::uuid AS institution_id,
      NULL::uuid AS counselor_id,
      COUNT(*)::int AS cnt
    FROM breach_leads
  )
  SELECT
    rows.cnt AS out_breach_count,
    rows.institution_id AS out_institution_id,
    COALESCE(i.name, '')::text AS out_institution_name,
    rows.counselor_id AS out_counselor_id,
    COALESCE(c.name, CASE WHEN rows.counselor_id IS NULL AND rows.kind = 'by_counselor' THEN 'Unassigned' ELSE '' END)::text AS out_counselor_name,
    rows.kind AS out_kind
  FROM (
    SELECT * FROM by_inst
    UNION ALL
    SELECT * FROM by_csl
    UNION ALL
    SELECT * FROM total
  ) rows
  LEFT JOIN institutions i ON i.id = rows.institution_id
  LEFT JOIN admission_counselors c ON c.id = rows.counselor_id
  ORDER BY rows.kind, rows.cnt DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_yoy_first_touch_breaches(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_first_touch_breaches(uuid, int) TO authenticated;
