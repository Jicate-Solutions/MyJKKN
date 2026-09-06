-- ============================================================================
-- CARRE calibration mirror — the CONTEXT read RPC for predictors (ADDITIVE)
-- 2026-07-25 · Companion to 20260725123000_carre_calibration_mirror.sql
--
-- WHY: the prediction page needs the cycle's name + frozen 25-item catalog,
-- but team members below audit leadership (the very people the mirror is for)
-- cannot read audit_cycles / audit_parameter_catalog under their RLS, and
-- fn_carre_participant_context is learner-gated by design. This is its
-- team-member mirror: same shape, inverted role gate, no score data at all
-- (predictions and reveals flow through fn_carre_calibration_mirror only).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_carre_predict_context(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cycle record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  IF COALESCE(get_current_user_role(), '') IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'team_members_only');
  END IF;

  SELECT c.id, c.name, c.description, c.phase, c.closed_at,
         c.participant_scoring_open, c.parameter_catalog_snapshot
    INTO v_cycle
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id
    AND c.frameworks @> ARRAY['CARRE']::text[];

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF v_cycle.closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cycle_closed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_cycle.id,
      'name', v_cycle.name,
      'audience', v_cycle.description,
      'phase', v_cycle.phase,
      'participant_scoring_open', v_cycle.participant_scoring_open
    ),
    'setting_code', v_cycle.parameter_catalog_snapshot ->> 'setting_code',
    'parameters', COALESCE(v_cycle.parameter_catalog_snapshot -> 'parameters', '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_predict_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_predict_context(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
