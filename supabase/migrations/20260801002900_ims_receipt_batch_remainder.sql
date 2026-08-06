-- Fix: on a short (variance) receipt the destination's summary and its batch rows
-- disagree.
--
-- ims_receive_into_destination credits ims_stock_summary the EXACT received_qty,
-- but rebuilds the batch rows as ROUND(alloc.quantity * received/dispatched, 2)
-- per source allocation, with `CONTINUE WHEN v_qty <= 0` silently dropping any
-- allocation that rounds to zero. Independently-rounded parts do not sum back to
-- the whole: receiving 10 of 3 dispatched allocations of 3.333 credits the
-- summary 10.00 while the batches total 9.99 — and a dropped sliver loses more.
--
-- That is the same summary-vs-batch divergence Phase 2 (20260801002300) set out
-- to eliminate, reintroduced on the variance path. It matters because FEFO picks
-- from batches while every stock figure the UI shows comes from the summary, so
-- the two drift apart silently until a transfer cannot find stock the dashboard
-- says exists.
--
-- Fix: treat the last allocation as the remainder. Each allocation still takes
-- its pro-rated share, but the running remainder is carried and whatever is left
-- lands on the final allocation, so the batch rows always total received_qty
-- exactly. Clamping each share to the remaining balance also stops an
-- over-rounded early allocation from pushing the total past received_qty.

