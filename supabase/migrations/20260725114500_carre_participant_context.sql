-- ============================================================================
-- CARRE sealed participant lane — the CONTEXT read RPC (ADDITIVE)
-- 2026-07-25 · Companion to 20260725101500_carre_participant_scoring_sealed.sql
--
-- WHY: learners can reach fn_carre_participant_score (the sealed write) but had
-- NO read path to discover the cycle's name, open-state, or the frozen 25-item
-- CARRE catalog — audit_cycles and audit_parameter_catalog RLS are both
-- leadership-gated. Without this, the scoring door page cannot render, so the
-- sealed lane is unreachable in practice (the Learners Council literally could
-- not submit). This RPC serves exactly what the door needs, learner-gated,
-- mirroring fn_carre_participant_score's own gates.
--
-- Returns the caller's OWN previous submissions (resume/edit) — their own data,
-- never anyone else's. The seal is untouched: no other scorer's row, no
-- identities, no aggregates below the k-floor ever leave this function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_carre_participant_context(p_cycle_id uuid)
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

  -- Mirror of fn_carre_participant_score: the sealed lane is for learners.
  IF COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'learners_only');
  END IF;

  SELECT c.id, c.name, c.description, c.phase, c.participant_scoring_open,
         c.parameter_catalog_snapshot
    INTO v_cycle
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id
    AND c.frameworks @> ARRAY['CARRE']::text[];

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF NOT v_cycle.participant_scoring_open THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cycle_not_open');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_cycle.id,
      'name', v_cycle.name,
      'audience', v_cycle.description,
      'phase', v_cycle.phase
    ),
    'setting_code', v_cycle.parameter_catalog_snapshot ->> 'setting_code',
    'parameters', COALESCE(v_cycle.parameter_catalog_snapshot -> 'parameters', '[]'::jsonb),
    'my_scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'parameter_code', s.parameter_code,
               'lane', s.lane,
               'score', s.score,
               'evidence_note', s.evidence_note))
      FROM public.carre_participant_scores s
      WHERE s.cycle_id = p_cycle_id AND s.scorer_id = v_uid
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_participant_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_participant_context(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
