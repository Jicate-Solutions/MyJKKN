-- ============================================================================
-- 20260711093000_procurement_rm_adapter_rpcs.sql
-- Resource Management joins centralized Procurement (PLAN-procurement-v1 §Phase 5).
--
-- WHY RPCs: resources INSERT/UPDATE RLS requires resources.resources.create/edit —
-- permissions a GRN-verifying storekeeper deliberately does NOT hold. These two
-- SECURITY DEFINER functions give procurement a NARROW write path into RM
-- (create a needs-setup draft; top up a quantity) gated on the permission that
-- authorizes the triggering action itself (procurement.grn_verify) plus
-- institution scope — least privilege, no blanket RM grant to store roles.
--
-- Director decisions (2026-07-11 interview) encoded here:
--   * new items arrive as ONE draft record with the full quantity, tagged
--     'needs-setup' under a global "Procurement Intake" holding category;
--     the RM team completes room/caretaker later (auto-draft, complete later).
--   * top-ups NEVER rewrite an existing record's warranty/vendor/value —
--     purchase_date/current_value are set only when currently NULL; the new
--     batch's paper trail lives in procurement_grn/_items.
--
-- SoD/authz notes: fn_procurement_rm_post_receipt binds authority to the TARGET
-- row's institution (not a caller-supplied param); reconcile requires an explicit
-- NOT NULL institution (role_has_institution_access(NULL) is TRUE — known trap).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_procurement_rm_reconcile_new_item(
  p_institution_id uuid,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid;
  v_sub uuid;
  v_id uuid;
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'institution required';
  END IF;
  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('procurement.grn_verify') AND role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'not authorized to receive procurement goods for this institution';
  END IF;
  IF coalesce(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'item name required';
  END IF;

  -- Global holding category (categories have no institution scope). Idempotent.
  SELECT id INTO v_parent FROM resource_parent_categories WHERE name = 'Procurement Intake' LIMIT 1;
  IF v_parent IS NULL THEN
    INSERT INTO resource_parent_categories (name, description, status)
    VALUES ('Procurement Intake', 'Holding category for resources received via procurement, pending setup by the RM team.', 'active')
    RETURNING id INTO v_parent;
  END IF;
  SELECT id INTO v_sub FROM resource_sub_categories
   WHERE parent_category_id = v_parent AND name = 'Pending setup' LIMIT 1;
  IF v_sub IS NULL THEN
    INSERT INTO resource_sub_categories (parent_category_id, name, description, status)
    VALUES (v_parent, 'Pending setup', 'Recategorize during setup.', 'active')
    RETURNING id INTO v_sub;
  END IF;

  INSERT INTO resources (
    name, description, parent_category_id, subcategory_id, institution_id,
    status, initial_stock_quantity, current_stock_quantity, tags,
    resource_code, created_by
  ) VALUES (
    btrim(p_name),
    coalesce(nullif(btrim(p_description), ''), 'Received via procurement — details pending setup.'),
    v_parent, v_sub, p_institution_id,
    'available', 0, 0, ARRAY['needs-setup'],
    'PROC-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_rm_reconcile_new_item(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_rm_reconcile_new_item(uuid, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.fn_procurement_rm_post_receipt(
  p_resource_id uuid,
  p_quantity integer,
  p_total_value numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'accepted quantity must be positive';
  END IF;

  -- Authority binds to the TARGET row's institution, never a caller param.
  SELECT institution_id INTO v_institution FROM resources WHERE id = p_resource_id;
  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'resource not found or has no institution';
  END IF;
  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('procurement.grn_verify') AND role_has_institution_access(v_institution))
  ) THEN
    RAISE EXCEPTION 'not authorized to post receipts for this resource';
  END IF;

  UPDATE resources SET
    -- Schema invariant (CHECK positive_stock_quantities): current <= initial,
    -- i.e. initial = total ever acquired, current = what remains. A receipt
    -- therefore increments BOTH (caught by rolled-back prod validation).
    current_stock_quantity = coalesce(current_stock_quantity, 0) + p_quantity,
    initial_stock_quantity = coalesce(initial_stock_quantity, 0) + p_quantity,
    purchase_date = coalesce(purchase_date, current_date),
    current_value = coalesce(current_value, p_total_value),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = p_resource_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid, integer, numeric) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid, integer, numeric) TO authenticated;
