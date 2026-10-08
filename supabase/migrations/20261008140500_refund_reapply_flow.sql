-- Re-apply the CURRENT approval flow to ONE open refund request.
--
-- Why: billing_refund_requests.flow_snapshot is frozen at initiation (drift-immune
-- gating). Editing the flow in /billing/settings/refund-approvals therefore never
-- reaches requests already in flight, so their Timeline keeps the old stages.
-- This RPC lets a super admin deliberately re-snapshot a request that has NO
-- approvals yet (stage index 0, nothing to remap). Requests with approvals keep
-- their frozen flow — re-snapshotting would orphan current_stage_index.
--
-- Audit: writes a 'flow_reapplied' row to billing_refund_request_actions so the
-- change shows in the request Timeline.

ALTER TABLE public.billing_refund_request_actions
  DROP CONSTRAINT billing_refund_request_actions_action_type_check;
ALTER TABLE public.billing_refund_request_actions
  ADD CONSTRAINT billing_refund_request_actions_action_type_check
  CHECK (action_type IN ('initiated','approved','declined','disbursed','flow_reapplied'));

CREATE OR REPLACE FUNCTION public.fn_reapply_refund_flow(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req public.billing_refund_requests;
  v_cfg public.billing_refund_flow_configs;
  v_snapshot jsonb;
  v_actor_role text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO v_req FROM public.billing_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status <> 'pending_review' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;
  IF v_req.current_stage_index <> 0 OR EXISTS (
    SELECT 1 FROM public.billing_refund_request_actions a
    WHERE a.request_id = p_request_id AND a.action_type = 'approved'
  ) THEN
    RAISE EXCEPTION 'already_has_approvals';
  END IF;

  v_cfg := public.fn_resolve_refund_flow_config(v_req.institution_id);
  IF v_cfg.id IS NULL THEN RAISE EXCEPTION 'no_flow_configured'; END IF;
  IF jsonb_array_length(v_cfg.stages) = 0 THEN RAISE EXCEPTION 'flow_has_no_stages'; END IF;

  -- Same shape as fn_initiate_refund_request: uuids as strings so jsonb ? works in gating.
  v_snapshot := jsonb_build_object(
    'config_id', v_cfg.id::text,
    'initiator', jsonb_build_object('assignee_roles', to_jsonb(v_cfg.initiator_roles::text[]), 'assignee_users', to_jsonb(v_cfg.initiator_users::text[])),
    'stages', v_cfg.stages,
    'disburser', jsonb_build_object('assignee_roles', to_jsonb(v_cfg.disburser_roles::text[]), 'assignee_users', to_jsonb(v_cfg.disburser_users::text[])));

  IF v_req.flow_snapshot IS NOT DISTINCT FROM v_snapshot THEN
    RAISE EXCEPTION 'flow_already_current';
  END IF;

  SELECT cr.role_name INTO v_actor_role
    FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_user ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1;

  UPDATE public.billing_refund_requests
    SET flow_snapshot = v_snapshot, current_stage_index = 0
    WHERE id = p_request_id;

  INSERT INTO public.billing_refund_request_actions
    (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
  VALUES (p_request_id, 'flow_reapplied', NULL, 'Approval flow re-applied', v_user, v_actor_role,
    format('Flow re-applied from current settings (%s -> %s stages). %s',
      jsonb_array_length(v_req.flow_snapshot->'stages'), jsonb_array_length(v_cfg.stages), btrim(p_reason)),
    '[]'::jsonb);
END; $$;

-- Revoke from BOTH anon and PUBLIC (anon holds a direct default grant on top of PUBLIC).
REVOKE EXECUTE ON FUNCTION public.fn_reapply_refund_flow(uuid,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reapply_refund_flow(uuid,text) TO authenticated;
