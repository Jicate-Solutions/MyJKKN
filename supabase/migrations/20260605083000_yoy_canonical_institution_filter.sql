-- Migration: 2026-06-05 08:30
-- Purpose:
--   Single canonical institution filter for ALL YoY actionable RPCs.
--
--   Receipt (skeptic review of PR #1218, 2026-06-03):
--     • 4 RPCs in 20260603070000_fn_yoy_actionable_insights_rpcs.sql either had
--       no institution-name filter at all, OR excluded only Main Office + Testing.
--     • fn_yoy_days_to_catchup_per_institution (20260603080000) excluded
--       Main Office + Testing + Nattraja Incubation + Jicate Solutions.
--     • Neither variant excluded "Matric Higher Secondary School", which IS in
--       the data and was leaking into the days-to-catchup card labeled "NA".
--
--   Source of truth: the YoY institution picker
--     app/(routes)/admission/group-dashboard/_components/yoy/yoy-institution-picker.tsx
--   which fetches name LIKE 'JKKN%', then post-filters out any name containing
--   "Main Office", "Testing", "Nattraja", "Matric", or "Jicate".
--
--   That predicate is captured here as public._yoy_admission_institution(name),
--   and every actionable RPC now WHERE-clauses through it.
--
-- Idempotency:
--   The helper is CREATE OR REPLACE. The 5 RPCs are CREATE OR REPLACE with the
--   same signatures + return shapes as their canonical versions
--   (20260603070000 + 20260603080000). Math + ORDER BY shape unchanged — only
--   the institution-scope WHERE clause is now the helper call.
--
-- DO NOT change function signatures here — the service layer
-- (lib/services/admission/yoy-trajectory-service.ts) binds to these names + arg
-- shapes verbatim.

-- =============================================================================
-- Canonical helper
-- =============================================================================
CREATE OR REPLACE FUNCTION public._yoy_admission_institution(p_institution_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_institution_name LIKE 'JKKN%'
     AND p_institution_name NOT LIKE '%Main Office%'
     AND p_institution_name NOT LIKE '%Testing%'
     AND p_institution_name NOT LIKE '%Nattraja%'
     AND p_institution_name NOT LIKE '%Matric%'
     AND p_institution_name NOT LIKE '%Jicate%';
$$;

COMMENT ON FUNCTION public._yoy_admission_institution(text) IS
  'Canonical boolean predicate matching the YoY institution-picker rule from PR #1216. Source of truth: app/(routes)/admission/group-dashboard/_components/yoy/yoy-institution-picker.tsx. Matches names that start with "JKKN" and do not contain "Main Office", "Testing", "Nattraja", "Matric", or "Jicate". All 5 YoY actionable RPCs (institution_health_signals, deposits_leaking, counselor_accountability_grid, first_touch_breaches, days_to_catchup_per_institution) WHERE-clause through this helper so they stay synchronized when admission-context membership changes.';

GRANT EXECUTE ON FUNCTION public._yoy_admission_institution(text) TO authenticated, service_role;


-- =============================================================================
-- 1) Institution Health Signals (Stoplight)
--    Was: i.name LIKE 'JKKN%' AND NOT LIKE Main Office/Testing
--    Now: AND public._yoy_admission_institution(i.name)
-- =============================================================================
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
  WHERE public._yoy_admission_institution(i.name)
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
-- 2) Deposits Leaking — top N programs by reserved-stall count
--    Was: NO institution-name filter (only p_institution_id + lifecycle)
--    Now: JOIN institutions i + AND public._yoy_admission_institution(i.name)
--    Effect: programs at non-admission entities (Main Office, Testing, Nattraja,
--      Matric, Jicate) no longer surface in the leaking-deposits worklist.
-- =============================================================================
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
      AND public._yoy_admission_institution(i.name)
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
--    Was: NO institution-name filter (only p_institution_id)
--    Now: JOIN institutions i in the stale_leads CTE +
--         AND public._yoy_admission_institution(i.name)
-- =============================================================================
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
    SELECT
      al.institution_id,
      COALESCE(al.assigned_counselor_id, al.counselor_id) AS counselor_id,
      COUNT(*) FILTER (WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - INTERVAL '10 days') AS stale_cnt,
      COUNT(*) AS total_cnt
    FROM admission_leads al
    JOIN institutions i_filter ON i_filter.id = al.institution_id
    WHERE al.is_active = true
      AND al.funnel_stage::text IN ('reserved','admitted')
      AND public._yoy_admission_institution(i_filter.name)
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
-- 4) First-Touch SLA Breaches — leads with no activity within 48h
--    Was: NO institution-name filter (only p_institution_id)
--    Now: JOIN institutions i in the breach_leads CTE +
--         AND public._yoy_admission_institution(i.name)
-- =============================================================================
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
  out_kind text
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
    JOIN institutions i_filter ON i_filter.id = al.institution_id
    WHERE al.is_active = true
      AND al.created_at > NOW() - (p_window_days || ' days')::interval
      AND COALESCE(al.last_activity_at, al.created_at) <
          al.created_at + INTERVAL '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM admission_lead_activities ala
        WHERE ala.lead_id = al.id
          AND ala.created_at <= al.created_at + INTERVAL '48 hours'
      )
      AND public._yoy_admission_institution(i_filter.name)
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


-- =============================================================================
-- 5) Days-to-Catch-Up Countdown per institution
--    Was: i.name LIKE 'JKKN%' AND NOT LIKE Main Office/Testing/Nattraja/Jicate
--         (Matric Higher Secondary School slipped through, surfaced as "NA")
--    Now: AND public._yoy_admission_institution(i.name)
-- =============================================================================
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
  current_admitted_per_inst AS (
    SELECT ay.institution_id, COUNT(lp.id)::int AS admitted
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    WHERE ay.program_start_year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
    GROUP BY ay.institution_id
  ),
  prior_final AS (
    SELECT ay.institution_id, SUM(hp.admitted_count)::int AS total
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    WHERE ay.program_start_year = v_prior_year
    GROUP BY ay.institution_id
  ),
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
    GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
      AS out_daily_pace_last_7d,
    CASE
      WHEN COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0) <= 0 THEN NULL::int
      ELSE CEIL(
        (COALESCE(pf.total, 0) - COALESCE(cap.admitted, 0))::numeric
        / GREATEST(COALESCE(ppi.incremental_last_7d, 0)::numeric / 7.0, 0.1)
      )::int
    END AS out_days_to_catchup,
    v_days_remaining AS out_days_remaining,
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
  WHERE public._yoy_admission_institution(i.name)
    AND (p_institution_id IS NULL OR i.id = p_institution_id)
  ORDER BY
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
  'Per-institution days-to-catch-up countdown: at current 7-day pace, how many days needed to reach last year''s final admitted total, vs days remaining until the cycle window end (default Aug 31). Signals RED (won''t make it) / AMBER (tight) / GREEN (comfortable or already past) / NA (no LY data). Institution scope: public._yoy_admission_institution.';

REVOKE ALL ON FUNCTION public.fn_yoy_days_to_catchup_per_institution(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_yoy_days_to_catchup_per_institution(uuid, int, int) TO authenticated;
