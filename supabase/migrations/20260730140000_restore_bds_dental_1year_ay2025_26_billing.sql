-- RESTORE the billing data purged by 20260730120000_purge_bds_dental_1year_ay2025_26_billing.sql.
-- The operator reported the deletion was a mistake, 2026-07-30.
--
-- Restores, from the _bak_bds1y_*_20260730 snapshots:
--     361  billing_student_bills        Rs 14,76,62,500
--      18  billing_receipts             Rs    41,61,500
--      21  billing_receipt_items
--      10  tms_fee_bill
--       1  payment_transaction_items
--      30  user_activity_logs
--      99  mv_student_billing_summary
--
-- WHY THIS IS NOT A PLAIN "INSERT ... SELECT *".
-- Seven USER triggers fire on INSERT into these tables and three of them would
-- either abort the restore or silently rewrite the values being restored:
--
--   billing_receipt_items.trg_prevent_bill_overpayment
--       The bills are restored verbatim, already carrying status='paid' and their
--       settled balances. Re-inserting their receipt items then looks like a SECOND
--       payment against an already-paid bill and is REJECTED.
--   billing_student_bills.trg_billing_bill_default_academic_year
--       Would overwrite academic_year_id — the exact column whose per-bill values
--       (2025-26 .. 2028-29) we are trying to bring back.
--   billing_student_bills.trg_billing_bills_once_per_learner  (BL001)
--       Would block any bill whose (learner, category) slot appears occupied.
--
-- Also mutating rather than blocking: trigger_update_bill_status_on_payment,
-- trg_evaluate_status_after_payment (recompute status/balance),
-- trg_bill_apply_hostel_fee_categories_ins, trg_cl_upgrade_holds_after_payment
-- (campus-living side effects), and the two *_refresh_summary triggers, which would
-- re-derive mv_student_billing_summary instead of restoring the snapshot rows.
--
-- Therefore: ALTER TABLE ... DISABLE TRIGGER USER for the duration. This disables
-- only user triggers — FK enforcement triggers are internal and stay ACTIVE, so
-- referential integrity is still checked on every insert. DDL is transactional in
-- Postgres, so if any step fails the re-enable rolls back with everything else.
--
-- FIDELITY IS PROVEN, NOT ASSUMED. After re-enabling, each table is diffed against
-- its snapshot with EXCEPT in BOTH directions, which compares every column. Any
-- single differing byte aborts the migration.
--
-- INSERT ORDER is parent-first (the reverse of the purge): bills and receipts before
-- receipt_items; bills before tms_fee_bill and payment_transaction_items.
--
-- NOT DONE HERE: the 361 webhook_logs SAFETY_ALERT rows the purge generated are
-- left in place as an audit trail of the mistaken delete. The kept
-- payment_transactions gateway row needs no change — its bill_ids[] entry stops
-- dangling the moment the bill is back.

SET statement_timeout = '900s';

-- ---------------------------------------------------------------------------
-- 1. Pre-flight guards. Abort unless the restore path is provably clear.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bills int; v_receipts int; v_items int; v_tms int; v_pay int; v_logs int; v_sum int;
  v_live_bills int; v_live_rcp int; v_id_taken int; v_num_taken int; v_live_sum int;
  v_learners int; v_pt_parent int;
