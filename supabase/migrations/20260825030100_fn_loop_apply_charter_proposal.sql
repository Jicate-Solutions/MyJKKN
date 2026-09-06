-- ============================================================================
-- 20260825030100_fn_loop_apply_charter_proposal.sql
-- ----------------------------------------------------------------------------
-- The ONE door through which a machine-drafted charter lands on loop_registry.
-- Sibling of 20260825030000 (loop_charter_proposals). Mirrors fn_loop_set_owner:
-- SECURITY DEFINER with its OWN is_super_admin() check — the /admin/loops
-- page gate is UI-only; this is the enforcement.
--
-- What approval writes: the FIVE charter legs (outcome_metric · counter_metric ·
-- intervention · baseline_window · remeasure_window) from the proposal's
-- `proposed` jsonb onto the loop_registry row, NULLIF-normalized so a blank
-- leg lands as NULL (= the Tower honestly shows a Meter, never a fake leg).
--
-- What approval does NOT write:
--   * kill_rule — loop_registry has no such column (deliberate; a kill_rule
--     registry column is a candidate follow-up). The rule stays readable on the
--     approved proposal row, which the charters panel keeps showing.
--   * suggested_verdict_owner — owner assignment is fn_loop_set_owner's job
--     (Owners & verdicts panel); a charter approval must not silently
--     reassign a loop's verdict owner.
--
-- V1 simplification (noted in the PR): single super-admin approval. The
-- owner-approves + Director-countersigns dual-sign (rulebook decision #17)
-- arrives once owner rows are live through the #3001 panel.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file (rollback-rehearsal safe).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_loop_apply_charter_proposal(p_proposal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Whole-row variable, never bare column names in expressions — the 42702
  -- out-param-shadows-column class (ref feedback_out_param_name_shadows_column_42702).
  v_prop public.loop_charter_proposals%ROWTYPE;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_prop
    FROM public.loop_charter_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;  -- surfaced as an explicit toast in the panel, never swallowed
  END IF;

  IF v_prop.status <> 'proposed' THEN
    RAISE EXCEPTION 'proposal already decided (status=%)', v_prop.status;
  END IF;

  UPDATE public.loop_registry SET
    outcome_metric   = NULLIF(btrim(v_prop.proposed->>'outcome_metric'), ''),
    counter_metric   = NULLIF(btrim(v_prop.proposed->>'counter_metric'), ''),
    intervention     = NULLIF(btrim(v_prop.proposed->>'intervention'), ''),
    baseline_window  = NULLIF(btrim(v_prop.proposed->>'baseline_window'), ''),
    remeasure_window = NULLIF(btrim(v_prop.proposed->>'remeasure_window'), ''),
    updated_at       = now()
  WHERE loop_key = v_prop.loop_key;
  IF NOT FOUND THEN
    -- FK guarantees this can only happen if the registry row vanished between
    -- proposal and approval — fail loudly rather than stamp a ghost approval.
    RAISE EXCEPTION 'no loop_registry row for loop_key %', v_prop.loop_key;
  END IF;

  UPDATE public.loop_charter_proposals SET
    status     = 'approved',
    decided_by = auth.uid(),
    decided_at = now(),
    updated_at = now()
  WHERE id = p_proposal_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.fn_loop_apply_charter_proposal(uuid) IS
  'Approve a MetaLoop charter proposal: super-admin-asserted (own is_super_admin() check), validates status=proposed, writes the 5 charter legs onto loop_registry (NULLIF-normalized), stamps the proposal approved/decided_by/decided_at. kill_rule + suggested_verdict_owner stay on the proposal row (no registry column / owner assignment is fn_loop_set_owner''s). Returns false when no proposal matches; raises on refusal or an already-decided row.';

-- MANDATORY house policy (2026-06-06): Supabase default privileges grant anon
-- EXECUTE on every new function — revoke explicitly, separate from PUBLIC.
-- Ref: migration 20260605191101 + feedback_supabase_anon_execute_default_grant.
REVOKE EXECUTE ON FUNCTION public.fn_loop_apply_charter_proposal(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loop_apply_charter_proposal(uuid) TO authenticated;
