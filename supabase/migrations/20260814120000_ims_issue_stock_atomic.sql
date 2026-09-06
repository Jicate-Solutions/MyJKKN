-- Migration: 20260814120000_ims_issue_stock_atomic
-- Purpose: make issuing stock to a department atomic, and make its failures loud.
--
-- REPORTED: JKKN Pharmacy — "issuing against an indent does not decrease stock".
-- Pharmacy is the only store that uses this flow at all (22 issues; every other
-- store has 0), which is why it is the only place the defect can surface.
--
-- WHAT WAS WRONG (lib/services/ims/issue-stock.ts, verified against live):
--
--  1. THE DECREMENT COULD SILENTLY DO NOTHING. The client did
--         .update({...}).eq('id', stock.id)
--     and checked only `error`. A PostgREST update that matches ZERO rows returns
--     success with no error, so if RLS filtered the row out the decrement was a
--     no-op — and the code then inserted the ims_stock_issues audit row anyway.
--     The issue appeared in history, stock never moved, and NO error reached the
--     user. That is exactly the reported symptom, and it left no trace to debug.
--
--  2. It was a client-side read-modify-write:
--         SELECT current_quantity ... ; UPDATE SET current_quantity = <js value>
--     Two people issuing the same item both read N and both write N-1, so one
--     decrement is lost. Identical to the POS bug fixed in
--     20260730120000_ims_pos_checkout_engine.sql; this path never got the same
--     treatment.
--
--  3. Nothing was transactional. The decrement and the audit insert were two
--     round trips, so a failure between them left stock moved with no record, or
--     a record with no movement.
--
-- WHAT THIS DOES: moves both writes into one SECURITY DEFINER function so they
-- share a transaction. The row is locked before it is read, the decrement is a
-- single guarded statement, and a zero-row result RAISES instead of being
-- mistaken for success. Modelled directly on ims_pos_checkout.
--
-- DELIBERATELY UNCHANGED: total_value is not adjusted here, because the code this
-- replaces never adjusted it either. Restating inventory valuation is a finance
-- decision, not a side effect of a bug fix — flagged separately rather than done
-- quietly here.