BEGIN
  SELECT COUNT(*) INTO v_bills    FROM public._bak_bds1y_bills_20260730;
  SELECT COUNT(*) INTO v_receipts FROM public._bak_bds1y_receipts_20260730;
  SELECT COUNT(*) INTO v_items    FROM public._bak_bds1y_receipt_items_20260730;
  SELECT COUNT(*) INTO v_tms      FROM public._bak_bds1y_tms_fee_bill_20260730;
  SELECT COUNT(*) INTO v_pay      FROM public._bak_bds1y_payment_items_20260730;
  SELECT COUNT(*) INTO v_logs     FROM public._bak_bds1y_activity_logs_20260730;
  SELECT COUNT(*) INTO v_sum      FROM public._bak_bds1y_summaries_20260730;

  IF v_bills    <> 361 THEN RAISE EXCEPTION 'Aborting: snapshot has % bills, expected 361.', v_bills;      END IF;
  IF v_receipts <> 18  THEN RAISE EXCEPTION 'Aborting: snapshot has % receipts, expected 18.', v_receipts; END IF;
  IF v_items    <> 21  THEN RAISE EXCEPTION 'Aborting: snapshot has % items, expected 21.', v_items;       END IF;
  IF v_tms      <> 10  THEN RAISE EXCEPTION 'Aborting: snapshot has % tms rows, expected 10.', v_tms;      END IF;
  IF v_pay      <> 1   THEN RAISE EXCEPTION 'Aborting: snapshot has % payment items, expected 1.', v_pay;  END IF;
  IF v_logs     <> 30  THEN RAISE EXCEPTION 'Aborting: snapshot has % logs, expected 30.', v_logs;         END IF;
  IF v_sum      <> 99  THEN RAISE EXCEPTION 'Aborting: snapshot has % summaries, expected 99.', v_sum;     END IF;

  -- Nothing may have been recreated in the meantime, or we would double-bill.
  SELECT COUNT(*) INTO v_live_bills FROM public.billing_student_bills b
    JOIN public._bak_bds1y_scope_20260730 s ON s.learner_id = b.student_id;
  SELECT COUNT(*) INTO v_live_rcp   FROM public.billing_receipts r
    JOIN public._bak_bds1y_scope_20260730 s ON s.learner_id = r.student_id;

  IF v_live_bills <> 0 THEN
    RAISE EXCEPTION 'Aborting: % bill(s) already exist for the cohort. Bills were recreated after the purge — restoring now would duplicate them. Reconcile by hand.', v_live_bills;
  END IF;
  IF v_live_rcp <> 0 THEN
    RAISE EXCEPTION 'Aborting: % receipt(s) already exist for the cohort.', v_live_rcp;
  END IF;

  -- Primary keys and receipt numbers must still be free.
  SELECT COUNT(*) INTO v_id_taken  FROM public.billing_student_bills x
   WHERE x.id IN (SELECT id FROM public._bak_bds1y_bills_20260730);
  SELECT COUNT(*) INTO v_num_taken FROM public.billing_receipts x
   WHERE x.receipt_number IN (SELECT receipt_number FROM public._bak_bds1y_receipts_20260730);
  SELECT COUNT(*) INTO v_live_sum  FROM public.mv_student_billing_summary m
    JOIN public._bak_bds1y_scope_20260730 s ON s.learner_id = m.student_id;

  IF v_id_taken  <> 0 THEN RAISE EXCEPTION 'Aborting: % bill id(s) already in use.', v_id_taken;              END IF;
  IF v_num_taken <> 0 THEN RAISE EXCEPTION 'Aborting: % receipt_number(s) already in use.', v_num_taken;      END IF;
  IF v_live_sum  <> 0 THEN RAISE EXCEPTION 'Aborting: % summary row(s) already present.', v_live_sum;         END IF;

  -- FK parents must exist: the learners, and the kept gateway transaction.
  SELECT COUNT(*) INTO v_learners FROM public.learners_profiles lp
    JOIN public._bak_bds1y_scope_20260730 s ON s.learner_id = lp.id;
  IF v_learners <> 99 THEN
    RAISE EXCEPTION 'Aborting: only % of 99 learner profiles exist; bills would violate their FK.', v_learners;
  END IF;

  SELECT COUNT(DISTINCT pt.id) INTO v_pt_parent FROM public.payment_transactions pt
   WHERE pt.id IN (SELECT transaction_id FROM public._bak_bds1y_payment_items_20260730);
  IF v_pt_parent <> 1 THEN
    RAISE EXCEPTION 'Aborting: payment_transactions parent missing (found %); payment_transaction_items cannot be restored.', v_pt_parent;
  END IF;

  RAISE NOTICE 'Pre-flight passed. Restoring 361 bills, 18 receipts, 21 items, 10 tms, 1 payment item, 30 logs, 99 summaries.';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Silence USER triggers. FK enforcement is internal and remains active.
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_student_bills       DISABLE TRIGGER USER;
ALTER TABLE public.billing_receipts            DISABLE TRIGGER USER;
ALTER TABLE public.billing_receipt_items       DISABLE TRIGGER USER;
ALTER TABLE public.tms_fee_bill                DISABLE TRIGGER USER;
ALTER TABLE public.payment_transaction_items   DISABLE TRIGGER USER;
ALTER TABLE public.user_activity_logs          DISABLE TRIGGER USER;
ALTER TABLE public.mv_student_billing_summary  DISABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 3. Restore, parent-first.
-- ---------------------------------------------------------------------------
INSERT INTO public.billing_student_bills      SELECT * FROM public._bak_bds1y_bills_20260730;
INSERT INTO public.billing_receipts           SELECT * FROM public._bak_bds1y_receipts_20260730;
INSERT INTO public.billing_receipt_items      SELECT * FROM public._bak_bds1y_receipt_items_20260730;
INSERT INTO public.tms_fee_bill               SELECT * FROM public._bak_bds1y_tms_fee_bill_20260730;
INSERT INTO public.payment_transaction_items  SELECT * FROM public._bak_bds1y_payment_items_20260730;
INSERT INTO public.user_activity_logs         SELECT * FROM public._bak_bds1y_activity_logs_20260730;
INSERT INTO public.mv_student_billing_summary SELECT * FROM public._bak_bds1y_summaries_20260730;

