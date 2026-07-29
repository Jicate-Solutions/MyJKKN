-- Purge ALL billing data for BDS learners at JKKN Dental College in semesters
-- "2 Year", "3 Year", "4 Year" and "CRRI". Requested and confirmed 2026-07-29.
--
-- SCOPE (frozen to ids in _bak_bds_purge_scope_20260729)
--   Institution : JKKN Dental College and Hospital
--   Programme   : BDS only  (all MDS programmes excluded)
--   Semesters   : 2 Year  8e15676c-e3e8-4569-aa94-a4fd103bfede  (102 learners)
--                 3 Year  0f115110-37e9-48fe-adc9-6463971e5b3c  (102)
--                 4 Year  b9d3aa7d-f2c8-4324-ad8e-71482ace6e9a  ( 82)
--                 CRRI    a7fb1278-6182-4353-b1a9-c411f10d9701  (158)
--   Total       : 444 learners.  1 Year BDS is NOT in scope.
--
-- WHAT IS REMOVED
--     938  billing_student_bills          Rs 37,27,07,000  (5 paid / 4 partial / 929 unpaid)
--     393  billing_receipts               Rs 15,14,73,500
--       9  billing_receipt_items          Rs    20,10,500
--      16  tms_fee_bill                   (CASCADE from bills)
--       2  payment_transaction_items      (CASCADE from bills — unavoidable)
--      12  user_activity_logs
--     249  mv_student_billing_summary
--   Verified zero and therefore not touched: invoices, invoice items, refunds,
--   refund requests, discounts, apportionments, credit balances, receipt-cancel
--   requests, hostel-waitlist links, mess links, payment audit logs.
--
-- ACCEPTED RISK — recorded explicitly because it is not reversible outside the
-- snapshots this migration creates.
--   Of the 393 receipts, only 8 allocate to a bill. The other 385 (Rs 14,94,63,000)
--   have NO bill allocation at all: 382 of them are a single bulk import dated
--   2026-05-27 (receipt nos from RCP-2026-000270) with created_by NULL, no payment
--   reference and no remarks — a legacy fee-collection migration, exclusive to
--   Dental. Deleting them destroys the only record of that money, including for
--   78 already-graduated CRRI learners. There is no bill- or receipt-level audit
--   table in this database. The operator was shown these figures, was offered a
--   bills-only option, and chose the full purge.
--
-- DELIBERATELY KEPT (operator's choice): payment_transactions gateway rows and the
-- webhook_logs SAFETY_ALERT rows this delete generates, as the Razorpay
-- reconciliation trail. Note their bill_ids[] arrays will hold dangling uuids —
-- payment_transaction_items is ON DELETE CASCADE and cannot be preserved.
--
-- NOT TOUCHED: the 444 learners_profiles rows themselves, 1 Year BDS, every MDS
-- programme, every other institution, and every non-billing module.
--
-- ORDER IS SET BY TRIGGERS, NOT FKs. billing_receipt_items carries
-- trigger_update_bill_status_on_delete, which UPDATEs the parent bill per deleted
-- row. Those items are therefore deleted FIRST, while their bills still exist, so
-- the trigger is a clean no-op instead of racing the bill delete.
--
-- PERFORMANCE: two AFTER DELETE triggers fire per row —
-- trigger_refresh_student_billing_summary (4 aggregate scans + upsert) runs 1,331
-- times, and prevent_mass_delete (a logger despite the name; it blocks nothing)
-- writes 938 webhook_logs rows. Hence the raised statement_timeout below.
--
-- TO RESTORE (reverse order):
--   INSERT INTO billing_student_bills   SELECT * FROM _bak_bds_bills_20260729;
--   INSERT INTO billing_receipts        SELECT * FROM _bak_bds_receipts_20260729;
--   INSERT INTO billing_receipt_items   SELECT * FROM _bak_bds_receipt_items_20260729;
--   INSERT INTO tms_fee_bill            SELECT * FROM _bak_bds_tms_fee_bill_20260729;
--   INSERT INTO payment_transaction_items SELECT * FROM _bak_bds_payment_items_20260729;
--   INSERT INTO user_activity_logs      SELECT * FROM _bak_bds_activity_logs_20260729;
--   INSERT INTO mv_student_billing_summary SELECT * FROM _bak_bds_summaries_20260729;

SET LOCAL statement_timeout = '900s';

-- ---------------------------------------------------------------------------
-- 1. Freeze the scope ONCE. Every later step and the rollback read from this
--    table, so the 444 learners cannot drift between statements.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_bds_purge_scope_20260729 AS
SELECT lp.id AS learner_id, lp.roll_number, lp.lifecycle_status,
       s.id AS semester_id, s.semester_name
FROM public.learners_profiles lp
JOIN public.institutions i ON i.id = lp.institution_id
JOIN public.programs     p ON p.id = lp.program_id
JOIN public.semesters    s ON s.id = lp.semester_id
WHERE i.name = 'JKKN Dental College and Hospital'
  AND p.program_name = 'BDS'
  AND s.semester_name IN ('2 Year','3 Year','4 Year','CRRI');

-- ---------------------------------------------------------------------------
-- 2. Snapshot every table this migration touches.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_bds_bills_20260729 AS
SELECT b.* FROM public.billing_student_bills b
WHERE b.student_id IN (SELECT learner_id FROM public._bak_bds_purge_scope_20260729);

CREATE TABLE public._bak_bds_receipts_20260729 AS
SELECT r.* FROM public.billing_receipts r
WHERE r.student_id IN (SELECT learner_id FROM public._bak_bds_purge_scope_20260729);

CREATE TABLE public._bak_bds_receipt_items_20260729 AS
SELECT ri.* FROM public.billing_receipt_items ri
WHERE ri.bill_id    IN (SELECT id FROM public._bak_bds_bills_20260729)
   OR ri.receipt_id IN (SELECT id FROM public._bak_bds_receipts_20260729);

CREATE TABLE public._bak_bds_tms_fee_bill_20260729 AS
SELECT t.* FROM public.tms_fee_bill t
WHERE t.billing_student_bill_id IN (SELECT id FROM public._bak_bds_bills_20260729);

CREATE TABLE public._bak_bds_payment_items_20260729 AS
SELECT pi.* FROM public.payment_transaction_items pi
WHERE pi.bill_id IN (SELECT id FROM public._bak_bds_bills_20260729);

CREATE TABLE public._bak_bds_activity_logs_20260729 AS
SELECT ual.* FROM public.user_activity_logs ual
WHERE ual.resource_id IN (SELECT id FROM public._bak_bds_bills_20260729)
   OR ual.resource_id IN (SELECT id FROM public._bak_bds_receipts_20260729);

CREATE TABLE public._bak_bds_summaries_20260729 AS
SELECT m.* FROM public.mv_student_billing_summary m
WHERE m.student_id IN (SELECT learner_id FROM public._bak_bds_purge_scope_20260729);

-- Lock every snapshot down: RLS on, no policies, no API-role grants.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_bak_bds_purge_scope_20260729', '_bak_bds_bills_20260729',
    '_bak_bds_receipts_20260729',    '_bak_bds_receipt_items_20260729',
    '_bak_bds_tms_fee_bill_20260729','_bak_bds_payment_items_20260729',
    '_bak_bds_activity_logs_20260729','_bak_bds_summaries_20260729'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

COMMENT ON TABLE public._bak_bds_purge_scope_20260729 IS
  'The 444 BDS learners (Dental; semesters 2/3/4 Year + CRRI) whose billing data was purged on 2026-07-29. Learner rows themselves were NOT deleted.';

-- ---------------------------------------------------------------------------
-- 3. Guards. Any deviation aborts the whole migration, DDL included.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_learners int; v_bills int; v_receipts int; v_items int;
  v_semesters int; v_institutions int; v_programs int; v_blockers int;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT semester_id)
    INTO v_learners, v_semesters FROM public._bak_bds_purge_scope_20260729;

  SELECT COUNT(*) INTO v_bills    FROM public._bak_bds_bills_20260729;
  SELECT COUNT(*) INTO v_receipts FROM public._bak_bds_receipts_20260729;
  SELECT COUNT(*) INTO v_items    FROM public._bak_bds_receipt_items_20260729;

  IF v_learners  <> 444 THEN RAISE EXCEPTION 'Aborting: expected 444 learners in scope, got %.', v_learners;  END IF;
  IF v_semesters <> 4   THEN RAISE EXCEPTION 'Aborting: expected 4 semester ids, got %.', v_semesters;        END IF;
  IF v_bills     <> 938 THEN RAISE EXCEPTION 'Aborting: expected 938 bills, got %.', v_bills;                 END IF;
  IF v_receipts  <> 393 THEN RAISE EXCEPTION 'Aborting: expected 393 receipts, got %.', v_receipts;           END IF;
  IF v_items     <> 9   THEN RAISE EXCEPTION 'Aborting: expected 9 receipt items, got %.', v_items;           END IF;

  -- Scope must not have leaked outside Dental / BDS.
  SELECT COUNT(DISTINCT lp.institution_id), COUNT(DISTINCT lp.program_id)
    INTO v_institutions, v_programs
  FROM public.learners_profiles lp
  WHERE lp.id IN (SELECT learner_id FROM public._bak_bds_purge_scope_20260729);

  IF v_institutions <> 1 THEN RAISE EXCEPTION 'Aborting: scope spans % institutions, expected 1.', v_institutions; END IF;
  IF v_programs     <> 1 THEN RAISE EXCEPTION 'Aborting: scope spans % programmes, expected 1.', v_programs;       END IF;

  -- Nothing outside the scope may reference these bills through a
  -- NO ACTION / RESTRICT path, or the DELETE would abort mid-way.
  SELECT
      (SELECT COUNT(*) FROM public.billing_student_bills x
         WHERE x.superseded_by_bill_id IN (SELECT id FROM public._bak_bds_bills_20260729)
           AND x.id NOT IN (SELECT id FROM public._bak_bds_bills_20260729))
    + (SELECT COUNT(*) FROM public.billing_refund_request_bills x WHERE x.bill_id IN (SELECT id FROM public._bak_bds_bills_20260729))
    + (SELECT COUNT(*) FROM public.student_credit_balances x WHERE x.consumed_against_bill_id IN (SELECT id FROM public._bak_bds_bills_20260729))
    + (SELECT COUNT(*) FROM public.billing_bill_apportionments x WHERE x.bill_id IN (SELECT id FROM public._bak_bds_bills_20260729))
    + (SELECT COUNT(*) FROM public.mess_student_billing x WHERE x.linked_bill_id IN (SELECT id FROM public._bak_bds_bills_20260729))
    + (SELECT COUNT(*) FROM public.hostel_waitlist x WHERE x.upgrade_bill_id IN (SELECT id FROM public._bak_bds_bills_20260729))
    + (SELECT COUNT(*) FROM public.billing_invoices x WHERE x.student_id IN (SELECT learner_id FROM public._bak_bds_purge_scope_20260729))
    + (SELECT COUNT(*) FROM public.billing_refunds x WHERE x.receipt_id IN (SELECT id FROM public._bak_bds_receipts_20260729))
    INTO v_blockers;

  IF v_blockers <> 0 THEN
    RAISE EXCEPTION 'Aborting: % blocking reference(s) found. Expected 0 — re-run discovery.', v_blockers;
  END IF;

  RAISE NOTICE 'Guards passed: % learners, % bills, % receipts, % receipt items.',
    v_learners, v_bills, v_receipts, v_items;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Delete, in trigger-safe order.
