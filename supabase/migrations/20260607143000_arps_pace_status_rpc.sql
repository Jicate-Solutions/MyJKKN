-- Migration: 2026-06-07 14:30 IST
-- Purpose:
--   Phase 1 of the Admission Revenue Pace System (ARPS) — Director-locked
--   2026-06-07 in 6-section strategy interview. Adds fn_arps_pace_status:
--   per-institution RPC returning current fill % vs expected fill % vs
--   alert severity, computed against last 2 years' same-day-of-cycle HP data
--   (yesterday's restoration in PR #1231 is the substrate).
--
-- Director-locked design choices (interview 2026-06-07):
--   - P&L lens = institutional total revenue (not per-seat margin)
--   - Family = institution (8 families, 1:1 map, no separate family table)
--   - Pace line = avg of 2024 + 2025 same-day fill % (HP-derived)
--   - Variable alert by stage:
--       ≤ Day 60: fire if (expected - actual) >= 10 percentage points
--       Day 61–120: fire if (expected - actual) >= 15 percentage points
--       Day 121–180: fire if (expected - actual) >= 20 percentage points
--   - Alert-only (no auto-action) — Director decides which Tier 1–4 lever
--   - Sanctioned denominator = current programs.sanctioned_intake (Phase 1
--     simplification; if past sanctioned grew, this slightly understates
--     historical pace, which is acceptable. Phase 2 will use per-year
--     sanctioned from _bak_admission_year_quota_seats_20260605 restoration.)
--
-- Two institutions chronically have NULL sanctioned data:
--   - JKKN College of Arts and Science (Aided): 13 programs, all sanctioned=0
--   - JKKN College of Education: 12 programs, all sanctioned=0
-- Both have HP rows (so admits ARE happening) but never had sanctioned populated
-- (verified absent in both current programs.sanctioned_intake AND backup
-- _bak_admission_years_20260605.sanctioned_intake). They are returned with
-- alert_severity = 'DATA-MISSING' so the UI surfaces the data-quality gap
-- as a forcing function for the principals.

DROP FUNCTION IF EXISTS public.fn_arps_pace_status(uuid);

CREATE OR REPLACE FUNCTION public.fn_arps_pace_status(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_institution_id uuid,
  out_institution_name text,
  out_current_day_n int,
  out_total_sanctioned int,
  out_admitted_so_far int,
  out_actual_fill_pct numeric,
  out_expected_fill_pct numeric,
  out_gap_pp numeric,
  out_alert_severity text,
  out_hp_2024_admitted int,
  out_hp_2025_admitted int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_year int;
  v_lifecycle text[];
  v_today date := CURRENT_DATE;
  v_current_day_n int;
BEGIN
  v_lifecycle := public._yoy_admitted_lifecycle_set();

  SELECT MAX(ay.year) INTO v_current_year
  FROM admission_years ay
  WHERE ay.is_active = true;

  IF v_current_year IS NULL THEN
    RETURN;
  END IF;

  v_current_day_n := GREATEST(0, (v_today - make_date(v_current_year, 4, 1))::int);

  RETURN QUERY
  WITH
  family_institutions AS (
    SELECT i.id, i.name::text AS name
    FROM institutions i
    WHERE i.name ILIKE 'JKKN%'
      AND i.name NOT ILIKE '%Main Office%'
      AND i.name NOT ILIKE '%Testing%'
      AND i.name NOT ILIKE '%Nattraja%'
      AND i.name NOT ILIKE '%Matric%'
      AND i.name NOT ILIKE '%Jicate%'
  ),
  family_sanctioned AS (
    SELECT
      fi.id AS institution_id,
      COALESCE(SUM(p.sanctioned_intake), 0)::int AS total_sanctioned
    FROM family_institutions fi
    LEFT JOIN programs p
      ON p.institution_id = fi.id
     AND p.sanctioned_intake > 0
    GROUP BY fi.id
  ),
  current_admits AS (
    SELECT
      ay.institution_id,
      COUNT(*)::int AS admitted_so_far
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
    JOIN family_institutions fi ON fi.id = ay.institution_id
    WHERE ay.year = v_current_year
      AND lp.lifecycle_status::text = ANY(v_lifecycle)
      AND COALESCE(lp.activated_at, lp.created_at) IS NOT NULL
    GROUP BY ay.institution_id
  ),
  hp_2024 AS (
    SELECT
      ay.institution_id,
      COALESCE(SUM(hp.admitted_count), 0)::int AS admitted_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN family_institutions fi ON fi.id = ay.institution_id
    WHERE ay.year = 2024
      AND (hp.admission_date - make_date(2024, 4, 1))::int <= v_current_day_n
    GROUP BY ay.institution_id
  ),
  hp_2025 AS (
    SELECT
      ay.institution_id,
      COALESCE(SUM(hp.admitted_count), 0)::int AS admitted_count
    FROM admission_historical_pivot hp
    JOIN admission_years ay ON ay.id = hp.admission_year_id
    JOIN family_institutions fi ON fi.id = ay.institution_id
    WHERE ay.year = 2025
      AND (hp.admission_date - make_date(2025, 4, 1))::int <= v_current_day_n
    GROUP BY ay.institution_id
  ),
  metric_compute AS (
    SELECT
      fi.id AS institution_id,
      fi.name AS institution_name,
      fs.total_sanctioned,
      COALESCE(ca.admitted_so_far, 0) AS admitted_so_far,
      COALESCE(h24.admitted_count, 0) AS hp_2024,
      COALESCE(h25.admitted_count, 0) AS hp_2025,
      CASE WHEN fs.total_sanctioned > 0
        THEN (COALESCE(ca.admitted_so_far, 0)::numeric / fs.total_sanctioned * 100)
        ELSE NULL
      END AS actual_pct,
      CASE WHEN fs.total_sanctioned > 0
        THEN ((COALESCE(h24.admitted_count, 0) + COALESCE(h25.admitted_count, 0))::numeric
              / 2 / fs.total_sanctioned * 100)
        ELSE NULL
      END AS expected_pct
    FROM family_institutions fi
    LEFT JOIN family_sanctioned fs ON fs.institution_id = fi.id
    LEFT JOIN current_admits ca ON ca.institution_id = fi.id
    LEFT JOIN hp_2024 h24 ON h24.institution_id = fi.id
    LEFT JOIN hp_2025 h25 ON h25.institution_id = fi.id
  )
  SELECT
    mc.institution_id,
    mc.institution_name,
    v_current_day_n,
    mc.total_sanctioned,
    mc.admitted_so_far,
    ROUND(mc.actual_pct, 2),
    ROUND(mc.expected_pct, 2),
    ROUND(mc.actual_pct - mc.expected_pct, 2) AS gap_pp,
    CASE
      WHEN mc.total_sanctioned = 0 THEN 'DATA-MISSING'
      WHEN v_current_day_n <= 60
           AND (mc.expected_pct - mc.actual_pct) >= 10
           THEN 'EARLY-LAG'
      WHEN v_current_day_n BETWEEN 61 AND 120
           AND (mc.expected_pct - mc.actual_pct) >= 15
           THEN 'MID-LAG'
      WHEN v_current_day_n BETWEEN 121 AND 180
           AND (mc.expected_pct - mc.actual_pct) >= 20
           THEN 'LATE-LAG'
      ELSE NULL
    END AS alert_severity,
    mc.hp_2024,
    mc.hp_2025
  FROM metric_compute mc
  WHERE p_institution_id IS NULL OR mc.institution_id = p_institution_id
  ORDER BY mc.institution_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_arps_pace_status(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_arps_pace_status(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_arps_pace_status(uuid) IS
  'ARPS Phase 1: per-institution pace status. Family = institution. Pace = avg of 2024+2025 same-day-of-cycle %. Variable alert by stage. Director-locked 2026-06-07.';
