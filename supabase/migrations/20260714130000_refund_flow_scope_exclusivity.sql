-- 20260714130000_refund_flow_scope_exclusivity.sql
-- New business rule (product decision 2026-07-14): a Global flow and any
-- institution-specific flow must never both be active at once. Previously
-- Global was a fallback default with per-institution override (they could
-- coexist; fn_resolve_refund_flow_config preferred the institution-specific
-- one). Going forward: activating a Global flow requires every
-- institution-specific flow to be inactive first, and activating an
-- institution-specific flow requires the Global flow to be inactive first.
-- Multiple institution-specific flows for DIFFERENT institutions still
-- coexist fine (unaffected -- still one per institution via
-- uq_refund_flow_institution_active).
--
-- Two layers, per this codebase's convention of not trusting a single write
-- path: fn_save_refund_flow_config() is rebuilt (CREATE OR REPLACE requires
-- the full body, not a diff) to detect ALL rows that must be deactivated
-- (same-scope duplicate + opposing scope-mode) and, on confirmation, swap
-- them out atomically. A BEFORE INSERT/UPDATE trigger enforces the opposing
-- scope-mode rule unconditionally as a backstop against any future direct
-- write that skips the RPC (the existing uq_refund_flow_*_active indexes
-- already cover the same-scope half of the invariant).

CREATE OR REPLACE FUNCTION public.fn_save_refund_flow_config(
  p_id uuid, p_institution_id uuid, p_name text,
  p_initiator_roles uuid[], p_initiator_users uuid[], p_stages jsonb,
  p_disburser_roles uuid[], p_disburser_users uuid[],
  p_is_active boolean DEFAULT true, p_replace_active boolean DEFAULT false
) RETURNS billing_refund_flow_configs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_conflicts jsonb;
  v_conflict_ids uuid[];
  v_result billing_refund_flow_configs;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (is_super_admin() OR user_has_permission('billing.refunds.configure')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF jsonb_typeof(p_stages) <> 'array' OR jsonb_array_length(p_stages) = 0 THEN RAISE EXCEPTION 'no_stages'; END IF;

  IF p_is_active THEN
    -- Every active row that must be deactivated for this one to become
    -- active: same scope (mirrors uq_refund_flow_global_active /
    -- uq_refund_flow_institution_active) OR the opposing scope-mode
    -- (global XOR institution-specific).
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.institution_id NULLS FIRST),
           array_agg(c.id)
      INTO v_conflicts, v_conflict_ids
    FROM billing_refund_flow_configs c
    WHERE c.is_active
      AND (p_id IS NULL OR c.id <> p_id)
      AND (
        c.institution_id IS NOT DISTINCT FROM p_institution_id
        OR (p_institution_id IS NULL) <> (c.institution_id IS NULL)
      );

    IF v_conflicts IS NOT NULL THEN
      IF NOT p_replace_active THEN
        RAISE EXCEPTION 'active_flow_exists|%', v_conflicts::text;
      END IF;
      UPDATE billing_refund_flow_configs SET is_active = false WHERE id = ANY(v_conflict_ids);
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

CREATE OR REPLACE FUNCTION public.fn_enforce_refund_flow_scope_exclusivity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_active AND EXISTS (
    SELECT 1 FROM billing_refund_flow_configs c
    WHERE c.is_active AND c.id <> NEW.id
      AND (NEW.institution_id IS NULL) <> (c.institution_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'refund_flow_scope_conflict: cannot activate a % flow while a % flow is active -- deactivate it first',
      CASE WHEN NEW.institution_id IS NULL THEN 'global' ELSE 'institution-specific' END,
      CASE WHEN NEW.institution_id IS NULL THEN 'institution-specific' ELSE 'global' END;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_refund_flow_scope_exclusivity ON billing_refund_flow_configs;
CREATE TRIGGER trigger_refund_flow_scope_exclusivity
  BEFORE INSERT OR UPDATE ON billing_refund_flow_configs
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_refund_flow_scope_exclusivity();
