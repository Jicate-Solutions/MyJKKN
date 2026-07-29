-- Void a mistakenly-issued billing receipt, preserving the audit trail.
--
-- WHY AN ARCHIVE TABLE AND NOT A `voided_at` FLAG:
--   26 functions read public.billing_receipts, ~20 of them summing
--   payment_amount directly (fn_accounts_metrics, get_billing_today_collections,
--   get_billing_report_collections, get_billing_analytics_overview,
--   get_billing_collection_split, refresh_student_billing_summary, the reports
--   RPCs, …). A `voided_at` column would require adding `AND voided_at IS NULL`
--   to every one of them, and missing a single site silently OVERSTATES
--   collections — a failure that is invisible until someone reconciles by hand.
--   Moving the row out of billing_receipts makes all 26 correct with no edits.
--
--   This is only safe because generate_receipt_number() draws from a real
--   sequence (nextval('billing_receipt_number_seq')), NOT MAX(receipt_number),
--   so removing a row can never cause a number to be reused. The one function
--   that DOES use MAX() -- reset_receipt_number_sequence_for_year() -- is fixed
--   below to consider the archive.
--
-- HOW THE BILL GETS REVERTED:
--   Deleting the receipt cascades to billing_receipt_items
--   (fk_billing_receipt_items_receipt ON DELETE CASCADE), which fires
--   trigger_update_bill_status_on_delete -> update_bill_status_on_delete().
--   That re-sums the remaining paid amount and rewrites the bill's status and
--   balance_amount. We deliberately reuse that existing path rather than
--   recomputing the bill here, so there is exactly one implementation of
--   "what does this bill's status mean".

-- ---------------------------------------------------------------------------
-- 1. Archive table — mirrors billing_receipts plus the void metadata and a
--    snapshot of the receipt_items rows (which the cascade destroys).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_receipts_voided (
  id                      uuid PRIMARY KEY,
  receipt_number          text NOT NULL,
  receipt_date            date,
  student_id              uuid,
  institution_id          uuid,
  payment_mode            text,
  payment_reference_number text,
  payment_amount          numeric,
  payment_paid_date       date,
  payer_name              text,
  payer_contact           text,
  accountant_id           uuid,
  payment_remarks         text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz,
  -- The billing_receipt_items rows as they were, so a void is reversible by a
  -- human and an auditor can still see what the receipt settled.
  items_snapshot          jsonb NOT NULL DEFAULT '[]'::jsonb,
  voided_at               timestamptz NOT NULL DEFAULT now(),
  voided_by               uuid,
  void_reason             text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_receipts_voided_student
  ON public.billing_receipts_voided (student_id);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_voided_institution
  ON public.billing_receipts_voided (institution_id);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_voided_voided_at
  ON public.billing_receipts_voided (voided_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_voided_number
  ON public.billing_receipts_voided (receipt_number);

-- Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, so a
-- brand-new public-schema table arrives with SELECT/INSERT/UPDATE/DELETE already
-- granted to the anon key that ships in every page of jkkn.ai. RLS is NOT a
-- substitute for this REVOKE, and these rows carry learner names, amounts and
-- payment references.
REVOKE ALL ON TABLE public.billing_receipts_voided FROM anon, PUBLIC;

ALTER TABLE public.billing_receipts_voided ENABLE ROW LEVEL SECURITY;

-- Staff-only. A voided receipt must NOT appear to the learner: unlike
-- billing_receipts_select_permission there is deliberately no student self-view
-- branch here, or a learner would keep seeing a receipt that no longer settles
-- anything.
DROP POLICY IF EXISTS billing_receipts_voided_select_permission ON public.billing_receipts_voided;
CREATE POLICY billing_receipts_voided_select_permission
  ON public.billing_receipts_voided FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('billing.receipts.view') AND role_has_institution_access(institution_id))
  );

-- No INSERT/UPDATE/DELETE policies: the archive is written ONLY by
-- fn_void_billing_receipt below. An archive a user can edit is not an archive.

