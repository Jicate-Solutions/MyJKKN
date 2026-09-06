-- ============================================================================
-- 20260616160000 — Make TMS fee-bill deletion safe (close the orphan trap).
-- ============================================================================
-- Context: the transport-fee billing pipeline (app lives at tms.jkkn.ai, tables
-- live in this shared DB) links each per-term ledger row to a real, payable row
-- in the central billing table:
--
--   tms_fee_structure
--     └──< tms_fee_bill.billing_student_bill_id  ──▶  billing_student_bills(id)
--
-- That link is a PLAIN UUID COLUMN, *not* a foreign key. Every tms_fee_* →
-- tms_fee_structure FK is ON DELETE CASCADE, so deleting a fee structure wipes
-- its terms / generation run / tms_fee_bill ledger — but LEAVES the matching
-- billing_student_bills rows behind. The student then keeps seeing untraceable
-- "Transport Fee" bills. That orphan risk is exactly why the TMS app blocks
-- deletion of any structure that has generated bills.
--
-- This trigger removes the risk at the database level: whenever a tms_fee_bill
-- row is deleted (directly OR via the structure cascade), it also deletes the
-- soft-linked billing_student_bills row — but ONLY when that bill is unpaid.
-- If the bill shows ANY payment activity it RAISES (fail-closed), so collected
-- money can never be silently destroyed. No change to the tms.jkkn.ai app is
-- required; this fires on whatever DELETE path reaches the DB.
--
-- SECURITY DEFINER: this is a cross-table integrity guard that must succeed
-- regardless of the caller's RLS rights on billing_student_bills.
--
-- search_path = public, pg_temp (NOT ''): deleting a billing_student_bills row
-- fires the pre-existing prevent_mass_delete() audit trigger, which does an
-- UNQUALIFIED `INSERT INTO webhook_logs ...` and sets no search_path of its own.
-- A function-local search_path propagates into that nested trigger, so an empty
-- path would make it fail with 42P01 (webhook_logs not found). public must be on
-- the path; pg_temp is pinned LAST so a temp table can't shadow a public object.
-- This function's own references stay fully schema-qualified.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tms_fee_bill_cleanup_linked_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bill       public.billing_student_bills%ROWTYPE;
  v_has_payment boolean;
BEGIN
  -- Nothing to clean up if this ledger row was never bridged to a real bill.
  IF OLD.billing_student_bill_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT * INTO v_bill
  FROM public.billing_student_bills
  WHERE id = OLD.billing_student_bill_id;

  -- Already removed (e.g. by a sibling term row in the same cascade). Idempotent.
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  -- Fail-closed: refuse if the linked bill shows any sign of payment.
  -- ('paid' / 'partially_paid' status, a payment date, or any receipt /
  --  payment-transaction line referencing it.)
  SELECT
    v_bill.status IS DISTINCT FROM 'unpaid'
    OR v_bill.payment_date IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.billing_receipt_items ri WHERE ri.bill_id = v_bill.id)
    OR EXISTS (SELECT 1 FROM public.payment_transaction_items pti WHERE pti.bill_id = v_bill.id)
  INTO v_has_payment;

  IF v_has_payment THEN
    RAISE EXCEPTION
      'Cannot delete TMS fee bill %: linked student bill % has payment activity (status=%). Refund/cancel the payment first.',
      OLD.id, v_bill.id, v_bill.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Safe: remove the orphan-prone student bill alongside the ledger row.
  -- (billing_student_bills' own AFTER DELETE triggers refresh
  --  mv_student_billing_summary and write the safety audit log.)
  DELETE FROM public.billing_student_bills WHERE id = v_bill.id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.tms_fee_bill_cleanup_linked_billing() IS
  'BEFORE DELETE on tms_fee_bill: deletes the soft-linked billing_student_bills row when unpaid; raises (restrict_violation) when it has payment activity. Closes the orphan trap created by the non-FK billing_student_bill_id link.';

DROP TRIGGER IF EXISTS trg_tms_fee_bill_cleanup_linked_billing ON public.tms_fee_bill;
CREATE TRIGGER trg_tms_fee_bill_cleanup_linked_billing
  BEFORE DELETE ON public.tms_fee_bill
  FOR EACH ROW
  EXECUTE FUNCTION public.tms_fee_bill_cleanup_linked_billing();

-- This is a trigger-only function — it must never be callable as a PostgREST RPC.
-- Supabase grants EXECUTE on public functions directly to anon/authenticated, so
-- REVOKE FROM PUBLIC alone is a no-op; the roles must be named. Revoking EXECUTE
-- does not affect trigger firing (the trigger manager bypasses EXECUTE checks).
REVOKE EXECUTE ON FUNCTION public.tms_fee_bill_cleanup_linked_billing() FROM anon, authenticated, PUBLIC;
