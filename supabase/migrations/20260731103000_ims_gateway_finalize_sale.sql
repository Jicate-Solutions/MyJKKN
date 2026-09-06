-- ============================================================================
-- Book the sale for a gateway-confirmed counter payment — claim, book, and link
-- in ONE transaction.
--
-- WHY THIS MOVED OUT OF TYPESCRIPT.
--
-- The TypeScript version did the same three steps as three separate round trips:
-- a compare-and-set UPDATE to claim a lease, then ims_pos_checkout, then two writes
-- to link the sale back. That shape had two problems.
--
--   1. IT FAILED SILENTLY. The claim discarded its error, so "somebody else holds
--      the lease" and "the write was rejected" were indistinguishable — a poll would
--      return having done nothing, forever, with a customer's money already taken
--      and the counter showing a spinner. A money path must never fail without
--      saying so.
--
--   2. IT COULD BOOK THE SAME CART TWICE. ims_pos_checkout commits the sale in its
--      own transaction; the back-link to ims_gateway_payments.sale_id was a LATER
--      statement. Anything interrupting between the two — a crash, a redeploy, a
--      dropped connection — left a committed sale that nothing pointed at, so the
--      next poll saw `sale_id IS NULL`, re-claimed once the lease aged out, and
--      booked a SECOND sale. The unique index on ims_sales.gateway_payment_id
--      cannot catch that: the first sale's link was never written.
--
-- Here all three happen in one transaction. If the checkout raises, the claim rolls
-- back with it and the lease releases itself. A sale that exists is a sale that is
-- linked. There is no in-between state to recover from.
--
-- The lease is kept even so: it is what stops two concurrent polls from both
-- entering ims_pos_checkout, which would burn two invoice numbers and deduct stock
-- twice before either committed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ims_gateway_finalize_sale(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row      public.ims_gateway_payments;
    v_snapshot JSONB;
    v_lines    JSONB;
    v_result   JSONB;
    v_sale_id  UUID;
BEGIN
    -- ── Authorization ───────────────────────────────────────────────────────
    -- SECURITY DEFINER bypasses RLS, so without this any authenticated user could
    -- book any counter payment by guessing an id. The predicate is deliberately the
    -- SAME one ims_gateway_payments' SELECT policy uses: if you cannot see the
    -- payment, you cannot book it.
    SELECT * INTO v_row
      FROM public.ims_gateway_payments
     WHERE id = p_payment_id;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF NOT (
        public.get_current_user_role() = 'super_admin'
        OR v_row.institution_id IN (SELECT public.ims_accessible_institution_ids())
    ) THEN
        RAISE EXCEPTION 'You do not have access to this payment'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── 1. Claim ────────────────────────────────────────────────────────────
    -- Atomic compare-and-set. A row already booked, not yet paid, or held by a
    -- live lease simply does not match.
    UPDATE public.ims_gateway_payments
       SET finalize_claimed_at = now()
     WHERE id = p_payment_id
       AND status = 'paid'
       AND sale_id IS NULL
       AND (finalize_claimed_at IS NULL
            OR finalize_claimed_at < now() - INTERVAL '2 minutes')
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        -- Not ours to book. Report what IS true rather than raising: the common
        -- case is a second poll arriving after the first already succeeded, and
        -- that is a normal outcome, not an error.
        SELECT * INTO v_row
          FROM public.ims_gateway_payments
         WHERE id = p_payment_id;

        RETURN jsonb_build_object(
            'claimed', false,
            'sale_id', v_row.sale_id,
            'status',  v_row.status
        );
    END IF;

    -- ── 2. Book ─────────────────────────────────────────────────────────────
    v_snapshot := v_row.cart_snapshot;

    IF v_snapshot IS NULL
       OR jsonb_array_length(COALESCE(v_snapshot -> 'lines', '[]'::JSONB)) = 0 THEN
        RAISE EXCEPTION 'Payment has no priced cart to book';
    END IF;

    -- Project only what ims_pos_checkout reads. The snapshot also carries the
    -- computed totals; passing them through would invite a future reader to think
    -- the checkout trusts them. It does not — it re-derives every figure.
    SELECT jsonb_agg(
               jsonb_build_object(
                   'item_id',          l ->> 'item_id',
                   'quantity',         (l ->> 'quantity')::NUMERIC,
                   'unit_price',       (l ->> 'unit_price')::NUMERIC,
                   'cost_price',       (l ->> 'cost_price')::NUMERIC,
                   'discount_percent', COALESCE((l ->> 'discount_percent')::NUMERIC, 0)
               )
           )
      INTO v_lines
      FROM jsonb_array_elements(v_snapshot -> 'lines') AS l;

    -- Booked from the SERVER-PRICED snapshot taken when the payment was opened —
    -- never from anything a browser sends now. That is what keeps the amount
    -- charged and the amount booked the same number.
    --
    -- auth.uid() inside ims_pos_checkout still resolves to the cashier: it reads a
    -- request-scoped GUC set from the JWT, which SECURITY DEFINER does not change.
    v_result := public.ims_pos_checkout(
        p_store_id               => v_row.store_id,
        p_institution_id         => v_row.institution_id,
        p_customer_type          => v_row.customer_type,
        p_customer_name          => v_row.customer_name,
        p_customer_id            => NULL,
        p_payment_method         => 'upi_qr',
        p_cash_amount            => 0,
        p_gpay_amount            => 0,
        p_card_amount            => 0,
        p_upi_qr_amount          => v_row.amount,
        p_gpay_transaction_id    => NULL,
        p_upi_qr_transaction_ref => v_row.transaction_ref,
        p_additional_discount    => 0,
        p_lines                  => v_lines
    );

    v_sale_id := (v_result ->> 'sale_id')::UUID;
    IF v_sale_id IS NULL THEN
        RAISE EXCEPTION 'Checkout returned no sale';
    END IF;

    -- ── 3. Link, both ways ──────────────────────────────────────────────────
    -- Same transaction as the booking above, which is the whole point.
    UPDATE public.ims_sales
       SET gateway_payment_id = p_payment_id
     WHERE id = v_sale_id;

    UPDATE public.ims_gateway_payments
       SET sale_id             = v_sale_id,
           finalize_claimed_at = NULL,
           finalize_error      = NULL,
           updated_at          = now()
     WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'claimed',     true,
        'sale_id',     v_sale_id,
        'sale_number', v_result ->> 'sale_number',
        'status',      'paid'
    );
END;
$function$;

COMMENT ON FUNCTION public.ims_gateway_finalize_sale(UUID) IS
    'Books the ims_sales row for a gateway-confirmed counter payment. Claims a lease, '
    'runs ims_pos_checkout from the stored server-priced cart, and links both sides — '
    'all in one transaction, so a committed sale is always a linked sale.';

-- Anon must never reach this: it books a sale and moves stock.
REVOKE ALL     ON FUNCTION public.ims_gateway_finalize_sale(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ims_gateway_finalize_sale(UUID) TO   authenticated;
