-- Migration: 20260908064258_resources_serial_number_tracking
-- Purpose:  Support per-unit serial number tracking for non-consumable / electronic
--           assets received through Procurement -> Resource Management, without
--           breaking the existing "one row = one record, quantity absorbs receipts"
--           model that bulk/interchangeable assets (chairs, whiteboards) rely on.
--
-- Model:
--   * resources.serial_number is the per-asset identity; unique per institution.
--   * resource_sub_categories.requires_serial_number is a DEFAULT/HINT surfaced to
--     the receiving screen (mirrors is_chemical's category-default pattern from
--     20260801000200_procurement_category_is_chemical.sql) — NOT a hard DB gate.
--     The receiving user makes the final call at GRN time (same as batch/expiry
--     entry today), because a brand-new item still sits in the generic
--     "Procurement Intake / Pending setup" holding category and cannot yet carry
--     a real subcategory to look the flag up from.
--   * fn_procurement_rm_post_receipt gains an optional p_serial_numbers text[].
--     When omitted, behavior is byte-for-byte identical to before (existing
--     top-up-one-row semantics — every non-serialized item, the overwhelming
--     majority, is unaffected). When provided, one accepted quantity of N units
--     becomes N distinct resources rows, each quantity = 1, each with its own
--     serial — either by claiming the still-blank "needs-setup" draft as unit #1
--     (new-item path) or by leaving the picked existing asset untouched and
--     inserting N fresh sibling rows cloned from it (restock path), per the
--     Director's existing "restock never rewrites the record" rule.

ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS serial_number TEXT;

COMMENT ON COLUMN public.resources.serial_number IS
    'Per-unit asset identity (e.g. laptop/monitor serial). NULL for bulk/interchangeable resources that are not individually serialized.';

-- Partial unique index: only serialized rows are constrained, so bulk assets
-- (which never set this column) never collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS ux_resources_institution_serial_number
    ON public.resources (institution_id, serial_number)
    WHERE serial_number IS NOT NULL;

ALTER TABLE public.resource_sub_categories
    ADD COLUMN IF NOT EXISTS requires_serial_number BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.resource_sub_categories.requires_serial_number IS
    'Default hint for the GRN receiving screen: pre-check "track serial numbers" for items in this subcategory. Not enforced at the DB layer — the receiver can still override per receipt.';

-- Replaces the 20260711* definition. Adds the optional serialized-receipt branch;
-- the non-serialized branch (p_serial_numbers NULL) is unchanged from before.
CREATE OR REPLACE FUNCTION public.fn_procurement_rm_post_receipt(
    p_grn_item_id uuid,
    p_resource_id uuid,
    p_quantity integer,
    p_total_value numeric DEFAULT NULL::numeric,
    p_serial_numbers text[] DEFAULT NULL::text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_institution uuid;
  v_line record;
  v_template record;
  v_is_blank_draft boolean;
  v_unit_value numeric;
  v_serial text;
  v_idx int;
  v_distinct_count int;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'accepted quantity must be positive';
  END IF;

  IF p_serial_numbers IS NOT NULL THEN
    IF array_length(p_serial_numbers, 1) IS DISTINCT FROM p_quantity THEN
      RAISE EXCEPTION 'serial number count (%) must equal accepted quantity (%)',
        coalesce(array_length(p_serial_numbers, 1), 0), p_quantity;
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_serial_numbers) s WHERE coalesce(btrim(s), '') = '') THEN
      RAISE EXCEPTION 'serial numbers cannot be blank';
    END IF;
    SELECT count(DISTINCT btrim(s)) INTO v_distinct_count FROM unnest(p_serial_numbers) s;
    IF v_distinct_count IS DISTINCT FROM p_quantity THEN
      RAISE EXCEPTION 'serial numbers must be unique within this receipt';
    END IF;
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

  IF p_serial_numbers IS NULL THEN
    -- Unchanged path: bulk/interchangeable resource, top up the one row.
    UPDATE resources SET
      current_stock_quantity = coalesce(current_stock_quantity, 0) + p_quantity,
      initial_stock_quantity = coalesce(initial_stock_quantity, 0) + p_quantity,
      purchase_date = coalesce(purchase_date, (now() AT TIME ZONE 'Asia/Kolkata')::date),
      current_value = coalesce(current_value, p_total_value),
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = p_resource_id;
    RETURN true;
  END IF;

  -- Serialized path: lock + snapshot the target row before branching so every
  -- cloned sibling below is built from a single consistent read.
  SELECT name, description, parent_category_id, subcategory_id, tags,
         current_stock_quantity, initial_stock_quantity, serial_number
    INTO v_template
    FROM resources
   WHERE id = p_resource_id
     FOR UPDATE;

  v_is_blank_draft := coalesce(v_template.current_stock_quantity, 0) = 0
                   AND coalesce(v_template.initial_stock_quantity, 0) = 0
                   AND v_template.serial_number IS NULL
                   AND 'needs-setup' = ANY(coalesce(v_template.tags, ARRAY[]::text[]));

  v_unit_value := CASE WHEN p_total_value IS NULL THEN NULL ELSE p_total_value / p_quantity END;
  v_idx := 1;

  IF v_is_blank_draft THEN
    -- New-item path: the draft created by fn_procurement_rm_reconcile_new_item
    -- has never been touched — claim it as physical unit #1 instead of leaving
    -- it as a permanently-empty ghost row.
    v_serial := btrim(p_serial_numbers[1]);
    UPDATE resources SET
      current_stock_quantity = 1,
      initial_stock_quantity = 1,
      serial_number = v_serial,
      purchase_date = coalesce(purchase_date, (now() AT TIME ZONE 'Asia/Kolkata')::date),
      current_value = coalesce(current_value, v_unit_value),
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = p_resource_id;
    v_idx := 2;
  END IF;
  -- Else: restock of an already-set-up serialized asset — the Director's rule
  -- ("top-ups never rewrite the record's warranty/vendor/value") applies here
  -- too: p_resource_id is left completely untouched and used only as a template.

  WHILE v_idx <= p_quantity LOOP
    v_serial := btrim(p_serial_numbers[v_idx]);
    INSERT INTO resources (
      name, description, parent_category_id, subcategory_id, institution_id,
      status, initial_stock_quantity, current_stock_quantity, tags,
      serial_number, resource_code, purchase_date, current_value, created_by
    ) VALUES (
      v_template.name, v_template.description, v_template.parent_category_id,
      v_template.subcategory_id, v_institution,
      'available', 1, 1, v_template.tags,
      v_serial, 'PROC-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      (now() AT TIME ZONE 'Asia/Kolkata')::date, v_unit_value, auth.uid()
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN true;
END;
$function$;
