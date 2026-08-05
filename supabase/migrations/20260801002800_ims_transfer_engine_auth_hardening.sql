-- Tenant-isolation hardening for the warehouse -> operating-store transfer engine
-- shipped in 20260801002200..002700 (PR #2577).
--
-- Found after that PR merged: the CI anon-lock guards read migration FILE TEXT,
-- and those migrations were hand-applied to production BEFORE the REVOKEs were
-- written into them. CI was green while the live database still let anon EXECUTE
-- all four SECURITY DEFINER transfer functions. SECURITY DEFINER runs as owner
-- and bypasses RLS entirely, so the EXECUTE grant was the only gate.
--
-- The anon revokes were applied to production separately as an emergency fix
-- (ims_transfer_engine_anon_lock_live_backfill); they are restated in the
-- already-merged migrations. This migration closes what remains: an
-- AUTHENTICATED user of one institution being able to move another
-- institution's stock.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Internal-only helpers: remove them from the client API surface entirely.
--
--    ims_ship_out_from_source, ims_receive_into_destination and
--    ims_pick_fefo_batches are called ONLY from inside other SECURITY DEFINER
--    functions (ims_apply_shipment_to_stock, ims_create_push_transfer,
--    ims_ship_out_from_source), never from application code. Inside a SECURITY
--    DEFINER function the privilege check runs as the OWNER, so revoking
--    `authenticated` breaks nothing internally while removing the ability to
--    call them directly over PostgREST.
--
--    This matters because they take only a shipment UUID: without this, any
--    signed-in user could dispatch or receive ANY tenant's shipment. Revoking
--    the grant removes that surface outright rather than guarding it.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.ims_ship_out_from_source(UUID)          FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.ims_receive_into_destination(UUID)      FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.ims_pick_fefo_batches(UUID, UUID, NUMERIC) FROM anon, PUBLIC, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ims_create_push_transfer: validate the caller.
--
--    This one IS called from application code (ImsSupplyTransferService.pushToStore
--    and the bulk-import distribution path), so it keeps its `authenticated`
--    grant and must instead check who is calling.
--
--    As shipped it validated only that p_warehouse_store_id was a warehouse. It
--    never looked at auth.uid(), and it wrote the client-supplied p_actor into
--    requested_by / approved_by / dispatched_by — so any signed-in user could
--    call the RPC directly with another institution's store UUIDs, move that
--    tenant's stock, and stamp the audit trail as anyone they liked.
--
--    p_actor is RETAINED but deliberately ignored, so the signature is unchanged
--    and both existing callers keep working without a DROP FUNCTION. Same
--    convention as p_store_id in ims_next_indent_number.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ims_create_push_transfer(
  p_warehouse_store_id UUID,
  p_dest_store_id      UUID,
  p_actor              UUID,
  p_purpose            TEXT,
  p_lines              JSONB,          -- [{item_id, quantity}]
  p_dispatch_now       BOOLEAN DEFAULT true
)
RETURNS TABLE (request_id UUID, shipment_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       UUID;
  v_inst      UUID;
  v_dest_inst UUID;
  v_is_wh     BOOLEAN;
  v_req       UUID;
  v_ship      UUID;
  v_line      JSONB;
  v_item      UUID;
  v_qty       NUMERIC;
  v_unit      UUID;
  v_cost      NUMERIC;
  v_ri        UUID;
  v_alloc     RECORD;
  v_taken     NUMERIC;
  v_counter   INT;
  v_indent_no TEXT;
BEGIN
  -- The actor is the SESSION, never a parameter. p_actor is accepted only to
  -- keep the signature stable for existing callers and is intentionally unused.
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'No items to send' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT institution_id, is_central_supply_store INTO v_inst, v_is_wh
    FROM public.ims_stores WHERE id = p_warehouse_store_id;

  IF NOT COALESCE(v_is_wh, false) THEN
    RAISE EXCEPTION 'Only a warehouse can send stock to another store'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Tenant isolation. ims_accessible_institution_ids() already unions the
  -- caller's own institution with any active cross-institution store grants,
  -- so this honours the IMS grants model rather than re-implementing it.
  IF v_inst IS NULL OR v_inst NOT IN (SELECT public.ims_accessible_institution_ids()) THEN
    RAISE EXCEPTION 'You do not have access to this institution''s stores'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Same gate the UI applies (isSuperAdmin || canAccess('ims.transfers','dispatch')).
  -- user_has_permission() already short-circuits true for is_super_admin.
  IF NOT public.user_has_permission('ims.transfers.dispatch') THEN
    RAISE EXCEPTION 'You do not have permission to dispatch transfers'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT institution_id INTO v_dest_inst FROM public.ims_stores WHERE id = p_dest_store_id;

  IF v_dest_inst IS DISTINCT FROM v_inst THEN
    RAISE EXCEPTION 'Destination store belongs to a different institution'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_dest_store_id = p_warehouse_store_id THEN
    RAISE EXCEPTION 'Cannot send stock to the warehouse itself'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ims_next_indent_number returns an INTEGER counter; rebuild the same
  -- 'IND-YYMMDD-00001' shape ImsIndentService.generateIndentNumber produces so
  -- push and pull requests are indistinguishable in the UI and in reports.
  v_counter := public.ims_next_indent_number(p_warehouse_store_id, CURRENT_DATE);
  v_indent_no := 'IND-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || lpad(v_counter::text, 5, '0');

  -- Columns are INVERTED: source_store_id = the RECEIVER,
  -- destination_store_id = the SUPPLIER (this warehouse).
  INSERT INTO public.ims_indent_requests (
    indent_number, requested_by, approved_by, approved_at, purpose, urgency, status,
    request_scope, initiation_mode, institution_id, store_id, source_store_id,
    destination_institution_id, destination_store_id
  ) VALUES (
    v_indent_no, v_uid, v_uid, now(),
    COALESCE(p_purpose, 'Warehouse distribution'), 'normal', 'approved',
    'intra_institution', 'push', v_inst, p_dest_store_id, p_dest_store_id,
    v_inst, p_warehouse_store_id
  ) RETURNING id INTO v_req;

  INSERT INTO public.ims_supply_shipments (
    shipment_no, request_id, source_store_id, destination_institution_id,
    destination_store_id, status
  ) VALUES (
    'SHP-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6),
    v_req, p_warehouse_store_id, v_inst, p_dest_store_id, 'preparing'
  ) RETURNING id INTO v_ship;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_item := (v_line->>'item_id')::UUID;
    v_qty  := (v_line->>'quantity')::NUMERIC;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- ims_indent_request_items.unit_id is NOT NULL, so an item with no base unit
    -- cannot be transferred. Fail with a message that says what to fix.
    SELECT base_unit_id, cost_price INTO v_unit, v_cost
      FROM public.ims_items WHERE id = v_item;

    IF v_unit IS NULL THEN
      RAISE EXCEPTION 'Item % has no base unit set - assign one before transferring it', v_item
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    INSERT INTO public.ims_indent_request_items (indent_id, item_id, quantity, unit_id)
    VALUES (v_req, v_item, v_qty, v_unit) RETURNING id INTO v_ri;

    -- Allocate FEFO up front so each shipment line carries a real batch, cost and
    -- expiry. This is what lets the destination inherit expiry on receipt.
    v_taken := 0;
    FOR v_alloc IN
      SELECT * FROM public.ims_pick_fefo_batches(v_item, p_warehouse_store_id, v_qty)
    LOOP
      INSERT INTO public.ims_supply_shipment_items
        (shipment_id, request_item_id, item_id, source_batch_id, dispatched_qty, cost_price)
      VALUES (v_ship, v_ri, v_item, v_alloc.batch_id, v_alloc.take_qty, v_alloc.cost_price);
      v_taken := v_taken + v_alloc.take_qty;
    END LOOP;

    -- Stores with no batch coverage still move on the summary.
    IF v_taken = 0 THEN
      INSERT INTO public.ims_supply_shipment_items
        (shipment_id, request_item_id, item_id, dispatched_qty, cost_price)
      VALUES (v_ship, v_ri, v_item, v_qty, COALESCE(v_cost, 0));
    ELSIF v_taken < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock at the warehouse for item %: asked %, available %',
        v_item, v_qty, v_taken USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Must go preparing -> dispatched via UPDATE. Inserting directly at
  -- 'dispatched' would bypass trg_ims_apply_shipment_to_stock (AFTER UPDATE OF
  -- status) and the stock would never leave the warehouse.
  IF p_dispatch_now THEN
    UPDATE public.ims_supply_shipments
       SET status = 'dispatched', dispatched_at = now(), dispatched_by = v_uid
     WHERE id = v_ship;
  END IF;

  request_id  := v_req;
  shipment_id := v_ship;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.ims_create_push_transfer IS
  'Warehouse-initiated distribution. Creates an already-approved intra_institution request plus its shipment, FEFO-allocates batches, and (by default) dispatches immediately so stock leaves the warehouse. The receiving store then confirms receipt. The actor is taken from auth.uid(); the p_actor parameter is retained for signature compatibility and ignored.';

REVOKE EXECUTE ON FUNCTION public.ims_create_push_transfer(UUID, UUID, UUID, TEXT, JSONB, BOOLEAN) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ims_create_push_transfer(UUID, UUID, UUID, TEXT, JSONB, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Replace the two blanket RLS policies.
--
--    Both tables are written only by the SECURITY DEFINER functions above and
--    are not touched by application code through PostgREST, so scoping them
--    carries no client-side breakage risk.
-- ─────────────────────────────────────────────────────────────────────────────

-- ims_supply_shipment_item_batches carried FOR ALL USING(true) WITH CHECK(true),
-- leaving cost_price, expiry and quantities world-read/write across every tenant.
-- Mirror the ims_supply_shipments policy it hangs off, reached via shipment_item.
DROP POLICY IF EXISTS ims_supply_shipment_item_batches_all ON public.ims_supply_shipment_item_batches;
-- 2026-08-04: 20260801002300 now creates this policy under its final name rather
-- than the permissive `_all` one it used to create, so on a fresh replay the
-- CREATE below would hit 42710 (policy already exists) without this line. Adding
-- a DROP IF EXISTS changes nothing about production — this migration is already
-- applied and will not re-run — it only keeps a from-scratch replay green.
DROP POLICY IF EXISTS ims_supply_shipment_item_batches_select ON public.ims_supply_shipment_item_batches;

CREATE POLICY ims_supply_shipment_item_batches_select
  ON public.ims_supply_shipment_item_batches
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
        FROM public.ims_supply_shipment_items sit
        JOIN public.ims_supply_shipments sh ON sh.id = sit.shipment_id
        JOIN public.ims_stores s
          ON s.id IN (sh.source_store_id, sh.destination_store_id)
       WHERE sit.id = ims_supply_shipment_item_batches.shipment_item_id
         AND s.institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- ims_stock_movements_insert was WITH CHECK (true): any signed-in user could
-- forge ledger rows against any tenant. Scope it to match the SELECT policy.
DROP POLICY IF EXISTS ims_stock_movements_insert ON public.ims_stock_movements;

CREATE POLICY ims_stock_movements_insert ON public.ims_stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_role() = 'super_admin'
    OR institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Drop the write grants Supabase hands `authenticated` by default.
--
--    ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO authenticated means a
--    REVOKE aimed at "anon, PUBLIC" leaves authenticated holding INSERT/UPDATE/
--    DELETE/TRUNCATE. Every write goes through the SECURITY DEFINER functions,
--    so no client needs more than SELECT. Belt and braces behind the policies.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.ims_supply_shipment_item_batches FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON TABLE public.ims_supply_shipment_item_batches TO authenticated;

REVOKE ALL ON TABLE public.ims_stock_movements FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON TABLE public.ims_stock_movements TO authenticated;

-- Counter table: written only by ims_next_indent_number(), read by nothing.
REVOKE ALL ON TABLE public.ims_indent_number_counters_global FROM anon, PUBLIC, authenticated;
