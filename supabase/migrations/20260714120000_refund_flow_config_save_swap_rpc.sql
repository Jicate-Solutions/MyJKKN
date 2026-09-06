-- 20260714120000_refund_flow_config_save_swap_rpc.sql
-- Fixes: creating/activating a refund flow config for a scope (global or a
-- specific institution) that already has an active config threw a raw
-- "duplicate key value violates unique constraint uq_refund_flow_global_active"
-- (or uq_refund_flow_institution_active) because the client inserted/updated
-- the row directly. Those partial unique indexes are load-bearing —
-- fn_resolve_refund_flow_config() assumes at most one active row per scope —
-- so the fix is an atomic "swap" RPC, not relaxing the constraint: it
-- deactivates the conflicting active row and activates the new one in the
-- same transaction, but only when the caller explicitly confirms
-- (p_replace_active), after being told which flow it would replace.

CREATE OR REPLACE FUNCTION public.fn_save_refund_flow_config(
  p_id uuid, p_institution_id uuid, p_name text,
  p_initiator_roles uuid[], p_initiator_users uuid[], p_stages jsonb,
  p_disburser_roles uuid[], p_disburser_users uuid[],
  p_is_active boolean DEFAULT true, p_replace_active boolean DEFAULT false
) RETURNS billing_refund_flow_configs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_conflict billing_refund_flow_configs;
  v_result billing_refund_flow_configs;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (is_super_admin() OR user_has_permission('billing.refunds.configure')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF jsonb_typeof(p_stages) <> 'array' OR jsonb_array_length(p_stages) = 0 THEN RAISE EXCEPTION 'no_stages'; END IF;

  IF p_is_active THEN
    -- Same-scope match as uq_refund_flow_global_active / uq_refund_flow_institution_active.
    SELECT * INTO v_conflict FROM billing_refund_flow_configs
      WHERE is_active AND institution_id IS NOT DISTINCT FROM p_institution_id
        AND (p_id IS NULL OR id <> p_id)
      FOR UPDATE;
    IF FOUND THEN
      IF NOT p_replace_active THEN
        RAISE EXCEPTION 'active_flow_exists|%|%', v_conflict.id, v_conflict.name;
      END IF;
      UPDATE billing_refund_flow_configs SET is_active = false WHERE id = v_conflict.id;
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO billing_refund_flow_configs
      (institution_id, name, initiator_roles, initiator_users, stages,
       disburser_roles, disburser_users, is_active, created_by)
    VALUES (p_institution_id, btrim(p_name), p_initiator_roles, p_initiator_users, p_stages,
            p_disburser_roles, p_disburser_users, p_is_active, v_user)
    RETURNING * INTO v_result;
  ELSE
    UPDATE billing_refund_flow_configs SET
      institution_id = p_institution_id, name = btrim(p_name),
      initiator_roles = p_initiator_roles, initiator_users = p_initiator_users,
      stages = p_stages, disburser_roles = p_disburser_roles, disburser_users = p_disburser_users,
      is_active = p_is_active
    WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'config_not_found'; END IF;
  END IF;

  RETURN v_result;
END; $$;

REVOKE EXECUTE ON FUNCTION fn_save_refund_flow_config(uuid,uuid,text,uuid[],uuid[],jsonb,uuid[],uuid[],boolean,boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION fn_save_refund_flow_config(uuid,uuid,text,uuid[],uuid[],jsonb,uuid[],uuid[],boolean,boolean) TO authenticated;