-- ---------------------------------------------------------------------------

-- 4a. Receipt items FIRST, while their bills still exist (see header note).
DELETE FROM public.billing_receipt_items ri
USING public._bak_bds_receipt_items_20260729 s
WHERE ri.id = s.id;

-- 4b. Receipts. Cascades billing_invoice_items and billing_refunds (both 0).
DELETE FROM public.billing_receipts r
USING public._bak_bds_receipts_20260729 s
WHERE r.id = s.id;

-- 4c. Bills. Cascades tms_fee_bill (16), payment_transaction_items (2),
--     billing_discounts (0).
DELETE FROM public.billing_student_bills b
USING public._bak_bds_bills_20260729 s
WHERE b.id = s.id;

-- 4d. Application-side logs and the now-stale per-learner summaries.
DELETE FROM public.user_activity_logs ual
USING public._bak_bds_activity_logs_20260729 s
WHERE ual.id = s.id;

DELETE FROM public.mv_student_billing_summary m
USING public._bak_bds_summaries_20260729 s
WHERE m.student_id = s.student_id;

-- ---------------------------------------------------------------------------
-- 5. Verify before committing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bills int; v_receipts int; v_items int; v_tms int; v_pay int;
  v_logs int; v_sum int; v_learners int; v_orphans int;
