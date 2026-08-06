-- Migration: 20260730120000_ims_pos_checkout_engine
-- Purpose: Make the POS checkout atomic, race-safe and batch-correct.
--
-- WHAT WAS WRONG (all verified against the live project before writing this):
--
--  1. ims_deduct_batch_fefo DID NOT EXIST. sales-service.ts called it and never
--     read the result, so the PGRST202 was swallowed on every sale:
--     ims_stock_summary was decremented while ims_stock_batches.quantity_available
--     was left untouched, without bound. The function that does exist,
--     ims_pick_fefo_batches, is STABLE — it returns a pick list, it deducts nothing.
--
--  2. The decrement was a client-side read-modify-write:
--         SELECT current_quantity ... ; UPDATE SET current_quantity = <js value>
--     Two cashiers selling the same item both read N and both write N-1, so one
--     sale's deduction is lost. There was also no `available_quantity >= qty`
--     guard and no non-negative CHECK, so quantities went negative silently.
--
--  3. Nothing was transactional. The header inserted with status='completed'
--     FIRST, so a failure part-way through left a completed sale with some lines
--     deducted, no rollback, and a burnt invoice number.
--
--  4. A missing ims_stock_summary row only produced a console.warn — the sale
--     still completed, having deducted nothing at all.
--
--  5. Totals and tendered amounts were whatever the browser sent. Since the POS
--     writes PostgREST directly (there is no API route for checkout), a crafted
--     request could record a 5,000 bill as 1 tendered.
--
-- WHAT THIS DOES: moves the whole checkout into one SECURITY DEFINER function so
-- it runs in a single transaction. The stock decrement becomes ONE guarded
-- statement, which both takes a row lock (killing the lost update) and refuses
-- to oversell (zero rows updated -> raise). Modelled on fn_kit_record_collection
-- in 20260712190000_store_kit_entitlements.sql, which already got this right.
--
-- BATCHES ARE OPTIONAL BY DESIGN. JKKN Pharmacy is going live with 440 stock rows
-- and zero ims_stock_batches rows, so requiring a batch would mean selling
-- nothing. Lines deduct FEFO from whatever batches exist and book the uncovered
-- remainder as a batch_id IS NULL ledger row. Stores that do keep batches (Dental)
-- get true first-expiry-first-out immediately, and Pharmacy starts getting it the
-- moment batches are entered — no code change needed at that point.
--
-- TAX: selling price is treated as GST-inclusive for counter sales, so tax_percent
-- and tax_amount stay 0. That is a deliberate decision, not an oversight.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Backstop constraint: stock can never go negative.
--    The RPC guard below is the real defence; this catches any other writer.
--    Verified 0 negative rows live, so this applies cleanly.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.ims_stock_summary'::regclass
       AND conname  = 'ims_stock_summary_quantities_nonneg'
  ) THEN
    ALTER TABLE public.ims_stock_summary
      ADD CONSTRAINT ims_stock_summary_quantities_nonneg
      CHECK (
        COALESCE(current_quantity, 0)   >= 0
        AND COALESCE(available_quantity, 0) >= 0
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ims_pos_checkout — the whole sale, atomically.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ims_pos_checkout(
    p_store_id               UUID,
    p_institution_id         UUID,
    p_customer_type          TEXT,
    p_customer_name          TEXT,
    p_customer_id            UUID,
    p_payment_method         TEXT,
    p_cash_amount            NUMERIC,
    p_gpay_amount            NUMERIC,
    p_card_amount            NUMERIC,
    p_upi_qr_amount          NUMERIC,
    p_gpay_transaction_id    TEXT,
    p_upi_qr_transaction_ref TEXT,
    p_additional_discount    NUMERIC,
    p_lines                  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_actor            UUID := auth.uid();
    v_business_date    DATE;
    v_sale_number      TEXT;
    v_prefix           TEXT := 'INV';
    v_seq              INTEGER;
    v_sale_id          UUID;
    v_line             JSONB;
    v_item_id          UUID;
    v_qty              NUMERIC;
    v_unit_price       NUMERIC;
    v_cost_price       NUMERIC;
    v_disc_pct         NUMERIC;
    v_disc_amt         NUMERIC;
    v_line_total       NUMERIC;
    v_line_profit      NUMERIC;
    v_subtotal         NUMERIC := 0;
    v_total_discount   NUMERIC := 0;
    v_total_profit     NUMERIC := 0;
    v_total_amount     NUMERIC;
    v_addl_discount    NUMERIC := COALESCE(p_additional_discount, 0);
    v_tendered         NUMERIC;
    v_noncash          NUMERIC;
    v_rows             INTEGER;
    v_item_name        TEXT;
    v_available        NUMERIC;
    v_pick             RECORD;
    v_picked           NUMERIC;
    v_single_batch     UUID;
    v_batch_count      INTEGER;
    v_has_batches      INTEGER;
BEGIN
    -- ── Authorisation ────────────────────────────────────────────────────────
    -- SECURITY DEFINER bypasses RLS, so this function is responsible for the
    -- checks the policies would otherwise have made. Same discipline as
    -- 20260801002800_ims_transfer_engine_auth_hardening.sql.
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF p_store_id IS NULL THEN
        RAISE EXCEPTION 'A store must be selected before billing' USING ERRCODE = '22004';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.ims_stores s
         WHERE s.id = p_store_id
           AND s.is_active
           AND (
                s.institution_id IN (SELECT public.ims_accessible_institution_ids())
                OR public.get_current_user_role() = 'super_admin'
           )
    ) THEN
        RAISE EXCEPTION 'You do not have access to this store' USING ERRCODE = '42501';
    END IF;

    -- Store access alone is not enough: ims_accessible_institution_ids() returns an
    -- institution for EVERY profile in it, students included. Without this the POS
    -- page guard (ImsPageGuard module="ims.sales" action="create") would be the only
    -- thing stopping a learner from POSTing a sale straight at the API.
    --
    -- user_has_permission(), NOT check_permission(). The latter reads only
    -- profiles.role, while the UI's usePermissions() OR-merges every row in
    -- user_roles — so check_permission() would reject the real store admin
    -- (profiles.role = 'jicate_staff', store_admin assigned via user_roles) that the
    -- UI happily lets in. user_has_permission() applies the same merge as the UI:
    -- super_admin bypass, then user_roles, then the profiles.role fallback.
    IF NOT public.user_has_permission('ims.sales.create') THEN
        RAISE EXCEPTION 'You do not have permission to create sales' USING ERRCODE = '42501';
    END IF;

    -- ── Validate the cart ────────────────────────────────────────────────────
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'Sale must contain at least one item' USING ERRCODE = '22023';
    END IF;

    IF v_addl_discount < 0 THEN
        RAISE EXCEPTION 'Additional discount cannot be negative' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(p_payment_method, '') NOT IN ('cash', 'gpay', 'card', 'upi_qr', 'mixed') THEN
        RAISE EXCEPTION 'Unknown payment method: %', p_payment_method USING ERRCODE = '22023';
    END IF;

    -- ── Totals, computed here and only here ──────────────────────────────────
    -- Full precision per line; round once at the payable amount. Never trust a
    -- total supplied by the caller.
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_item_id    := (v_line->>'item_id')::UUID;
        v_qty        := COALESCE((v_line->>'quantity')::NUMERIC, 0);
        v_unit_price := COALESCE((v_line->>'unit_price')::NUMERIC, 0);
        v_cost_price := COALESCE((v_line->>'cost_price')::NUMERIC, 0);
        v_disc_pct   := COALESCE((v_line->>'discount_percent')::NUMERIC, 0);

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'Cart line is missing item_id' USING ERRCODE = '22023';
        END IF;
        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantity must be greater than 0 (item %)', v_item_id USING ERRCODE = '22023';
        END IF;
        IF v_unit_price < 0 OR v_cost_price < 0 THEN
            RAISE EXCEPTION 'Prices cannot be negative (item %)', v_item_id USING ERRCODE = '22023';
        END IF;
        IF v_disc_pct < 0 OR v_disc_pct > 100 THEN
            RAISE EXCEPTION 'Line discount must be between 0 and 100 (item %)', v_item_id USING ERRCODE = '22023';
        END IF;

        v_disc_amt  := (v_unit_price * v_qty * v_disc_pct) / 100;
        v_subtotal  := v_subtotal + (v_unit_price * v_qty);
        v_total_discount := v_total_discount + v_disc_amt;
        v_total_profit   := v_total_profit + ((v_unit_price - v_cost_price) * v_qty - v_disc_amt);
    END LOOP;

    v_total_discount := v_total_discount + v_addl_discount;
    v_total_profit   := v_total_profit - v_addl_discount;
    v_total_amount   := ROUND(v_subtotal - v_total_discount, 2);

    IF v_total_amount < 0 THEN
        RAISE EXCEPTION 'Discount exceeds the bill value' USING ERRCODE = '22023';
    END IF;

    -- ── The tender must actually cover the bill ──────────────────────────────
    -- Previously checked only in the browser, and since the POS writes PostgREST
    -- directly a crafted request could book a 5,000 bill as 1 tendered.
    --
    -- Not a plain equality, because cash is legitimately OVER-tendered: the
    -- customer hands over 500 for a 262.50 bill and takes 237.50 in change.
    -- ims_sales.cash_amount holds the amount TENDERED (buildReceiptData derives
    -- the change line from cash_amount - total_amount), so equality would reject
    -- every cash sale that needs change.
    --
    -- So: the total must at least cover the bill, and the electronic legs must not
    -- exceed it — you cannot over-charge a card and hand back cash. That leaves
    -- surplus attributable to cash alone, which is exactly what change is.
    v_noncash  := COALESCE(p_gpay_amount, 0) + COALESCE(p_card_amount, 0)
                + COALESCE(p_upi_qr_amount, 0);
    v_tendered := COALESCE(p_cash_amount, 0) + v_noncash;

    IF v_tendered < v_total_amount - 0.01 THEN
        RAISE EXCEPTION 'Amount tendered (%) is less than the bill total (%)',
              v_tendered, v_total_amount USING ERRCODE = '22023';
    END IF;

    IF v_noncash > v_total_amount + 0.01 THEN
        RAISE EXCEPTION 'Card/GPay/UPI amounts (%) exceed the bill total (%) — only cash may be over-tendered for change',
              v_noncash, v_total_amount USING ERRCODE = '22023';
    END IF;

    -- ── Invoice number ───────────────────────────────────────────────────────
    -- Business date is derived server-side in IST, so the printed YYMMDD segment
    -- and ims_sale_number_counters.counter_date can never disagree, and the
    -- cashier's device clock stops mattering. No COUNT(*) fallback: inside a
    -- transaction a failure simply rolls back.
    v_business_date := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;

    SELECT COALESCE(NULLIF(TRIM(s.sale_number_prefix), ''), 'INV')
      INTO v_prefix
      FROM public.ims_stores s
     WHERE s.id = p_store_id;

    v_seq := public.ims_next_sale_number(p_store_id, v_business_date);

    v_sale_number := v_prefix || '-' || TO_CHAR(v_business_date, 'YYMMDD')
                     || '-' || LPAD(v_seq::TEXT, 4, '0');

    -- ── Header ───────────────────────────────────────────────────────────────
    INSERT INTO public.ims_sales (
        sale_number, customer_type, customer_name, customer_id,
        payment_method, cash_amount, gpay_amount, card_amount,
        gpay_transaction_id, upi_qr_amount, upi_qr_transaction_ref,
        subtotal, discount_amount, tax_amount, total_amount, profit_amount,
        status, cashier_id, institution_id, store_id
    ) VALUES (
        v_sale_number,
        COALESCE(p_customer_type, 'walk_in'),
        NULLIF(TRIM(COALESCE(p_customer_name, '')), ''),
        p_customer_id,
        p_payment_method,
        COALESCE(p_cash_amount, 0), COALESCE(p_gpay_amount, 0), COALESCE(p_card_amount, 0),
        NULLIF(TRIM(COALESCE(p_gpay_transaction_id, '')), ''),
        COALESCE(p_upi_qr_amount, 0),
        NULLIF(TRIM(COALESCE(p_upi_qr_transaction_ref, '')), ''),
        v_subtotal, v_total_discount, 0, v_total_amount, v_total_profit,
        'completed', v_actor, p_institution_id, p_store_id
    )
    RETURNING id INTO v_sale_id;

    -- ── Lines: stock first, then the sale_item row ───────────────────────────
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_item_id    := (v_line->>'item_id')::UUID;
        v_qty        := (v_line->>'quantity')::NUMERIC;
        v_unit_price := COALESCE((v_line->>'unit_price')::NUMERIC, 0);
        v_cost_price := COALESCE((v_line->>'cost_price')::NUMERIC, 0);
        v_disc_pct   := COALESCE((v_line->>'discount_percent')::NUMERIC, 0);

        v_disc_amt    := (v_unit_price * v_qty * v_disc_pct) / 100;
        v_line_total  := v_unit_price * v_qty - v_disc_amt;
        v_line_profit := (v_unit_price - v_cost_price) * v_qty - v_disc_amt;

        SELECT name INTO v_item_name FROM public.ims_items WHERE id = v_item_id;
        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'Item % no longer exists', v_item_id USING ERRCODE = '23503';
        END IF;

        -- ONE guarded statement. The row lock it takes is what serialises two
        -- cashiers; the available_quantity predicate is what refuses an oversell.
        UPDATE public.ims_stock_summary
           SET current_quantity   = current_quantity - v_qty,
               available_quantity = available_quantity - v_qty,
               total_value        = GREATEST(0, COALESCE(total_value, 0) - (v_cost_price * v_qty)),
               updated_at         = now()
         WHERE item_id = v_item_id
           AND store_id = p_store_id
           AND COALESCE(available_quantity, 0) >= v_qty;

        GET DIAGNOSTICS v_rows = ROW_COUNT;

        IF v_rows = 0 THEN
            -- Distinguish "sold out" from "never stocked here", because the two
            -- mean very different things to whoever is standing at the counter.
            SELECT available_quantity INTO v_available
              FROM public.ims_stock_summary
             WHERE item_id = v_item_id AND store_id = p_store_id;

            IF v_available IS NULL THEN
                RAISE EXCEPTION '% is not stocked in this store', v_item_name
                      USING ERRCODE = 'P0002';
            ELSE
                RAISE EXCEPTION 'Insufficient stock for %: need %, only % available',
                      v_item_name, v_qty, v_available USING ERRCODE = 'P0002';
            END IF;
        END IF;

        -- ── FEFO batch deduction (optional per store, see header) ────────────
        v_picked       := 0;
        v_single_batch := NULL;
        v_batch_count  := 0;

        -- Does this item keep batches at this store at all? That single question
        -- decides which of two regimes applies, and it has to be asked BEFORE the
        -- pick, because the pick excludes expired stock and would otherwise be
        -- indistinguishable from "this store doesn't do batches".
        SELECT COUNT(*) INTO v_has_batches
          FROM public.ims_stock_batches b
         WHERE b.item_id = v_item_id
           AND b.store_id = p_store_id
           AND COALESCE(b.quantity_available, 0) > 0;

        FOR v_pick IN
            -- TRUE = skip expired batches. The POS dispenses stock, so an expired
            -- batch is not sellable inventory (20260730140000).
            SELECT * FROM public.ims_pick_fefo_batches(v_item_id, p_store_id, v_qty, TRUE)
        LOOP
            UPDATE public.ims_stock_batches
               SET quantity_available = quantity_available - v_pick.take_qty,
                   updated_at         = now()
             WHERE id = v_pick.batch_id
               AND quantity_available >= v_pick.take_qty;

            GET DIAGNOSTICS v_rows = ROW_COUNT;
            IF v_rows = 0 THEN
                -- Another transaction took this batch between the pick and the
                -- write. Fail the whole sale rather than let batches drift.
                RAISE EXCEPTION 'Batch % for % was consumed concurrently — please retry',
                      COALESCE(v_pick.batch_number, v_pick.batch_id::TEXT), v_item_name
                      USING ERRCODE = '40001';
            END IF;

            INSERT INTO public.ims_stock_movements (
                movement_type, direction, item_id, store_id, batch_id, quantity,
                unit_cost, expiry_date, ref_type, ref_id, institution_id, actor_id
            ) VALUES (
                'sale', -1, v_item_id, p_store_id, v_pick.batch_id, v_pick.take_qty,
                v_pick.cost_price, v_pick.expiry_date, 'sale', v_sale_id,
                p_institution_id, v_actor
            );

            v_picked       := v_picked + v_pick.take_qty;
            v_batch_count  := v_batch_count + 1;
            v_single_batch := v_pick.batch_id;
        END LOOP;

        -- Two regimes, and the distinction is what stops expired stock being sold:
        --
        --  * Store keeps NO batches for this item (v_has_batches = 0) — the JKKN
        --    Pharmacy case, 440 stock rows and zero batches. The summary IS the
        --    stock record, so the line is booked as one unbatched ledger row.
        --
        --  * Store DOES keep batches — then batches are the source of truth, and a
        --    shortfall means the only remaining stock is expired. Without this the
        --    unbatched-remainder path below would happily absorb it and sell the
        --    expired units anyway, defeating the whole control.
        IF v_has_batches > 0 AND v_picked < v_qty THEN
            RAISE EXCEPTION
              'Only % of % units of % are within expiry. The rest is expired stock and cannot be sold — write it off first.',
              v_picked, v_qty, v_item_name
              USING ERRCODE = 'P0002';
        END IF;

        -- Whatever the batches could not cover is still real stock that left the
        -- shelf, so it gets a ledger row with no batch. This is the normal path
        -- for a store that does not keep batches yet.
        IF v_qty - v_picked > 0 THEN
            INSERT INTO public.ims_stock_movements (
                movement_type, direction, item_id, store_id, batch_id, quantity,
                unit_cost, ref_type, ref_id, institution_id, actor_id
            ) VALUES (
                'sale', -1, v_item_id, p_store_id, NULL, v_qty - v_picked,
                v_cost_price, 'sale', v_sale_id, p_institution_id, v_actor
            );
        END IF;

        INSERT INTO public.ims_sale_items (
            sale_id, item_id, batch_id, quantity, unit_price, cost_price,
            discount_percent, discount_amount, tax_percent, tax_amount, total, profit
        ) VALUES (
            v_sale_id, v_item_id,
            -- Only meaningful when the line came from exactly one batch. For
            -- split lines ims_stock_movements is the authoritative batch trace.
            CASE WHEN v_batch_count = 1 AND v_picked >= v_qty THEN v_single_batch ELSE NULL END,
            v_qty, v_unit_price, v_cost_price,
            v_disc_pct, v_disc_amt, 0, 0, v_line_total, v_line_profit
        );
    END LOOP;

    -- ── Money ledger, now inside the same transaction as the sale ───────────
    INSERT INTO public.ims_financial_transactions (
        transaction_type, reference_id, reference_type, amount, description,
        created_by, institution_id, store_id
    ) VALUES (
        'sale', v_sale_id, 'sale', v_total_amount, 'Sale ' || v_sale_number,
        v_actor, p_institution_id, p_store_id
    );

    RETURN jsonb_build_object(
        'sale_id',     v_sale_id,
        'sale_number', v_sale_number
    );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. ims_pos_cancel_sale — the exact inverse, replayed from the ledger.
--
--    The old client-side version restored ims_stock_summary but never touched
--    ims_stock_batches, so every cancellation permanently inflated batch stock
--    relative to summary stock. Replaying the movement rows written above lets
--    us put each unit back in the batch it actually came out of.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ims_pos_cancel_sale(
    p_sale_id        UUID,
    p_reason         TEXT,
    p_items_returned BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_sale  RECORD;
    v_mv    RECORD;
    v_rows  INTEGER;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A cancellation reason is required' USING ERRCODE = '22023';
    END IF;

    -- Lock the sale so two cancels cannot both pass the status guard.
    SELECT * INTO v_sale
      FROM public.ims_sales
     WHERE id = p_sale_id
       FOR UPDATE;

    IF v_sale.id IS NULL THEN
        RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.ims_stores s
         WHERE s.id = v_sale.store_id
           AND (
                s.institution_id IN (SELECT public.ims_accessible_institution_ids())
                OR public.get_current_user_role() = 'super_admin'
           )
    ) THEN
        RAISE EXCEPTION 'You do not have access to this store' USING ERRCODE = '42501';
    END IF;

    -- Voiding a bill is a stronger act than raising one, so it takes the refund
    -- permission — matching canAccess('ims.sales', 'refund') on the sale detail page.
    IF NOT public.user_has_permission('ims.sales.refund') THEN
        RAISE EXCEPTION 'You do not have permission to cancel sales' USING ERRCODE = '42501';
    END IF;

    IF v_sale.status <> 'completed' THEN
        RAISE EXCEPTION 'Only a completed sale can be cancelled (this one is %)', v_sale.status
              USING ERRCODE = '22023';
    END IF;

    UPDATE public.ims_sales
       SET status              = 'cancelled',
           cancellation_reason = p_reason,
           items_returned      = COALESCE(p_items_returned, TRUE),
           updated_at          = now()
     WHERE id = p_sale_id;

    IF COALESCE(p_items_returned, TRUE) THEN
        -- Replay each outbound movement in reverse. Batch rows go back to their
        -- own batch; the batch_id IS NULL remainder just returns to summary.
        FOR v_mv IN
            SELECT * FROM public.ims_stock_movements
             WHERE ref_type = 'sale' AND ref_id = p_sale_id
               AND movement_type = 'sale' AND direction = -1
        LOOP
            UPDATE public.ims_stock_summary
               SET current_quantity   = COALESCE(current_quantity, 0)   + v_mv.quantity,
                   available_quantity = COALESCE(available_quantity, 0) + v_mv.quantity,
                   total_value        = COALESCE(total_value, 0)
                                        + (COALESCE(v_mv.unit_cost, 0) * v_mv.quantity),
                   updated_at         = now()
             WHERE item_id = v_mv.item_id
               AND store_id = v_mv.store_id;

            GET DIAGNOSTICS v_rows = ROW_COUNT;
            IF v_rows = 0 THEN
                RAISE EXCEPTION 'Cannot restore stock: no stock row for item % in store %',
                      v_mv.item_id, v_mv.store_id USING ERRCODE = 'P0002';
            END IF;

            IF v_mv.batch_id IS NOT NULL THEN
                UPDATE public.ims_stock_batches
                   SET quantity_available = quantity_available + v_mv.quantity,
                       updated_at         = now()
                 WHERE id = v_mv.batch_id;
            END IF;

            INSERT INTO public.ims_stock_movements (
                movement_type, direction, item_id, store_id, batch_id, quantity,
                unit_cost, expiry_date, ref_type, ref_id, institution_id, actor_id
            ) VALUES (
                'return', 1, v_mv.item_id, v_mv.store_id, v_mv.batch_id, v_mv.quantity,
                v_mv.unit_cost, v_mv.expiry_date, 'sale', p_sale_id,
                v_mv.institution_id, v_actor
            );
        END LOOP;
    END IF;
    -- When items are NOT returned the caller creates write-off adjustments via
    -- ImsStockAdjustmentService, which already has its own audit trail. Stock
    -- stays deducted, which is the point.

    -- Reverse the money so the financial ledger nets to zero for this bill.
    INSERT INTO public.ims_financial_transactions (
        transaction_type, reference_id, reference_type, amount, description,
        created_by, institution_id, store_id
    ) VALUES (
        'return', p_sale_id, 'sale', -COALESCE(v_sale.total_amount, 0),
        'Cancelled sale ' || COALESCE(v_sale.sale_number, p_sale_id::TEXT) || ' — ' || p_reason,
        v_actor, v_sale.institution_id, v_sale.store_id
    );

    RETURN jsonb_build_object(
        'sale_id',        p_sale_id,
        'status',         'cancelled',
        'items_returned', COALESCE(p_items_returned, TRUE)
    );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Lock anon out of both functions.
--    Supabase grants EXECUTE to PUBLIC by default, so without these an
--    unauthenticated caller holding the public anon key could invoke the
--    checkout engine directly. The auth.uid() guard inside would stop them,
--    but defence in depth: same posture as 20260801002900.
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.ims_pos_checkout(
    UUID, UUID, TEXT, TEXT, UUID, TEXT,
    NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, JSONB
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.ims_pos_cancel_sale(UUID, TEXT, BOOLEAN)
    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ims_pos_checkout(
    UUID, UUID, TEXT, TEXT, UUID, TEXT,
    NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, JSONB
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ims_pos_cancel_sale(UUID, TEXT, BOOLEAN)
    TO authenticated, service_role;

-- ims_pick_fefo_batches is called from inside ims_pos_checkout (which is
-- SECURITY DEFINER, so it runs as the owner) — no direct grant needed, and none
-- is given, keeping the pick list off the REST surface.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Close the search_path gap on the two number counters.
--    Both are SECURITY DEFINER with proconfig IS NULL, unlike every sibling
--    function in this schema.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.ims_next_sale_number(UUID, DATE)  SET search_path TO 'public';
ALTER FUNCTION public.ims_next_grn_number(UUID, DATE)   SET search_path TO 'public';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. The invoice counter must only ever move through ims_next_sale_number.
--    It had INSERT and UPDATE policies for any authenticated user in the
--    institution, so last_number could be rewound to reissue a bill number.
--    The SECURITY DEFINER function runs as owner and bypasses RLS, so removing
--    these costs nothing.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS ims_sale_number_counters_insert ON public.ims_sale_number_counters;
DROP POLICY IF EXISTS ims_sale_number_counters_update ON public.ims_sale_number_counters;

-- SELECT stays so the sales UI can show the day's bill count.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Helpful index for the cancel replay and any batch-wise sales register.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_ims_stock_movements_ref
    ON public.ims_stock_movements (ref_type, ref_id);

COMMENT ON FUNCTION public.ims_pos_checkout(
    UUID, UUID, TEXT, TEXT, UUID, TEXT,
    NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, JSONB
) IS
'Atomic POS checkout. Computes totals server-side, reconciles the tender against '
'the bill, allocates the invoice number from the IST business date, decrements '
'ims_stock_summary with a guarded single statement (no lost update, no oversell), '
'deducts ims_stock_batches FEFO where batches exist, writes an ims_stock_movements '
'ledger row per batch plus one batch_id IS NULL row for any uncovered remainder, '
'and books the financial transaction. All in one transaction: a failure leaves no '
'sale, no partial deduction and no burnt invoice number.';

COMMENT ON FUNCTION public.ims_pos_cancel_sale(UUID, TEXT, BOOLEAN) IS
'Cancels a completed sale. When items are returned it replays the sale''s '
'ims_stock_movements rows in reverse, so each unit goes back into the batch it '
'was sold from, and posts a negative financial transaction so the ledger nets out.';
