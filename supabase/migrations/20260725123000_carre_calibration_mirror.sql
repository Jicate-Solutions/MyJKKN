-- ============================================================================
-- CARRE predict-then-see CALIBRATION MIRROR (ADDITIVE)
-- 2026-07-25 · Culture mechanism v1 (Director interview, 2026-07-25):
--   • Team members PREDICT the sealed participant medians (incl. RS items)
--     BEFORE seeing them; the reward is CALIBRATION, not level. Predicting
--     accurately that participants feel unheard is rewarded over claiming
--     they feel heard — which makes coercing high sealed scores pointless
--     (secret-ballot logic, extended to the reader's own incentives).
--   • Predict-then-SEE contract: a k≥3 actual is revealed to a team member
--     ONLY for items they committed a prediction on, and a prediction can no
--     longer be placed or edited once its actual is revealed ('already_revealed').
--   • HARD DATA-GATE (mechanizes existing doctrine, no invented thresholds):
--     you cannot predict CARRE-A3 ("fast feedback loops") at 3+ while your OWN
--     OD/leave approval queue holds waiting people — the same queue
--     fn_work_signals_for('od_requests_waiting') already shows you.
--   • The seal is untouched: reveals are k≥3 lane='own' aggregates only —
--     never identities, never sub-k, nothing a predictor couldn't eventually
--     see; they just have to commit first.
-- ============================================================================

-- 1) Prediction store — one row per (cycle, item, predictor).
CREATE TABLE IF NOT EXISTS public.carre_calibration_predictions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id         uuid NOT NULL REFERENCES public.audit_cycles(id) ON DELETE CASCADE,
  parameter_code   text NOT NULL,
  predictor_id     uuid NOT NULL,
  predicted_median smallint NOT NULL CHECK (predicted_median BETWEEN 0 AND 4),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, parameter_code, predictor_id)
);

CREATE INDEX IF NOT EXISTS idx_carre_calibration_predictions_cycle
  ON public.carre_calibration_predictions (cycle_id, predictor_id);

COMMENT ON TABLE public.carre_calibration_predictions IS
  'CARRE predict-then-see calibration mirror: a team member''s predictions of the sealed participant medians, committed BEFORE the k>=3 actuals are revealed to them. Reward calibration, not level. Writes only via fn_carre_predict_median.';

ALTER TABLE public.carre_calibration_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carre_calibration_predictions_own ON public.carre_calibration_predictions;
CREATE POLICY carre_calibration_predictions_own ON public.carre_calibration_predictions
  FOR SELECT USING (predictor_id = auth.uid() OR is_super_admin());
-- No INSERT/UPDATE/DELETE policies: the RPC below is the only write path.

REVOKE ALL ON public.carre_calibration_predictions FROM anon, PUBLIC;
GRANT SELECT ON public.carre_calibration_predictions TO authenticated;

-- 2) Write path — team members only; frozen after reveal; A3 data-gate.
CREATE OR REPLACE FUNCTION public.fn_carre_predict_median(
  p_cycle_id uuid,
  p_parameter_code text,
  p_predicted int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_od_waiting int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Learners speak through the sealed lane; the mirror is for team members.
  IF COALESCE(get_current_user_role(), '') IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'team_members_only');
  END IF;

  IF p_predicted IS NULL OR p_predicted < 0 OR p_predicted > 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_prediction');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_cycles c
    WHERE c.id = p_cycle_id
      AND c.frameworks @> ARRAY['CARRE']::text[]
      AND c.closed_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cycle_not_open');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_parameter_catalog p
    WHERE p.code = p_parameter_code AND p.code LIKE 'CARRE-%'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_parameter');
  END IF;

  -- Predict-then-see: once the k>=3 'own'-lane actual exists, this item is
  -- revealed (to committed predictors) — no placing or editing after that.
  IF (SELECT count(*) FROM public.carre_participant_scores s
      WHERE s.cycle_id = p_cycle_id
        AND s.parameter_code = p_parameter_code
        AND s.lane = 'own') >= 3 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_revealed');
  END IF;

  -- HARD DATA-GATE (A3, existing doctrine): your own approval queue is the
  -- measured stream for "fast loops". Same count fn_work_signals_for shows.
  IF p_parameter_code = 'CARRE-A3' AND p_predicted >= 3 THEN
    SELECT count(*)::int INTO v_od_waiting
    FROM public.leave_onduty_approvals a
    WHERE a.approver_id = v_uid AND a.status::text = 'pending';
    IF v_od_waiting > 0 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'data_gate_a3',
                                'od_waiting', v_od_waiting);
    END IF;
  END IF;

  INSERT INTO public.carre_calibration_predictions
    (cycle_id, parameter_code, predictor_id, predicted_median)
  VALUES (p_cycle_id, p_parameter_code, v_uid, p_predicted)
  ON CONFLICT (cycle_id, parameter_code, predictor_id) DO UPDATE
    SET predicted_median = EXCLUDED.predicted_median,
        updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_predict_median(uuid, text, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_predict_median(uuid, text, int) TO authenticated;

-- 3) Read path — the mirror. Caller's OWN predictions; k>=3 'own'-lane actual
--    revealed ONLY where a prediction was committed; abs error computed.
--    p_cycle_id NULL = all cycles (calibration over time).
CREATE OR REPLACE FUNCTION public.fn_carre_calibration_mirror(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE (
  cycle_id uuid,
  cycle_name text,
  parameter_code text,
  predicted_median smallint,
  predicted_at timestamptz,
  actual_median numeric,
  scorers int,
  abs_error numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT pr.cycle_id,
         c.name,
         pr.parameter_code,
         pr.predicted_median,
         pr.updated_at,
         a.actual_median,
         COALESCE(a.scorers, 0)::int,
         CASE WHEN a.actual_median IS NULL THEN NULL
              ELSE abs(pr.predicted_median - a.actual_median) END
  FROM public.carre_calibration_predictions pr
  JOIN public.audit_cycles c ON c.id = pr.cycle_id
  LEFT JOIN LATERAL (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s.score)::numeric AS actual_median,
           count(*)::int AS scorers
    FROM public.carre_participant_scores s
    WHERE s.cycle_id = pr.cycle_id
      AND s.parameter_code = pr.parameter_code
      AND s.lane = 'own'
    HAVING count(*) >= 3            -- the k-floor: below 3, no reveal, ever
  ) a ON true
  WHERE pr.predictor_id = v_uid
    AND (p_cycle_id IS NULL OR pr.cycle_id = p_cycle_id)
  ORDER BY c.created_at DESC, pr.parameter_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_calibration_mirror(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_calibration_mirror(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
