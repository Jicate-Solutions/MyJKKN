-- Repair: cancelled bills that never had their balance zeroed, 2026-09-01.
--
-- WHAT WENT WRONG:
--   StudentBillService.cancelStudentBill() sets balance_amount = 0 alongside
--   status = 'cancelled'. Yet 38 of the 40 cancelled bills in production still
--   carried a non-zero balance_amount, every one of them exactly equal to
--   final_amount -- i.e. untouched. Combined with the fact that
--   user_activity_logs holds ZERO 'bill_cancel' rows, the conclusion is that
--   none of these went through the service at all; they were cancelled by
--   direct SQL, which set the status and nothing else.
--
-- WHY IT MATTERS:
--   calculate_student_outstanding() filters on status IN ('unpaid',
--   'partially_paid','overdue'), so the learner-facing Outstanding figure was
--   never wrong. But a stale balance is a live trap for any query that reaches
--   for balance_amount > 0 without also checking status -- the same class of
--   mistake lib/billing/bill-status.ts was written to stop, where the bills
--   table and the learner page each filtered 'superseded' but not 'cancelled'.
--   Leaving 38 rows that contradict the invariant guarantees someone
--   eventually trusts the column.
--
-- SAFETY:
--   Scoped to cancelled bills with NO receipted money, which is all 38 (each
--   verified at 0 receipted, balance_amount = final_amount). A cancelled bill
--   that DOES hold money is left alone: one such row exists (Rs 2,500 against
--   an already-cancelled bill) and it is a genuine reconciliation problem for
--   accounts to decide on, not a stale-column artefact to be tidied away.
--
--   This does NOT trip trg_billing_bills_guard_cancel from the companion
--   migration: the guard only fires on a transition INTO 'cancelled', and
--   these rows are already there.

DO $$
DECLARE
  v_repaired integer;
  v_skipped  integer;
BEGIN
  SELECT count(*) INTO v_skipped
  FROM public.billing_student_bills b
  WHERE b.status = 'cancelled'
    AND b.balance_amount IS DISTINCT FROM 0
    AND EXISTS (SELECT 1 FROM public.billing_receipt_items ri WHERE ri.bill_id = b.id);

  WITH repaired AS (
    UPDATE public.billing_student_bills b
       SET balance_amount = 0,
           updated_at     = now()
     WHERE b.status = 'cancelled'
       AND b.balance_amount IS DISTINCT FROM 0
       AND NOT EXISTS (SELECT 1 FROM public.billing_receipt_items ri WHERE ri.bill_id = b.id)
    RETURNING 1
  )
  SELECT count(*) INTO v_repaired FROM repaired;

  RAISE NOTICE 'cancelled-bill balance repair: % zeroed, % left alone (receipted money present)',
    v_repaired, v_skipped;
END;
$$;
