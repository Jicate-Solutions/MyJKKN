-- ============================================================================
-- 20260909002000 — fn_create_school_fee_receipt
-- ============================================================================
-- The School Bill Payment counter's OWN atomic writer.
--
-- ############################################################################
-- # WHY A SECOND FUNCTION INSTEAD OF EXTENDING fn_create_billing_receipt.     #
-- #                                                                           #
-- # The college RPC (20260819100000) lists its INSERT columns explicitly and  #
-- # does not carry date_of_credit / dd_bank_name / dd_branch / remitter_name  #
-- # — the non-cash detail the school counter collects for DD and NEFT.        #
-- # Widening it would put every school change in the blast radius of the live #
-- # college receipting path, which is the one thing this module must not      #
-- # touch. So school gets its own function, and the college one is left       #
-- # exactly as it is.                                                         #
-- #                                                                           #
-- # Everything else is a faithful mirror of the college RPC: same one-        #
-- # transaction guarantee, same SECURITY INVOKER stance, same return shape.   #
-- # Both write the SAME billing_receipts / billing_receipt_items tables —      #
-- # receipts, refunds, apportionment and the parent portal keep working       #
-- # because the row shape is unchanged.                                       #
-- ############################################################################
--
-- SECURITY INVOKER on purpose: RLS still decides who may write. This function
-- guarantees only that the header and its items share a transaction, so a
-- rejected item cannot leave an orphan header settling nothing (the failure
-- mode that produced 8 orphans in production between 2026-05-28 and
-- 2026-08-08 — see 20260819100000).
--
-- REQUIRES:
--   20260909000000 — the four columns this function writes
--   20251009       — generate_receipt_number()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_create_school_fee_receipt(
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
  v_non_school    integer;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A receipt must settle at least one bill'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---------------------------------------------------------------------
  -- The separation, enforced rather than assumed.
  --
  -- This function may only settle SCHOOL bills (school_fee_plan_id IS NOT
  -- NULL). Without this, a caller could route a college bill through the
  -- school path and write school-only columns onto a college receipt —
  -- exactly the crossover the two-function split exists to prevent.
  -- ---------------------------------------------------------------------
  SELECT count(*)
    INTO v_non_school
    FROM jsonb_array_elements(p_items) AS i
    JOIN billing_student_bills b ON b.id = (i->>'bill_id')::uuid
   WHERE b.school_fee_plan_id IS NULL;

  IF v_non_school > 0 THEN
    RAISE EXCEPTION 'fn_create_school_fee_receipt may only settle school fee bills'
      USING ERRCODE = 'check_violation';
  END IF;

  v_receipt_date := COALESCE((p_receipt->>'receipt_date')::date, CURRENT_DATE);
  v_number := generate_receipt_number();

  INSERT INTO billing_receipts (
    id, receipt_number, receipt_date, student_id, institution_id,
    payment_mode, payment_reference_number, payment_amount, payment_paid_date,
    payer_name, payer_contact, accountant_id, payment_remarks, created_by,
    -- The four this function exists for.
    date_of_credit, dd_bank_name, dd_branch, remitter_name
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
    (p_receipt->>'created_by')::uuid,
    -- NULLIF so an empty string from the form lands as NULL, not ''. The
    -- date cast would reject '' outright.
    NULLIF(p_receipt->>'date_of_credit', '')::date,
    NULLIF(p_receipt->>'dd_bank_name', ''),
    NULLIF(p_receipt->>'dd_branch', ''),
    NULLIF(p_receipt->>'remitter_name', '')
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
  -- roles with no learner read access.
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
    'id',                 v_id,
    'receipt_number',     v_number,
    'receipt_date',       v_receipt_date,
    'student_id',         v_student_id,
    'institution_id',     (p_receipt->>'institution_id')::uuid,
    'payment_amount',     (p_receipt->>'payment_amount')::numeric,
    'item_count',         v_item_count,
    'student_first_name', v_first_name,
    'student_last_name',  v_last_name
  );
END;
$function$;

-- Postgres grants EXECUTE to PUBLIC by default and Supabase grants anon
-- directly, so lock it even though SECURITY INVOKER means RLS already stops an
-- anon caller from writing anything. Same convention as 20260819100000.
REVOKE EXECUTE ON FUNCTION public.fn_create_school_fee_receipt(jsonb, jsonb)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_create_school_fee_receipt(jsonb, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_create_school_fee_receipt(jsonb, jsonb) IS
  'Atomically creates a SCHOOL fee receipt header and its items, including the '
  'non-cash columns (date_of_credit, dd_bank_name, dd_branch, remitter_name) '
  'that fn_create_billing_receipt does not carry. Refuses any bill whose '
  'school_fee_plan_id IS NULL. SECURITY INVOKER: RLS still decides who may write.';
