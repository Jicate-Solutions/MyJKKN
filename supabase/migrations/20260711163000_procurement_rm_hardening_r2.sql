-- ============================================================================
-- 20260711163000_procurement_rm_hardening_r2.sql
-- Round-2 review response for PR #1977 (deep-review + risk-review, 2nd pass).
--
--   * DEEP-LOW (purchase_date TZ): current_date evaluates in the DB session TZ
--     (UTC); goods received near midnight IST recorded the previous day. JKKN
--     is a single-TZ (IST) institution — compute the date in Asia/Kolkata.
--   * RISK-MED-3 (recompute clobber): the service-side "read siblings, then
--     write sum" recompute of po_item.received_quantity could interleave under
--     two concurrent verifies and persist a stale sum. Replaced by
--     fn_procurement_recompute_po_line_received: ONE UPDATE with a subselect —
--     the row lock + single-statement snapshot make it atomic and convergent.
--     SECURITY INVOKER on purpose: it grants nothing — the caller's own RLS
--     must already permit the po_item UPDATE (same right the service used for
--     its direct .update()), so there is no new privilege surface to gate.
-- ============================================================================

-- purchase_date in institution TZ (only this line changed; signature identical,
-- so CREATE OR REPLACE keeps grants/ownership intact).
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
    -- Institution-local date, not UTC: near-midnight IST receipts recorded the
    -- previous day under current_date (review r2).
    purchase_date = coalesce(purchase_date, (now() AT TIME ZONE 'Asia/Kolkata')::date),
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
-- Atomic, convergent PO-line receipt recompute (replaces the service-side
-- read-then-write). One statement: the po_item row lock serializes concurrent
-- verifies and the subselect snapshots inside that lock, so the LAST writer
-- always persists the true sum. INVOKER: runs under the caller's RLS — no new
-- privilege; callers who couldn't update the row before still can't.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_procurement_recompute_po_line_received(
  p_po_item_id uuid
)
RETURNS numeric
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE procurement_purchase_order_items poi
     SET received_quantity = coalesce((
           SELECT sum(gi.accepted_quantity)
             FROM procurement_grn_items gi
             JOIN procurement_grn g ON g.id = gi.grn_id
            WHERE gi.po_item_id = poi.id
              AND g.status IN ('accepted', 'partially_accepted', 'completed', 'replacement_requested')
         ), 0)
   WHERE poi.id = p_po_item_id
  RETURNING poi.received_quantity;
$$;

-- Not SECURITY DEFINER, but lock anon anyway (defense in depth; the default
-- schema grant would otherwise hand anon EXECUTE, and anon has no business here).
REVOKE EXECUTE ON FUNCTION public.fn_procurement_recompute_po_line_received(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_recompute_po_line_received(uuid) TO authenticated;