CREATE OR REPLACE FUNCTION public.ims_receive_into_destination(p_shipment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ship      RECORD;
  v_req_no    TEXT;
  si          RECORD;
  alloc       RECORD;
  v_ratio     NUMERIC;
  v_qty       NUMERIC;
  v_line      INT := 0;
  v_batch_id  UUID;
  v_any       BOOLEAN;
  v_n         INT;
  v_i         INT;
  v_remaining NUMERIC;
BEGIN
  SELECT * INTO v_ship
    FROM public.ims_supply_shipments
   WHERE id = p_shipment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment % not found', p_shipment_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_ship.stock_applied_at IS NOT NULL THEN
    RETURN;                                      -- idempotent
  END IF;

  -- ON CONFLICT (item_id, store_id) can never match a NULL store_id (Postgres
  -- treats NULLs as distinct), so it would silently insert duplicates instead.
  IF v_ship.destination_store_id IS NULL THEN
    RAISE EXCEPTION 'Shipment % has no destination store — cannot credit stock', p_shipment_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT indent_number INTO v_req_no
    FROM public.ims_indent_requests WHERE id = v_ship.request_id;

  FOR si IN
    SELECT * FROM public.ims_supply_shipment_items
     WHERE shipment_id = p_shipment_id AND COALESCE(received_qty, 0) > 0
     ORDER BY id
  LOOP
    v_line := v_line + 1;

    -- (a) Summary: upsert — the destination may never have held this item.
    INSERT INTO public.ims_stock_summary
      (item_id, store_id, institution_id, current_quantity, reserved_quantity,
       available_quantity, opening_quantity, total_value, updated_at)
    VALUES (si.item_id, v_ship.destination_store_id, v_ship.destination_institution_id,
            si.received_qty, 0, si.received_qty, 0,
            si.received_qty * COALESCE(si.cost_price, 0), now())
    ON CONFLICT (item_id, store_id) DO UPDATE
      SET current_quantity   = COALESCE(public.ims_stock_summary.current_quantity, 0)
                               + EXCLUDED.current_quantity,
          available_quantity = (COALESCE(public.ims_stock_summary.current_quantity, 0)
                                + EXCLUDED.current_quantity)
                               - COALESCE(public.ims_stock_summary.reserved_quantity, 0),
          total_value        = COALESCE(public.ims_stock_summary.total_value, 0)
                               + EXCLUDED.total_value,
          updated_at         = now();

    -- (b) Batches: one destination batch per source allocation, so expiry and
    --     cost survive the hop. Short receipts are pro-rated across allocations,
    --     with the last one absorbing the rounding delta so the batch rows sum
    --     to exactly the received_qty credited to the summary above.
    SELECT EXISTS (
      SELECT 1 FROM public.ims_supply_shipment_item_batches WHERE shipment_item_id = si.id
    ) INTO v_any;

    IF v_any THEN
      v_ratio := CASE WHEN si.dispatched_qty > 0
                      THEN si.received_qty / si.dispatched_qty ELSE 1 END;

      SELECT count(*) INTO v_n
        FROM public.ims_supply_shipment_item_batches WHERE shipment_item_id = si.id;

      v_i         := 0;
      v_remaining := si.received_qty;

      FOR alloc IN
        SELECT * FROM public.ims_supply_shipment_item_batches
         WHERE shipment_item_id = si.id ORDER BY created_at, id
      LOOP
        v_i := v_i + 1;

        IF v_i = v_n THEN
          -- Last allocation takes whatever is left, absorbing the rounding delta.
          v_qty := v_remaining;
        ELSE
          -- Never let an early allocation overrun what is still unallocated.
          v_qty := LEAST(ROUND(alloc.quantity * v_ratio, 2), v_remaining);
        END IF;

        v_qty       := GREATEST(COALESCE(v_qty, 0), 0);
        v_remaining := v_remaining - v_qty;

        CONTINUE WHEN v_qty <= 0;

        INSERT INTO public.ims_stock_batches
          (item_id, batch_number, expiry_date, quantity, quantity_available,
           entry_date, cost_price, gst_rate, total_value, grn_id, location_type,
           department_id, institution_id, store_id)
        VALUES (si.item_id,
                'SHP-' || COALESCE(v_req_no, 'NA') || '-' ||
                  substr(p_shipment_id::text, 1, 6) || '-' || lpad(v_line::text, 2, '0') ||
                  '-' || substr(COALESCE(alloc.source_batch_id::text, 'X'), 1, 4),
                alloc.expiry_date, v_qty, v_qty, CURRENT_DATE,
                alloc.cost_price, 0, v_qty * alloc.cost_price, NULL, 'central_store',
                NULL, v_ship.destination_institution_id, v_ship.destination_store_id)
        ON CONFLICT (item_id, store_id, batch_number) WHERE batch_number IS NOT NULL
          DO NOTHING
        RETURNING id INTO v_batch_id;

        INSERT INTO public.ims_stock_movements
          (movement_type, direction, item_id, store_id, batch_id, quantity, unit_cost,
           expiry_date, ref_type, ref_id, counterparty_store_id, institution_id)
        VALUES ('transfer_in', 1, si.item_id, v_ship.destination_store_id, v_batch_id,
                v_qty, alloc.cost_price, alloc.expiry_date,
                'shipment_item', si.id, v_ship.source_store_id,
                v_ship.destination_institution_id);
      END LOOP;
    ELSE
      -- Source had no batch coverage; credit the summary and log the movement.
      INSERT INTO public.ims_stock_movements
        (movement_type, direction, item_id, store_id, batch_id, quantity, unit_cost,
         ref_type, ref_id, counterparty_store_id, institution_id)
      VALUES ('transfer_in', 1, si.item_id, v_ship.destination_store_id, NULL,
              si.received_qty, COALESCE(si.cost_price, 0),
              'shipment_item', si.id, v_ship.source_store_id,
              v_ship.destination_institution_id);
    END IF;
  END LOOP;

  UPDATE public.ims_supply_shipments
     SET stock_applied_at = now()
   WHERE id = p_shipment_id;
END;
$function$;

-- Internal-only helper (see 20260801002800): called solely from
-- ims_apply_shipment_to_stock, which is SECURITY DEFINER and therefore passes
-- the privilege check as owner. Keep it off the client API surface.
REVOKE EXECUTE ON FUNCTION public.ims_receive_into_destination(UUID) FROM anon, PUBLIC, authenticated;