-- ---------------------------------------------------------------------------
-- 4. Re-enable triggers BEFORE verifying, so the table is back to normal
--    operating state even while we still hold the transaction open.
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_student_bills       ENABLE TRIGGER USER;
ALTER TABLE public.billing_receipts            ENABLE TRIGGER USER;
ALTER TABLE public.billing_receipt_items       ENABLE TRIGGER USER;
ALTER TABLE public.tms_fee_bill                ENABLE TRIGGER USER;
ALTER TABLE public.payment_transaction_items   ENABLE TRIGGER USER;
ALTER TABLE public.user_activity_logs          ENABLE TRIGGER USER;
ALTER TABLE public.mv_student_billing_summary  ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 5. Prove byte-for-byte fidelity. EXCEPT compares EVERY column, both ways.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_missing int; v_differs int; v_disabled int;
BEGIN
  -- bills
  SELECT COUNT(*) INTO v_missing FROM (
    SELECT * FROM public._bak_bds1y_bills_20260730
    EXCEPT SELECT * FROM public.billing_student_bills) d;
  SELECT COUNT(*) INTO v_differs FROM (
    SELECT * FROM public.billing_student_bills WHERE id IN (SELECT id FROM public._bak_bds1y_bills_20260730)
    EXCEPT SELECT * FROM public._bak_bds1y_bills_20260730) d;
  IF v_missing <> 0 OR v_differs <> 0 THEN
    RAISE EXCEPTION 'bills not faithfully restored: % missing, % altered.', v_missing, v_differs;
  END IF;

  -- receipts
  SELECT COUNT(*) INTO v_missing FROM (
    SELECT * FROM public._bak_bds1y_receipts_20260730
    EXCEPT SELECT * FROM public.billing_receipts) d;
  SELECT COUNT(*) INTO v_differs FROM (
    SELECT * FROM public.billing_receipts WHERE id IN (SELECT id FROM public._bak_bds1y_receipts_20260730)
    EXCEPT SELECT * FROM public._bak_bds1y_receipts_20260730) d;
  IF v_missing <> 0 OR v_differs <> 0 THEN
    RAISE EXCEPTION 'receipts not faithfully restored: % missing, % altered.', v_missing, v_differs;
  END IF;

  -- receipt items
  SELECT COUNT(*) INTO v_missing FROM (
    SELECT * FROM public._bak_bds1y_receipt_items_20260730
    EXCEPT SELECT * FROM public.billing_receipt_items) d;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'receipt items not faithfully restored: % missing/altered.', v_missing;
  END IF;

  -- tms_fee_bill
  SELECT COUNT(*) INTO v_missing FROM (
    SELECT * FROM public._bak_bds1y_tms_fee_bill_20260730
    EXCEPT SELECT * FROM public.tms_fee_bill) d;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'tms_fee_bill not faithfully restored: % missing/altered.', v_missing;
  END IF;

  -- payment_transaction_items
  SELECT COUNT(*) INTO v_missing FROM (
    SELECT * FROM public._bak_bds1y_payment_items_20260730
    EXCEPT SELECT * FROM public.payment_transaction_items) d;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'payment_transaction_items not faithfully restored: % missing/altered.', v_missing;
  END IF;

  -- user_activity_logs
  SELECT COUNT(*) INTO v_missing FROM (
    SELECT * FROM public._bak_bds1y_activity_logs_20260730
    EXCEPT SELECT * FROM public.user_activity_logs) d;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'user_activity_logs not faithfully restored: % missing/altered.', v_missing;
  END IF;

  -- mv_student_billing_summary
  SELECT COUNT(*) INTO v_missing FROM (
    SELECT * FROM public._bak_bds1y_summaries_20260730
    EXCEPT SELECT * FROM public.mv_student_billing_summary) d;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'mv_student_billing_summary not faithfully restored: % missing/altered.', v_missing;
  END IF;

  -- Every user trigger we touched must be back ON. tgenabled: 'O' = enabled.
  SELECT COUNT(*) INTO v_disabled
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
    AND t.tgenabled = 'D'
    AND c.relname IN ('billing_student_bills','billing_receipts','billing_receipt_items',
                      'tms_fee_bill','payment_transaction_items','user_activity_logs',
                      'mv_student_billing_summary');
  IF v_disabled <> 0 THEN
    RAISE EXCEPTION 'CRITICAL: % user trigger(s) left DISABLED. Refusing to commit.', v_disabled;
  END IF;

  RAISE NOTICE 'Restore verified byte-for-byte: 361 bills, 18 receipts, 21 items, 10 tms, 1 payment item, 30 logs, 99 summaries. All triggers re-enabled.';
END $$;