-- ---------------------------------------------------------------------------
-- 2. The void RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_void_billing_receipt(
  p_receipt_id uuid,
  p_reason     text
)
RETURNS TABLE(receipt_number text, bill_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt public.billing_receipts%ROWTYPE;
  v_items   jsonb;
  v_bills   uuid[];
BEGIN
  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION 'fn_void_billing_receipt: p_receipt_id must not be NULL';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required to void a receipt';
  END IF;

  SELECT * INTO v_receipt FROM public.billing_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt % not found (already voided or deleted)', p_receipt_id;
  END IF;

  -- SECURITY DEFINER bypasses RLS, so this function must authorize itself or it
  -- becomes a hole through which any authenticated user can void any receipt.
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('billing.receipts.delete')
        AND role_has_institution_access(v_receipt.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to void receipts for this institution';
  END IF;

  -- Guard 1: refunds cascade-delete from billing_receipts. Voiding a refunded
  -- receipt would erase the record that money went back to the learner.
  IF EXISTS (SELECT 1 FROM public.billing_refunds WHERE receipt_id = p_receipt_id) THEN
    RAISE EXCEPTION 'Cannot void: this receipt has refunds recorded against it. Reverse the refund first.';
  END IF;

  -- Guard 2: invoice items cascade too, which would leave an invoice carrying a
  -- grand_total with no lines behind it.
  IF EXISTS (SELECT 1 FROM public.billing_invoice_items WHERE receipt_id = p_receipt_id) THEN
    RAISE EXCEPTION 'Cannot void: this receipt is attached to an invoice. Cancel the invoice first.';
  END IF;

  -- Guard 3: an online receipt would simply come back. PaymentGatewayService.
  -- processSuccessfulPayment dedupes on payment_reference_number, so with the
  -- receipt gone the next webhook or late-auth sweep re-creates it. A captured
  -- payment is reversed with a refund, never with a void.
  IF v_receipt.payment_reference_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payment_transactions t
    WHERE t.status = 'success'
      AND v_receipt.payment_reference_number IN (
            t.razorpay_payment_id, t.gateway_transaction_id, t.transaction_ref
          )
  ) THEN
    RAISE EXCEPTION 'Cannot void: this receipt settles a captured online payment (%). Issue a refund instead — voiding it would be undone by the next webhook or reconciliation sweep.',
      v_receipt.payment_reference_number;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(ri)), '[]'::jsonb),
         COALESCE(array_agg(ri.bill_id), ARRAY[]::uuid[])
    INTO v_items, v_bills
  FROM public.billing_receipt_items ri
  WHERE ri.receipt_id = p_receipt_id;

  INSERT INTO public.billing_receipts_voided (
    id, receipt_number, receipt_date, student_id, institution_id, payment_mode,
    payment_reference_number, payment_amount, payment_paid_date, payer_name,
    payer_contact, accountant_id, payment_remarks, created_by, created_at,
    updated_at, items_snapshot, voided_by, void_reason
  ) VALUES (
    v_receipt.id, v_receipt.receipt_number, v_receipt.receipt_date,
    v_receipt.student_id, v_receipt.institution_id, v_receipt.payment_mode,
    v_receipt.payment_reference_number, v_receipt.payment_amount,
    v_receipt.payment_paid_date, v_receipt.payer_name, v_receipt.payer_contact,
    v_receipt.accountant_id, v_receipt.payment_remarks, v_receipt.created_by,
    v_receipt.created_at, v_receipt.updated_at, v_items, auth.uid(), trim(p_reason)
  );

  -- Cascades to billing_receipt_items, whose AFTER DELETE trigger recomputes
  -- each affected bill's status and balance_amount.
  DELETE FROM public.billing_receipts WHERE id = p_receipt_id;

  -- ::text is load-bearing. billing_receipts.receipt_number is varchar(50) and
  -- this function declares RETURNS TABLE(receipt_number text); without the cast
  -- Postgres rejects the whole call with 42804 "structure of query does not
  -- match function result type". Caught in testing, not in review.
  RETURN QUERY SELECT v_receipt.receipt_number::text, v_bills;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_void_billing_receipt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_void_billing_receipt(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The one MAX()-based function that the archive would otherwise fool.
--    Without the archive in this UNION it could rewind the sequence past a
--    voided receipt's number and hand the same number out twice.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_receipt_number_sequence_for_year()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    current_year TEXT;
    current_max INTEGER;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW())::TEXT;

    SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 10) AS INTEGER)), 0)
    INTO current_max
    FROM (
        SELECT receipt_number FROM public.billing_receipts
        UNION ALL
        SELECT receipt_number FROM public.billing_receipts_voided
    ) all_receipts
    WHERE receipt_number LIKE 'RCP-' || current_year || '-%';

    PERFORM setval('billing_receipt_number_seq', current_max + 1, false);

    RAISE NOTICE 'Receipt number sequence reset for year %. Max was: %, Starting from: %',
        current_year, current_max, current_max + 1;
END;
$function$;
