-- 20260819100000_billing_receipt_atomic_create.sql
--
-- Fixes two defects in the receipt creation path, both surfaced while
-- diagnosing a Transport Head who could not generate a transport fee receipt.
--
-- ---------------------------------------------------------------------------
-- 1. Orphan receipt headers (the real bug)
-- ---------------------------------------------------------------------------
-- BillingReceiptService.createBillingReceipt performs a multi-statement write
-- over PostgREST: INSERT the header, then INSERT the items, then hand-roll a
-- compensating `delete()` if the items fail. PostgREST gives each of those its
-- own transaction, so the "rollback" is best-effort application code — and it
-- is itself gated by billing.receipts.delete. A role that can create receipts
-- but not delete them (there is no reason those two keys must travel together)
-- gets a silent no-op DELETE: RLS-filtered writes affect zero rows without
-- raising. The result is a committed receipt header with no items — a receipt
-- that settles nothing but exists, and which the SECURITY DEFINER bill-status
-- trigger never sees because no item row was ever written.
--
-- The fix is atomicity rather than a better compensating write. A plpgsql
-- function body is a single transaction, so header and items now commit or
-- roll back together and no compensation is needed at all.
--
-- DELIBERATELY *NOT* SECURITY DEFINER. This function changes durability, not
-- authorization: every INSERT below is still evaluated against the caller's own
-- RLS policies exactly as before, so no role gains the ability to create a
-- receipt it could not create yesterday. Keeping it SECURITY INVOKER also keeps
-- the service-role callers working (Razorpay callbacks in
-- payment-gateway-service.ts create receipts with no auth.uid() at all); a
-- DEFINER function gating on user_has_permission() would have broken them.
--
-- The return payload is assembled from the values we inserted rather than read
-- back with RETURNING, because INSERT ... RETURNING applies the table's SELECT
-- policy. billing_receipts SELECT is gated on billing.receipts.view, so a
-- read-back would fail for exactly the collection-only roles this is meant to
-- support. The learner name lookup is left RLS-filtered on purpose: it resolves
-- for roles that can read learners and returns NULL otherwise, which is the
-- same behaviour the embed had, and it only feeds an activity-log label.
--
-- ---------------------------------------------------------------------------
-- 2. generate_receipt_number() was SECURITY INVOKER
-- ---------------------------------------------------------------------------
-- Safe today only by accident: it reads no tables, just nextval() on a
-- sequence. That makes correctness depend on every future edit remembering not
-- to touch a table — and a receipt number derived from a MAX() the caller
-- cannot fully see would silently collide. Marked SECURITY DEFINER so the
-- numbering authority is the function owner, never the caller's visibility.
-- This also drops the requirement that `authenticated` hold USAGE on the
-- sequence.
--
-- CREATE OR REPLACE, never DROP + CREATE: dropping a function discards its ACL,
-- and this codebase has already lost EXECUTE on a permission helper that way
-- and 403'd users who legitimately held the permission.

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  receipt_num TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM NOW())::TEXT;

  -- Sequence, not MAX(): atomic under concurrency and independent of what the
  -- caller is allowed to SELECT.
  sequence_num := nextval('billing_receipt_number_seq');

  -- Format: RCP-YYYY-NNNNNN
  receipt_num := 'RCP-' || year_part || '-' || LPAD(sequence_num::TEXT, 6, '0');

  RETURN receipt_num;
END;
$function$;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_create_billing_receipt(
  p_receipt jsonb,
  p_items   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_id            uuid := gen_random_uuid();
  v_number        text;
  v_receipt_date  date;
  v_item          jsonb;
  v_item_count    integer := 0;
  v_first_name    text;
  v_last_name     text;
  v_student_id    uuid := (p_receipt->>'student_id')::uuid;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A receipt must settle at least one bill'
      USING ERRCODE = 'check_violation';
  END IF;

  v_receipt_date := COALESCE((p_receipt->>'receipt_date')::date, CURRENT_DATE);
  v_number := generate_receipt_number();

  INSERT INTO billing_receipts (
    id, receipt_number, receipt_date, student_id, institution_id,
    payment_mode, payment_reference_number, payment_amount, payment_paid_date,
    payer_name, payer_contact, accountant_id, payment_remarks, created_by
  )
  VALUES (
    v_id,
    v_number,
    v_receipt_date,
    v_student_id,
    (p_receipt->>'institution_id')::uuid,
    p_receipt->>'payment_mode',
    p_receipt->>'payment_reference_number',
    (p_receipt->>'payment_amount')::numeric,
    (p_receipt->>'payment_paid_date')::date,
    p_receipt->>'payer_name',
    p_receipt->>'payer_contact',
    (p_receipt->>'accountant_id')::uuid,
    p_receipt->>'payment_remarks',
    (p_receipt->>'created_by')::uuid
  );

  -- Same transaction as the header. If any item is rejected — by RLS, by the
  -- overpayment guard, by a bad bill_id — the header goes with it.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO billing_receipt_items (receipt_id, bill_id, amount_paid)
    VALUES (
      v_id,
      (v_item->>'bill_id')::uuid,
      (v_item->>'amount_paid')::numeric
    );
    v_item_count := v_item_count + 1;
  END LOOP;

  -- Display label for the activity log only. RLS-filtered by design: NULL for
  -- roles with no learner read access, exactly as the old embed behaved.
  BEGIN
    SELECT lp.first_name, lp.last_name
      INTO v_first_name, v_last_name
      FROM learners_profiles lp
     WHERE lp.id = v_student_id;
  EXCEPTION WHEN OTHERS THEN
    v_first_name := NULL;
    v_last_name  := NULL;
  END;

  RETURN jsonb_build_object(
    'id',              v_id,
    'receipt_number',  v_number,
    'receipt_date',    v_receipt_date,
    'student_id',      v_student_id,
    'institution_id',  (p_receipt->>'institution_id')::uuid,
    'payment_amount',  (p_receipt->>'payment_amount')::numeric,
    'item_count',      v_item_count,
    'student_first_name', v_first_name,
    'student_last_name',  v_last_name
  );
END;
$function$;

-- Lock both functions from anon. Postgres grants EXECUTE to PUBLIC by default
-- and Supabase grants anon directly, so a function is callable by any
-- unauthenticated client until explicitly revoked.
--
-- This matters most for generate_receipt_number(): marking it SECURITY DEFINER
-- above is exactly what makes the default grant dangerous. As INVOKER it was
-- harmless to anon (no sequence USAGE, RLS blocks everything downstream); as
-- DEFINER it runs with the owner's rights, so an unauthenticated caller could
-- burn receipt numbers off the sequence at will and punch permanent gaps in the
-- receipt series. Hardening the function's security context and locking its ACL
-- are one change, not two.
--
-- fn_create_billing_receipt is SECURITY INVOKER, so RLS already stops an anon
-- caller from writing anything — locked anyway, per convention.
REVOKE EXECUTE ON FUNCTION public.generate_receipt_number() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_receipt_number()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_create_billing_receipt(jsonb, jsonb)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_create_billing_receipt(jsonb, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_create_billing_receipt(jsonb, jsonb) IS
  'Atomically creates a billing receipt header and its items. SECURITY INVOKER '
  'on purpose: RLS still decides who may write, this only guarantees the two '
  'writes share a transaction so a rejected item cannot leave an orphan header.';
