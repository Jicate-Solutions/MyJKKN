-- ============================================================================
-- The sale belongs to the cashier who served the customer, not to whoever
-- happened to press the button.
--
-- ims_gateway_finalize_sale calls ims_pos_checkout, and checkout derives its
-- cashier from auth.uid(). Until now that was harmless: the only thing that ever
-- called finalize was the payment screen the cashier was already staring at, so
-- auth.uid() WAS the cashier.
--
-- That stops being true the moment a stranded payment can be booked from the
-- Gateway Payments report. A payment captured at the counter on Tuesday and
-- rescued by an admin on Thursday would be credited to the admin — quietly
-- wrong in exactly the place it matters, since per-cashier takings are what a
-- store admin reconciles a till against.
--
-- ims_gateway_payments.cashier_id has held the right answer all along; it simply
-- was not used. Folded into the UPDATE the function already runs, so it costs
-- one column and no extra statement, inside the same transaction.
--
-- ims_financial_transactions.created_by deliberately still records auth.uid().
-- "Who made this sale" and "who performed this booking" are different questions,
-- and for a recovery action the second one is worth keeping.
-- ============================================================================

SET lock_timeout = '15s';

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

    UPDATE public.ims_gateway_payments
       SET finalize_claimed_at = now()
     WHERE id = p_payment_id
       AND status = 'paid'
       AND sale_id IS NULL
       AND (finalize_claimed_at IS NULL
            OR finalize_claimed_at < now() - INTERVAL '2 minutes')
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        SELECT * INTO v_row
          FROM public.ims_gateway_payments
         WHERE id = p_payment_id;

        RETURN jsonb_build_object(
            'claimed', false,
            'sale_id', v_row.sale_id,
            'status',  v_row.status
        );
    END IF;

    v_snapshot := v_row.cart_snapshot;

    IF v_snapshot IS NULL
       OR jsonb_array_length(COALESCE(v_snapshot -> 'lines', '[]'::JSONB)) = 0 THEN
        RAISE EXCEPTION 'Payment has no priced cart to book';
    END IF;

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

    -- The one change: restore the cashier who opened this payment. COALESCE so a
    -- payment with no recorded cashier keeps checkout's auth.uid() rather than
    -- nulling a NOT NULL-ish reporting column.
    UPDATE public.ims_sales
       SET gateway_payment_id = p_payment_id,
           cashier_id         = COALESCE(v_row.cashier_id, cashier_id)
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
    'Books the sale for a captured gateway payment, in one transaction. Credits '
    'ims_gateway_payments.cashier_id rather than auth.uid(), so a payment rescued '
    'later from the Gateway Payments report is still attributed to the cashier who '
    'took it.';
