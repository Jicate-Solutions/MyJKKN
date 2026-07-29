-- Phase 4: warehouse-initiated ("push") distribution.
--
-- ims_supply_shipments.request_id is NOT NULL, so a push cannot simply skip the
-- request. Rather than relax the column (and lose every downstream join, filter
-- and audit hook), a push AUTO-CREATES an already-approved request. Every push
-- stays traceable and the whole dispatch/receive engine is reused unchanged.

ALTER TABLE public.ims_indent_requests
  ADD COLUMN IF NOT EXISTS initiation_mode TEXT NOT NULL DEFAULT 'pull';

ALTER TABLE public.ims_indent_requests
  DROP CONSTRAINT IF EXISTS ims_indent_requests_initiation_mode_check;
ALTER TABLE public.ims_indent_requests
  ADD CONSTRAINT ims_indent_requests_initiation_mode_check
  CHECK (initiation_mode IN ('pull', 'push'));

COMMENT ON COLUMN public.ims_indent_requests.initiation_mode IS
  'pull = an operating store requested the stock; push = the warehouse sent it unprompted (request row is auto-created, already approved).';

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
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'No items to send' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT institution_id, is_central_supply_store INTO v_inst, v_is_wh
    FROM public.ims_stores WHERE id = p_warehouse_store_id;

  IF NOT COALESCE(v_is_wh, false) THEN
    RAISE EXCEPTION 'Only a warehouse can send stock to another store'
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
    v_indent_no, p_actor, p_actor, now(),
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
       SET status = 'dispatched', dispatched_at = now(), dispatched_by = p_actor
     WHERE id = v_ship;
  END IF;

  request_id  := v_req;
  shipment_id := v_ship;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.ims_create_push_transfer IS
  'Warehouse-initiated distribution. Creates an already-approved intra_institution request plus its shipment, FEFO-allocates batches, and (by default) dispatches immediately so stock leaves the warehouse. The receiving store then confirms receipt.';

-- Lock anon: this is SECURITY DEFINER and moves stock, so an unauthenticated
-- caller must never be able to invoke it. Postgres grants EXECUTE to PUBLIC by
-- default and Supabase grants anon directly, so an explicit revoke is required.
REVOKE EXECUTE ON FUNCTION public.ims_create_push_transfer(UUID, UUID, UUID, TEXT, JSONB, BOOLEAN) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ims_create_push_transfer(UUID, UUID, UUID, TEXT, JSONB, BOOLEAN) TO authenticated;