BEGIN
  SELECT COUNT(*) INTO v_bills    FROM public.billing_student_bills b
    JOIN public._bak_bds_bills_20260729 s ON s.id = b.id;
  SELECT COUNT(*) INTO v_receipts FROM public.billing_receipts r
    JOIN public._bak_bds_receipts_20260729 s ON s.id = r.id;
  SELECT COUNT(*) INTO v_items    FROM public.billing_receipt_items ri
    JOIN public._bak_bds_receipt_items_20260729 s ON s.id = ri.id;
  SELECT COUNT(*) INTO v_tms      FROM public.tms_fee_bill t
    JOIN public._bak_bds_tms_fee_bill_20260729 s ON s.id = t.id;
  SELECT COUNT(*) INTO v_pay      FROM public.payment_transaction_items pi
    JOIN public._bak_bds_payment_items_20260729 s ON s.id = pi.id;
  SELECT COUNT(*) INTO v_logs     FROM public.user_activity_logs ual
    JOIN public._bak_bds_activity_logs_20260729 s ON s.id = ual.id;
  SELECT COUNT(*) INTO v_sum      FROM public.mv_student_billing_summary m
    JOIN public._bak_bds_summaries_20260729 s ON s.student_id = m.student_id;

  IF v_bills    <> 0 THEN RAISE EXCEPTION 'Incomplete: % bills remain.', v_bills;             END IF;
  IF v_receipts <> 0 THEN RAISE EXCEPTION 'Incomplete: % receipts remain.', v_receipts;       END IF;
  IF v_items    <> 0 THEN RAISE EXCEPTION 'Incomplete: % receipt items remain.', v_items;     END IF;
  IF v_tms      <> 0 THEN RAISE EXCEPTION 'Incomplete: % tms_fee_bill rows remain.', v_tms;   END IF;
  IF v_pay      <> 0 THEN RAISE EXCEPTION 'Incomplete: % payment items remain.', v_pay;       END IF;
  IF v_logs     <> 0 THEN RAISE EXCEPTION 'Incomplete: % activity logs remain.', v_logs;      END IF;
  IF v_sum      <> 0 THEN RAISE EXCEPTION 'Incomplete: % summary rows remain.', v_sum;        END IF;

  -- The learners themselves MUST all survive — this purge is billing-only.
  SELECT COUNT(*) INTO v_learners
  FROM public.learners_profiles lp
  JOIN public._bak_bds_purge_scope_20260729 s ON s.learner_id = lp.id;

  IF v_learners <> 444 THEN
    RAISE EXCEPTION 'CRITICAL: only % of 444 learner profiles survive. Learner rows must never be deleted by this migration.', v_learners;
  END IF;

  -- No dangling FK pointers anywhere.
  SELECT
      (SELECT COUNT(*) FROM public.billing_receipt_items x
         WHERE NOT EXISTS (SELECT 1 FROM public.billing_student_bills b WHERE b.id = x.bill_id))
    + (SELECT COUNT(*) FROM public.billing_receipt_items x
         WHERE NOT EXISTS (SELECT 1 FROM public.billing_receipts r WHERE r.id = x.receipt_id))
    + (SELECT COUNT(*) FROM public.hostel_waitlist x WHERE x.upgrade_bill_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.billing_student_bills b WHERE b.id = x.upgrade_bill_id))
    + (SELECT COUNT(*) FROM public.tms_fee_bill x WHERE x.billing_student_bill_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.billing_student_bills b WHERE b.id = x.billing_student_bill_id))
    INTO v_orphans;

  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'Orphaned reference(s) detected after purge: %.', v_orphans;
  END IF;

  RAISE NOTICE 'Purge complete: 938 bills, 393 receipts, 9 receipt items, 16 tms rows, 2 payment items, 12 logs, 249 summaries removed. All 444 learner profiles intact.';
END $$;
