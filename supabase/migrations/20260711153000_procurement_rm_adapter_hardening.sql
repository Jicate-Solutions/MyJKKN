-- ============================================================================
-- 20260711153000_procurement_rm_adapter_hardening.sql
-- Review-response hardening for the RM procurement adapter (PR #1977).
-- Supersedes the two RPC definitions from 20260711093000 (old signatures are
-- DROPPED — safe: the code half of the adapter was not yet deployed, so no
-- production caller ever used the 3-arg/3-arg forms).
--
-- Findings addressed (deep-review + risk-review on PR #1977):
--   * RISK-HIGH-1: fn_procurement_rm_post_receipt was callable by any
--     grn_verify holder on ANY resource in their institution. Now the write is
--     BOUND to a real GRN line: the line must belong to a verified
--     resource_mgmt GRN in the same institution, be linked to exactly this
--     resource, and the posted quantity must equal the line's accepted
--     quantity. The unbounded "inflate any asset" primitive is gone.
--   * DEEP-HIGH-1 / RISK-HIGH-2 (idempotency half): the function now claims the
--     line via UPDATE ... SET domain_posted_at WHERE domain_posted_at IS NULL
--     before touching stock — a plpgsql body is one transaction, so claim +
--     increment are atomic. Re-posting the same line is a no-op (returns
--     false), which makes the service-layer verify loop safely retryable.
--   * DEEP-MED-4: the "Procurement Intake" category get-or-create is
--     serialized with pg_advisory_xact_lock — two concurrent first-ever
--     new-item receipts can no longer insert duplicate holding categories.
--   * RISK-MED-4: reconcile now takes the PO line id, locks it FOR UPDATE, and
--     reuses its already-materialized draft — a split delivery (GRN2 verified
--     after GRN1 materialized the item) tops up the SAME draft instead of
--     creating a second one. The domain_item_id backfill happens inside the
--     same transaction, closing the stale-snapshot race at the DB level.
--
-- Authz model unchanged: procurement.grn_verify + institution scope, authority
-- bound to the TARGET row's institution; reconcile still rejects NULL
-- institution (role_has_institution_access(NULL) is TRUE — known trap).
-- ============================================================================

-- Idempotency marker: when this line's accepted quantity was posted into the
-- domain inventory. Consulted by the RM RPC (atomic claim) and by the verify
-- loop's retry path (skip already-posted lines). Nullable + additive: existing
-- verified IMS lines stay NULL and are never re-posted because their GRNs are
-- already terminal.
ALTER TABLE procurement_grn_items
  ADD COLUMN IF NOT EXISTS domain_posted_at timestamptz;

COMMENT ON COLUMN procurement_grn_items.domain_posted_at IS
  'Set when the accepted quantity was posted to the domain inventory (exactly-once claim; see fn_procurement_rm_post_receipt).';


-- ----------------------------------------------------------------------------
-- fn_procurement_rm_post_receipt — now line-bound + exactly-once.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_procurement_rm_post_receipt(uuid, integer, numeric);

CREATE OR REPLACE FUNCTION public.fn_procurement_rm_post_receipt(
  p_grn_item_id uuid,
  p_resource_id uuid,
  p_quantity integer,
  p_total_value numeric DEFAULT NULL
)
RETURNS boolean  -- true = posted; false = line already posted (idempotent no-op)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution uuid;
  v_line record;
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

  -- The write must be driven by a real verified GRN line for THIS resource in
  -- THIS institution (risk-review HIGH-1: no free-standing increment primitive).
  SELECT gi.accepted_quantity, gi.domain_item_id,
         g.institution_id AS grn_institution, g.domain, g.status
    INTO v_line
    FROM procurement_grn_items gi
    JOIN procurement_grn g ON g.id = gi.grn_id
   WHERE gi.id = p_grn_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRN line not found';
  END IF;
  IF v_line.domain IS DISTINCT FROM 'resource_mgmt' THEN
    RAISE EXCEPTION 'GRN line does not belong to the resource_mgmt domain';
  END IF;
  IF v_line.status NOT IN ('accepted', 'partially_accepted', 'completed', 'replacement_requested') THEN
    RAISE EXCEPTION 'GRN is not verified; cannot post its lines';
  END IF;
  IF v_line.domain_item_id IS DISTINCT FROM p_resource_id THEN
    RAISE EXCEPTION 'GRN line is not linked to this resource';
  END IF;
  IF v_line.grn_institution IS DISTINCT FROM v_institution THEN
    RAISE EXCEPTION 'GRN institution does not match the resource institution';
  END IF;
  IF p_quantity::numeric IS DISTINCT FROM v_line.accepted_quantity THEN
    RAISE EXCEPTION 'quantity must equal the GRN line''s accepted quantity';
  END IF;

  -- Exactly-once claim (deep-review HIGH-1). Claim + increment share this
  -- function's transaction, so a failure after the claim rolls both back.
  UPDATE procurement_grn_items
     SET domain_posted_at = now()
   WHERE id = p_grn_item_id AND domain_posted_at IS NULL;
  IF NOT FOUND THEN
    RETURN false; -- already posted (retry / double-click) — safe no-op
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

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid, uuid, integer, numeric) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid, uuid, integer, numeric) TO authenticated;


-- ----------------------------------------------------------------------------
-- fn_procurement_rm_reconcile_new_item — now race-free + split-delivery-safe.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_procurement_rm_reconcile_new_item(uuid, text, text);

CREATE OR REPLACE FUNCTION public.fn_procurement_rm_reconcile_new_item(
  p_institution_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_po_item_id uuid DEFAULT NULL
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
  v_existing uuid;
  v_po_institution uuid;
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

  -- Split-delivery dedup (risk-review MED-4): lock the PO line and reuse its
  -- already-materialized draft instead of trusting the caller's stale snapshot.
  IF p_po_item_id IS NOT NULL THEN
    SELECT poi.domain_item_id, po.institution_id
      INTO v_existing, v_po_institution
      FROM procurement_purchase_order_items poi
      JOIN procurement_purchase_orders po ON po.id = poi.po_id
     WHERE poi.id = p_po_item_id
       FOR UPDATE OF poi;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PO line not found';
    END IF;
    IF v_po_institution IS DISTINCT FROM p_institution_id THEN
      RAISE EXCEPTION 'PO line belongs to a different institution';
    END IF;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing; -- GRN1 already materialized this item — top up, don't duplicate
    END IF;
  END IF;

  -- Global holding category (categories have no institution scope). The
  -- advisory lock serializes concurrent first-ever creates (deep-review MED-4);
  -- it is transaction-scoped, so it releases automatically on commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtext('procurement_rm_intake_category'));
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

  -- Backfill the PO line inside this same transaction so a concurrent verify
  -- of a sibling GRN (blocked above on FOR UPDATE) sees the link, not NULL.
  IF p_po_item_id IS NOT NULL THEN
    UPDATE procurement_purchase_order_items
       SET domain_item_id = v_id
     WHERE id = p_po_item_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_rm_reconcile_new_item(uuid, text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_rm_reconcile_new_item(uuid, text, text, uuid) TO authenticated;
