-- =====================================================================
-- Doctrines v1 — Cluster Rank Public (Task 7a)
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Spec: JKKNKB/MyJKKN/Routines-Stickiness-Ivy-Doctrine.md §8 Doctrine 1
--       (tiered-privacy cluster rank cascade — public for Principal/HOD)
--
-- Ships three artifacts:
--   1. fn_compute_ohs_for_institution(uuid) — auth-bypass OHS computation
--      Extracts the OHS formula from fn_dashboard_metrics into a standalone
--      SECURITY DEFINER helper that materialized-view refreshes can call.
--      (fn_dashboard_metrics has an auth.uid() check that blocks MV refresh.)
--
--   2. mv_cluster_leaderboard_colleges — 8-row materialized view of JKKN
--      colleges ranked by OHS. Filtered via iqac_code IS NOT NULL to exclude
--      the "JKKN Testing Institution" stub.
--
--   3. fn_cluster_rank_public(p_role text) — RPC returning the leaderboard +
--      caller's own college rank. Role-gated: principal/hod/super_admin only.
--
-- User-locked decisions (2026-04-20 Q&A):
--   - HOD gets the college leaderboard tile (Task 7a)
--     AND a later own-DHS-rank tile (Task 7b, deferred)
--   - Filter "JKKN Testing Institution" via iqac_code IS NOT NULL
--
-- Idempotent: CREATE OR REPLACE + DROP MV IF EXISTS + re-create.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helper 1: fn_compute_ohs_for_institution
-- ---------------------------------------------------------------------
-- Pure OHS computation given an institution_id. No auth check.
-- Mirrors the attendance/sla/fees/escalations logic from
-- fn_dashboard_metrics(uuid, uuid) but without the caller-profile gate,
-- so materialized-view refreshes (which have no session) can call it.
--
-- Returns: { score int, band text, components: {attendance, sla, fees, escalations} }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_compute_ohs_for_institution(p_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_today DATE := (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date;
  v_cfg dashboard_config;
  v_att_total INT := 0;
  v_att_present INT := 0;
  v_att_pct NUMERIC := NULL;
  v_att_baseline_pct NUMERIC := NULL;
  v_att_score INT := 100;
  v_sla_compliance INT := 100;
  v_fee_today NUMERIC := 0;
  v_fee_plan NUMERIC := 100000;
  v_fee_score INT := 100;
  v_escalations_open INT := 0;
  v_escalations_score INT := 100;
  v_ohs_score INT;
BEGIN
  SELECT * INTO v_cfg FROM dashboard_config WHERE scope = 'global' LIMIT 1;

  -- Attendance today
  SELECT COALESCE(SUM(cnt_total), 0), COALESCE(SUM(cnt_present), 0)
    INTO v_att_total, v_att_present
  FROM (
    SELECT
      (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*]') AS ja(v))::int AS cnt_total,
      (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*] ? (@.status == "Present")') AS jp(v))::int AS cnt_present
    FROM student_attendance sa
    WHERE sa.attendance_date = v_today
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
  ) agg;

  IF v_att_total > 0 THEN
    v_att_pct := ROUND((v_att_present::numeric * 100.0) / v_att_total, 1);
  END IF;

  -- 7-day attendance baseline
  SELECT AVG(daily_pct) INTO v_att_baseline_pct FROM (
    SELECT CASE WHEN SUM(tot) > 0 THEN (SUM(pres)::numeric * 100.0 / SUM(tot)) ELSE NULL END AS daily_pct
    FROM (
      SELECT sa.attendance_date,
        (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*]') AS ja(v)) AS tot,
        (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*] ? (@.status == "Present")') AS jp(v)) AS pres
      FROM student_attendance sa
      WHERE sa.attendance_date BETWEEN v_today - INTERVAL '7 days' AND v_today - INTERVAL '1 day'
        AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
    ) by_day
    GROUP BY attendance_date
  ) daily;

  IF v_att_pct IS NOT NULL AND v_att_baseline_pct IS NOT NULL AND v_att_baseline_pct > 0 THEN
    v_att_score := LEAST(100, GREATEST(0, ROUND((v_att_pct / v_att_baseline_pct) * 100)::int));
  ELSIF v_att_pct IS NOT NULL THEN
    v_att_score := LEAST(100, GREATEST(0, ROUND(v_att_pct)::int));
  END IF;

  -- SLA compliance on admission leads last 24h with score>=70
  SELECT CASE WHEN COUNT(*) = 0 THEN 100
    ELSE ROUND(COUNT(*) FILTER (WHERE first_touch_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (first_touch_at - created_at))/3600.0 <= v_cfg.cold_lead_threshold_hours
    )::numeric * 100.0 / COUNT(*))::int
  END INTO v_sla_compliance
  FROM admission_leads
  WHERE created_at >= NOW() - INTERVAL '24 hours'
    AND score >= 70
    AND (p_institution_id IS NULL OR institution_id = p_institution_id);

  -- Fees: today's receipt sum vs v_fee_plan target (100000)
  SELECT COALESCE(SUM(payment_amount), 0) INTO v_fee_today
  FROM billing_receipts
  WHERE (receipt_date::date = v_today OR payment_paid_date::date = v_today)
    AND (p_institution_id IS NULL OR institution_id = p_institution_id);
  v_fee_score := LEAST(100, GREATEST(0, ROUND((v_fee_today / NULLIF(v_fee_plan, 0)) * 100)::int));

  -- Escalations: open grievances past SLA
  SELECT COUNT(*) INTO v_escalations_open
  FROM grievance_tickets
  WHERE status NOT IN ('resolved', 'closed', 'cancelled')
    AND sla_deadline IS NOT NULL
    AND sla_deadline < NOW()
    AND (p_institution_id IS NULL OR institution_id = p_institution_id);
  v_escalations_score := GREATEST(0, 100 - (v_escalations_open * 5));

  -- Weighted sum using dashboard_config weights
  v_ohs_score := ROUND(
    (v_att_score * v_cfg.ohs_attendance_weight)
    + (v_sla_compliance * v_cfg.ohs_sla_weight)
    + (v_fee_score * v_cfg.ohs_fees_weight)
    + (v_escalations_score * v_cfg.ohs_escalations_weight)
  )::int;

  RETURN jsonb_build_object(
    'score', v_ohs_score,
    'band', CASE
      WHEN v_ohs_score < v_cfg.ohs_red_ceiling THEN 'red'
      WHEN v_ohs_score < v_cfg.ohs_amber_ceiling THEN 'amber'
      ELSE 'green'
    END,
    'components', jsonb_build_object(
      'attendance', v_att_score,
      'sla', v_sla_compliance,
      'fees', v_fee_score,
      'escalations', v_escalations_score
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_compute_ohs_for_institution(uuid) IS
'Doctrines v1 — Auth-bypass OHS computation for a given institution. Extracted from fn_dashboard_metrics so materialized-view refreshes can call it. SECURITY DEFINER; trust boundary enforced by callers (MV refresh / fn_cluster_rank_public).';

-- Restrict execution: only service role and MV should reach this.
-- authenticated is NOT granted — the RLS boundary sits on fn_cluster_rank_public.
REVOKE ALL ON FUNCTION public.fn_compute_ohs_for_institution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_compute_ohs_for_institution(uuid) TO service_role;


-- ---------------------------------------------------------------------
-- Materialized View: mv_cluster_leaderboard_colleges
-- ---------------------------------------------------------------------
-- 8 rows (one per real JKKN college), ranked by OHS DESC.
-- Filters out the JKKN Testing Institution via iqac_code IS NOT NULL.
-- Rank ties broken by dense_rank() + institution_name ASC (stable).
-- Refreshed weekly (Task 11 will wire the cron route).
-- ---------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.mv_cluster_leaderboard_colleges;

CREATE MATERIALIZED VIEW public.mv_cluster_leaderboard_colleges AS
WITH scored AS (
  SELECT
    i.id AS institution_id,
    i.name AS institution_name,
    i.counselling_code,
    i.iqac_code,
    i.institution_type,
    public.fn_compute_ohs_for_institution(i.id) AS ohs_payload
  FROM public.institutions i
  WHERE i.entity_type = 'institution'
    AND i.is_active = TRUE
    AND i.iqac_code IS NOT NULL  -- excludes "JKKN Testing Institution"
)
SELECT
  institution_id,
  institution_name,
  counselling_code,
  iqac_code,
  institution_type,
  (ohs_payload->>'score')::int AS ohs_score,
  ohs_payload->>'band' AS ohs_band,
  ohs_payload->'components' AS ohs_components,
  dense_rank() OVER (ORDER BY (ohs_payload->>'score')::int DESC, institution_name ASC) AS rank,
  NOW() AS refreshed_at
FROM scored;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cluster_leaderboard_colleges_pk
  ON public.mv_cluster_leaderboard_colleges (institution_id);

CREATE INDEX IF NOT EXISTS idx_mv_cluster_leaderboard_colleges_rank
  ON public.mv_cluster_leaderboard_colleges (rank);

COMMENT ON MATERIALIZED VIEW public.mv_cluster_leaderboard_colleges IS
'Doctrines v1 — 8-college OHS leaderboard, refreshed weekly (Sunday wrap cron). Filter: entity_type=institution, is_active=true, iqac_code IS NOT NULL. Fed by fn_compute_ohs_for_institution.';


-- ---------------------------------------------------------------------
-- Public RPC: fn_cluster_rank_public
-- ---------------------------------------------------------------------
-- Returns: {
--   leaderboard: [{institution_id, institution_name, counselling_code, ohs_score, ohs_band, rank}, ...],
--   caller_institution_id, caller_rank, caller_score,
--   refreshed_at
-- }
--
-- Role gate: caller must be principal/hod/super_admin/admin. Any other
-- role → {forbidden: true, reason: 'role_not_allowed'}.
--
-- This RPC is the authorization boundary — fn_compute_ohs_for_institution
-- is NOT exposed to authenticated users; only the leaderboard output is.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cluster_rank_public(p_role text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_profile profiles;
  v_caller_is_allowed BOOLEAN := FALSE;
  v_caller_rank INT := NULL;
  v_caller_score INT := NULL;
  v_leaderboard jsonb;
  v_refreshed_at timestamptz;
BEGIN
  -- Auth gate
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'leaderboard', '[]'::jsonb,
      'caller_institution_id', NULL,
      'caller_rank', NULL,
      'caller_score', NULL,
      'refreshed_at', NULL,
      'forbidden', TRUE,
      'reason', 'not_authenticated'
    );
  END IF;

  SELECT * INTO v_caller_profile FROM profiles WHERE id = v_caller;
  IF v_caller_profile.id IS NULL THEN
    RETURN jsonb_build_object(
      'leaderboard', '[]'::jsonb,
      'caller_institution_id', NULL,
      'caller_rank', NULL,
      'caller_score', NULL,
      'refreshed_at', NULL,
      'forbidden', TRUE,
      'reason', 'no_caller_profile'
    );
  END IF;

  -- Role gate: principal, hod, super_admin, admin, administrator
  v_caller_is_allowed := (
    v_caller_profile.is_super_admin = TRUE
    OR v_caller_profile.role IN ('principal', 'hod', 'super_admin', 'admin', 'administrator')
  );

  IF NOT v_caller_is_allowed THEN
    RETURN jsonb_build_object(
      'leaderboard', '[]'::jsonb,
      'caller_institution_id', v_caller_profile.institution_id,
      'caller_rank', NULL,
      'caller_score', NULL,
      'refreshed_at', NULL,
      'forbidden', TRUE,
      'reason', 'role_not_allowed'
    );
  END IF;

  -- Build leaderboard from MV
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'institution_id', institution_id,
        'institution_name', institution_name,
        'counselling_code', counselling_code,
        'ohs_score', ohs_score,
        'ohs_band', ohs_band,
        'rank', rank
      ) ORDER BY rank ASC
    ),
    MAX(refreshed_at)
    INTO v_leaderboard, v_refreshed_at
  FROM public.mv_cluster_leaderboard_colleges;

  -- Look up caller's own rank + score
  IF v_caller_profile.institution_id IS NOT NULL THEN
    SELECT rank, ohs_score INTO v_caller_rank, v_caller_score
    FROM public.mv_cluster_leaderboard_colleges
    WHERE institution_id = v_caller_profile.institution_id;
  END IF;

  RETURN jsonb_build_object(
    'leaderboard', COALESCE(v_leaderboard, '[]'::jsonb),
    'caller_institution_id', v_caller_profile.institution_id,
    'caller_rank', v_caller_rank,
    'caller_score', v_caller_score,
    'refreshed_at', v_refreshed_at,
    'forbidden', FALSE
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_cluster_rank_public(text) IS
'Doctrines v1 — Tiered-privacy cluster rank PUBLIC. Returns 8-college OHS leaderboard (full names + scores) + caller''s own rank. Role-gated: principal/hod/super_admin/admin only. Data source: mv_cluster_leaderboard_colleges.';

GRANT EXECUTE ON FUNCTION public.fn_cluster_rank_public(text) TO authenticated;


-- ---------------------------------------------------------------------
-- Self-test: confirm MV has 8 rows + RPC shape is correct
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_count INT;
  v_result jsonb;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.mv_cluster_leaderboard_colleges;
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'mv_cluster_leaderboard_colleges expected 8 rows, got %', v_count;
  END IF;

  -- Unauthenticated shape test
  v_result := public.fn_cluster_rank_public();
  IF NOT (v_result ? 'leaderboard') OR NOT (v_result ? 'caller_rank') THEN
    RAISE EXCEPTION 'fn_cluster_rank_public missing expected keys';
  END IF;

  RAISE NOTICE 'Doctrines v1 cluster rank public: MV has % rows, RPC shape OK.', v_count;
END;
$$;