CREATE OR REPLACE FUNCTION public.ims_issue_stock_to_department(
    p_item_id        UUID,
    p_unit_id        UUID,
    p_quantity       NUMERIC,
    p_department_id  UUID,
    p_indent_id      UUID DEFAULT NULL,
    p_notes          TEXT DEFAULT NULL,
    p_store_id       UUID DEFAULT NULL,
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_actor        UUID := auth.uid();
    v_stock_id     UUID;
    v_store        UUID;
    v_institution  UUID;
    v_current      NUMERIC;
    v_available    NUMERIC;
    v_rows         INTEGER;
    v_issue_id     UUID;
    v_issue_number TEXT;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Issue quantity must be greater than zero' USING ERRCODE = '22023';
    END IF;

    IF p_store_id IS NULL AND p_institution_id IS NULL THEN
        RAISE EXCEPTION 'Cannot issue item: no store or institution given to issue from'
              USING ERRCODE = '22004';
    END IF;

    -- ── Resolve and LOCK the single stock row ────────────────────────────────
    -- FOR UPDATE is what kills the lost update: a concurrent issue for the same
    -- item now waits here instead of reading the same pre-issue quantity.
    -- INTO STRICT keeps the old maybeSingle() contract — refuse to guess when the
    -- institution fallback matches more than one store's row, rather than
    -- silently decrementing whichever row happened to come back first.
    BEGIN
        IF p_store_id IS NOT NULL THEN
            SELECT id, store_id, institution_id, current_quantity, available_quantity
              INTO STRICT v_stock_id, v_store, v_institution, v_current, v_available
              FROM public.ims_stock_summary
             WHERE item_id = p_item_id
               AND store_id = p_store_id
               FOR UPDATE;
        ELSE
            SELECT id, store_id, institution_id, current_quantity, available_quantity
              INTO STRICT v_stock_id, v_store, v_institution, v_current, v_available
              FROM public.ims_stock_summary
             WHERE item_id = p_item_id
               AND institution_id = p_institution_id
               FOR UPDATE;
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION
                'Cannot issue item: no stock record found for this item at this store'
                USING ERRCODE = 'P0002';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION
                'Cannot issue item: this item has stock rows in more than one store here — issue from a specific store'
                USING ERRCODE = 'P0003';
    END;

    -- ── Authorisation ────────────────────────────────────────────────────────
    -- SECURITY DEFINER bypasses RLS, so this function must make the check the
    -- ims_stock_summary / ims_stock_issues policies would have made. This mirrors
    -- them exactly — it neither widens nor narrows who may issue. The explicit
    -- NULL test matters: a NULL institution_id makes `IN (...)` evaluate to NULL,
    -- which IF would treat as false and fall through to allowing the write.
    IF NOT (
        public.get_current_user_role() = 'super_admin'
        OR (
            v_institution IS NOT NULL
            AND v_institution IN (SELECT public.ims_accessible_institution_ids())
        )
    ) THEN
        RAISE EXCEPTION 'You do not have access to the stock of this store'
              USING ERRCODE = '42501';
    END IF;

    -- ── The decrement ────────────────────────────────────────────────────────
    -- One guarded statement. The availability test lives in the WHERE clause, so
    -- overselling cannot happen even if the lock above is ever removed, and a
    -- zero-row result is treated as failure instead of success.
    UPDATE public.ims_stock_summary
       SET current_quantity   = COALESCE(current_quantity, 0)   - p_quantity,
           available_quantity = COALESCE(available_quantity, 0) - p_quantity,
           updated_at         = now()
     WHERE id = v_stock_id
       AND COALESCE(available_quantity, 0) >= p_quantity;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        -- Same wording the UI already toasts, so no client change is needed.
        RAISE EXCEPTION 'Cannot issue % units. Only % available in stock',
              p_quantity, COALESCE(v_available, 0)
              USING ERRCODE = 'P0001';
    END IF;

    -- ── The audit row ────────────────────────────────────────────────────────
    -- Same transaction as the decrement, so the two can no longer disagree.
    -- issued_by is taken from auth.uid() rather than a client-supplied id: the
    -- caller was passing its own user id anyway, and this makes it unspoofable.
    v_issue_number := 'ISS-'
                      || to_char(now() AT TIME ZONE 'utc', 'YYMMDD')
                      || '-'
                      || lpad((floor(random() * 100000))::INT::TEXT, 5, '0');

    INSERT INTO public.ims_stock_issues (
        issue_number, indent_id, item_id, quantity, unit_id,
        department_id, issued_by, notes, institution_id, store_id
    ) VALUES (
        v_issue_number, p_indent_id, p_item_id, p_quantity, p_unit_id,
        p_department_id, v_actor, p_notes, v_institution, v_store
    )
    RETURNING id INTO v_issue_id;

    RETURN jsonb_build_object(
        'issue_id',           v_issue_id,
        'issue_number',       v_issue_number,
        'item_id',            p_item_id,
        'store_id',           v_store,
        'quantity_issued',    p_quantity,
        'current_quantity',   COALESCE(v_current, 0)   - p_quantity,
        'available_quantity', COALESCE(v_available, 0) - p_quantity
    );
END;
$fn$;

-- Callers are cookie-session users, so `authenticated` needs EXECUTE. anon must
-- not: this writes stock. Explicit REVOKE first because the default grant on a
-- new function is EXECUTE to PUBLIC.
REVOKE ALL ON FUNCTION public.ims_issue_stock_to_department(
    UUID, UUID, NUMERIC, UUID, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ims_issue_stock_to_department(
    UUID, UUID, NUMERIC, UUID, UUID, TEXT, UUID, UUID
) TO authenticated;

COMMENT ON FUNCTION public.ims_issue_stock_to_department(
    UUID, UUID, NUMERIC, UUID, UUID, TEXT, UUID, UUID
) IS
'Atomically move stock out of a store and into a department: locks the stock row, decrements it under a guard, and writes the ims_stock_issues audit row in the same transaction. Raises on shortfall, missing stock row, ambiguous store, or no access - never returns quietly having done nothing. Replaces the client-side read-modify-write in lib/services/ims/issue-stock.ts.';
