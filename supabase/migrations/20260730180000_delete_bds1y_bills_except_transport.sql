-- Delete ALL bills EXCEPT Transport Fee for the 100 ACTIVE BDS "1 Year" learners at
-- JKKN Dental College (learner AY 2025-2026). Requested and confirmed 2026-07-30.
-- Purpose: the operator will recreate these bills; Transport billing must survive intact.
--
-- COHORT (frozen to ids in _bak_bds1y_cat_scope_20260730)
--   Institution : JKKN Dental College and Hospital  e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5
--   Degree/Dept : Undergraduate / Department of Dentistry (UG)
--   Programme   : BDS  aea1e367-65ad-442d-9b11-ab0277d93a83
--   Semester    : '1 Year'  f6c09a29-c0fe-4b27-9045-0e15de3cd640  (Dental's own row —
--                 Dental has SIX semesters named '1 Year', one per programme)
--   Acad. year  : learners_profiles.academic_year_id = 7847e67c-ed20-45f4-bab3-df1907c10809
--   Lifecycle   : 'active'  → 100 learners
--   Reproduces /billing/coverage exactly: 100 in scope / 88 generated / 12 not generated.
--
-- REMOVED — 355 bills, Rs 15,00,35,000
--     87  1 Year Tuition Fee   Rs 3,76,80,000   (3 paid / 84 unpaid)
--     87  2 Year Tuition Fee   Rs 3,76,80,000   (6 paid / 2 partial / 79 unpaid)
--     86  3 Year Tuition Fee   Rs 3,72,55,000   (all unpaid)
--     86  4 Year Tuition Fee   Rs 3,72,55,000   (all unpaid)
--      9  Hostel Upgrade Fee   Rs   1,65,000    (all unpaid)
--   plus 15 billing_receipts (Rs 41,45,000), 15 billing_receipt_items,
--        1 payment_transaction_items (CASCADE), 27 user_activity_logs.
--   Verified zero and therefore untouched: billing_invoices, billing_invoice_items,
--   billing_discounts, billing_refunds, billing_bill_apportionments,
--   billing_refund_request_bills, student_credit_balances, hostel_waitlist links,
--   mess_student_billing links, external superseded_by_bill_id references.
--
-- DELIBERATELY KEPT
--     10  Transport Fee bills  Rs 27,500  (5 learners, 6 paid / 4 unpaid)
--      6  billing_receipt_items on those bills
--     10  tms_fee_bill         — ALL ten transport-billing links sit on Transport Fee
--                                bills, so NOTHING cascades there. Verified: 0 tms rows
--                                reference any bill in the delete set.
--      3  billing_receipts      Rs 16,500 (allocated only to Transport bills)
--    100  learners_profiles     never touched
--   After this migration 5 learners keep Transport billing; 95 hold no bills.
--
-- ACCEPTED RISK — not reversible outside the snapshots below.
--   The 15 deleted receipts hold Rs 41,45,000 of real, recent, correctly-allocated
--   collection (14–27 Jul 2026, cash + online, every one tied to a bill). That figure
--   reconciles exactly against the money received on the 11 paid/partially-paid bills
--   in the delete set (Rs 12,75,000 + Rs 24,75,000 + Rs 3,95,000). There is no bill- or
--   receipt-level audit table in this database, so deleting them destroys the only
--   record that this money was collected. The operator was shown the figure, was offered
--   a receipts-preserving option (delete bills only, leaving the receipts unallocated and
--   re-linkable), and chose full removal.
--
-- THE 18 RECEIPTS SPLIT CLEANLY — 0 span both sides. Verified before writing this:
--   every receipt is allocated either only to deleted bills (15) or only to kept
--   Transport bills (3). No receipt is partially stripped, so no surviving receipt ends
--   up with a torn allocation.
--
-- TRIGGERS ARE LEFT ENABLED — deliberately, and unlike the full purge of the same day.
--   Because Transport bills SURVIVE for 5 learners, trigger_refresh_student_billing_summary
--   firing per deleted row is exactly what we want: it recomputes each learner's
--   mv_student_billing_summary from what REMAINS. This migration therefore does NOT delete
--   the 100 summary rows (the earlier full purge did, correctly, because nothing remained).
--   Cost: ~370 refresh invocations (4 aggregate scans + upsert each) plus 355 webhook_logs
--   rows from prevent_mass_delete — a SECURITY DEFINER logger that, despite its name,
--   blocks nothing. Hence the raised statement_timeout.
--
-- ORDER IS SET BY TRIGGERS, NOT FKs. billing_receipt_items carries
-- trigger_update_bill_status_on_delete, which UPDATEs the parent bill per deleted row.
-- Those items go FIRST, while their bills still exist, so the trigger is a clean no-op
-- instead of racing the bill delete.
--
-- TO RESTORE (reverse order) — and note a plain INSERT WILL NOT WORK:
--   ALTER TABLE public.billing_student_bills DISABLE TRIGGER USER;  -- and the others
--   INSERT INTO billing_student_bills     SELECT * FROM _bak_bds1y_cat_bills_20260730;
--   INSERT INTO billing_receipts          SELECT * FROM _bak_bds1y_cat_receipts_20260730;
--   INSERT INTO billing_receipt_items     SELECT * FROM _bak_bds1y_cat_receipt_items_20260730;
--   INSERT INTO payment_transaction_items SELECT * FROM _bak_bds1y_cat_payment_items_20260730;
--   INSERT INTO user_activity_logs        SELECT * FROM _bak_bds1y_cat_activity_logs_20260730;
--   ALTER TABLE ... ENABLE TRIGGER USER;
--   Restoring with triggers ON fails: trg_prevent_bill_overpayment rejects the 9 paid
--   bills' receipt items as a second payment, and trg_billing_bill_default_academic_year
--   overwrites academic_year_id. (Proven on this data earlier today.)

SET statement_timeout = '900s';

-- ---------------------------------------------------------------------------
-- 1. Freeze the cohort ONCE, so it cannot drift between statements.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_bds1y_cat_scope_20260730 AS
SELECT lp.id AS learner_id, lp.roll_number, lp.lifecycle_status,
       lp.institution_id, lp.program_id, lp.department_id,
       lp.semester_id, lp.academic_year_id
FROM public.learners_profiles lp
JOIN public.departments dep ON dep.id = lp.department_id
WHERE lp.institution_id   = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'
  AND lp.program_id       = 'aea1e367-65ad-442d-9b11-ab0277d93a83'
  AND lp.semester_id      = 'f6c09a29-c0fe-4b27-9045-0e15de3cd640'
  AND lp.academic_year_id = '7847e67c-ed20-45f4-bab3-df1907c10809'
  AND dep.department_name  = 'Department of Dentistry (UG)'
  AND lp.lifecycle_status  = 'active';

-- ---------------------------------------------------------------------------
-- 2. Snapshot. Bills to delete, bills to keep, and both sides of the receipts.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_bds1y_cat_bills_20260730 AS
SELECT b.* FROM public.billing_student_bills b
JOIN public._bak_bds1y_cat_scope_20260730 s ON s.learner_id = b.student_id
LEFT JOIN public.billing_categories bc ON bc.id = b.item_category_id
WHERE COALESCE(bc.category_name, '(none)') <> 'Transport Fee';

CREATE TABLE public._bak_bds1y_cat_kept_bills_20260730 AS
SELECT b.* FROM public.billing_student_bills b
JOIN public._bak_bds1y_cat_scope_20260730 s ON s.learner_id = b.student_id
JOIN public.billing_categories bc ON bc.id = b.item_category_id
WHERE bc.category_name = 'Transport Fee';

-- Receipts to delete: those with NO allocation to a surviving Transport bill.
CREATE TABLE public._bak_bds1y_cat_receipts_20260730 AS
SELECT r.* FROM public.billing_receipts r
JOIN public._bak_bds1y_cat_scope_20260730 s ON s.learner_id = r.student_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_receipt_items ri
   WHERE ri.receipt_id = r.id
     AND ri.bill_id IN (SELECT id FROM public._bak_bds1y_cat_kept_bills_20260730));

CREATE TABLE public._bak_bds1y_cat_kept_receipts_20260730 AS
SELECT r.* FROM public.billing_receipts r
JOIN public._bak_bds1y_cat_scope_20260730 s ON s.learner_id = r.student_id
WHERE EXISTS (
  SELECT 1 FROM public.billing_receipt_items ri
   WHERE ri.receipt_id = r.id
     AND ri.bill_id IN (SELECT id FROM public._bak_bds1y_cat_kept_bills_20260730));

CREATE TABLE public._bak_bds1y_cat_receipt_items_20260730 AS
SELECT ri.* FROM public.billing_receipt_items ri
WHERE ri.bill_id    IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730)
   OR ri.receipt_id IN (SELECT id FROM public._bak_bds1y_cat_receipts_20260730);

CREATE TABLE public._bak_bds1y_cat_payment_items_20260730 AS
SELECT pi.* FROM public.payment_transaction_items pi
WHERE pi.bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730);

CREATE TABLE public._bak_bds1y_cat_activity_logs_20260730 AS
SELECT ual.* FROM public.user_activity_logs ual
WHERE ual.resource_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730)
   OR ual.resource_id IN (SELECT id FROM public._bak_bds1y_cat_receipts_20260730);

-- Summary rows as they stand BEFORE the delete. Not deleted by this migration —
-- kept so the pre-delete figures can be compared after the triggers recompute.
CREATE TABLE public._bak_bds1y_cat_summaries_20260730 AS
SELECT m.* FROM public.mv_student_billing_summary m
JOIN public._bak_bds1y_cat_scope_20260730 s ON s.learner_id = m.student_id;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_bak_bds1y_cat_scope_20260730',        '_bak_bds1y_cat_bills_20260730',
    '_bak_bds1y_cat_kept_bills_20260730',   '_bak_bds1y_cat_receipts_20260730',
    '_bak_bds1y_cat_kept_receipts_20260730','_bak_bds1y_cat_receipt_items_20260730',
    '_bak_bds1y_cat_payment_items_20260730','_bak_bds1y_cat_activity_logs_20260730',
    '_bak_bds1y_cat_summaries_20260730'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

COMMENT ON TABLE public._bak_bds1y_cat_scope_20260730 IS
  'The 100 ACTIVE BDS "1 Year" learners (Dental, learner AY 2025-2026) whose non-Transport bills were deleted on 2026-07-30 for recreation. Transport Fee billing and all learner rows were preserved.';

-- ---------------------------------------------------------------------------
-- 3. Guards. Any deviation aborts the whole migration, DDL included.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_learners int; v_del int; v_keep int; v_rcp int; v_keep_rcp int;
  v_items int; v_pay int; v_logs int; v_sum int;
  v_amt numeric; v_rcp_amt numeric; v_keep_amt numeric;
  v_inst int; v_prog int; v_sem int; v_ay int;
  v_transport_in_del int; v_tms_in_del int; v_blockers int; v_span int;
  v_c1 int; v_c2 int; v_c3 int; v_c4 int; v_ch int;
BEGIN
  SELECT COUNT(*) INTO v_learners FROM public._bak_bds1y_cat_scope_20260730;
  SELECT COUNT(*), COALESCE(SUM(final_amount),0) INTO v_del, v_amt
    FROM public._bak_bds1y_cat_bills_20260730;
  SELECT COUNT(*), COALESCE(SUM(final_amount),0) INTO v_keep, v_keep_amt
    FROM public._bak_bds1y_cat_kept_bills_20260730;
  SELECT COUNT(*), COALESCE(SUM(payment_amount),0) INTO v_rcp, v_rcp_amt
    FROM public._bak_bds1y_cat_receipts_20260730;
  SELECT COUNT(*) INTO v_keep_rcp FROM public._bak_bds1y_cat_kept_receipts_20260730;
  SELECT COUNT(*) INTO v_items    FROM public._bak_bds1y_cat_receipt_items_20260730;
  SELECT COUNT(*) INTO v_pay      FROM public._bak_bds1y_cat_payment_items_20260730;
  SELECT COUNT(*) INTO v_logs     FROM public._bak_bds1y_cat_activity_logs_20260730;
  SELECT COUNT(*) INTO v_sum      FROM public._bak_bds1y_cat_summaries_20260730;

  IF v_learners <> 100 THEN RAISE EXCEPTION 'Aborting: expected 100 learners, got %.', v_learners; END IF;
  IF v_del      <> 355 THEN RAISE EXCEPTION 'Aborting: expected 355 bills to delete, got %.', v_del; END IF;
  IF v_keep     <> 10  THEN RAISE EXCEPTION 'Aborting: expected 10 Transport bills to keep, got %.', v_keep; END IF;
  IF v_rcp      <> 15  THEN RAISE EXCEPTION 'Aborting: expected 15 receipts to delete, got %.', v_rcp; END IF;
  IF v_keep_rcp <> 3   THEN RAISE EXCEPTION 'Aborting: expected 3 receipts to keep, got %.', v_keep_rcp; END IF;
  IF v_items    <> 15  THEN RAISE EXCEPTION 'Aborting: expected 15 receipt items, got %.', v_items; END IF;
  IF v_pay      <> 1   THEN RAISE EXCEPTION 'Aborting: expected 1 payment item, got %.', v_pay; END IF;
  IF v_logs     <> 27  THEN RAISE EXCEPTION 'Aborting: expected 27 activity logs, got %.', v_logs; END IF;
  IF v_sum      <> 100 THEN RAISE EXCEPTION 'Aborting: expected 100 summary rows, got %.', v_sum; END IF;

  IF v_amt      <> 150035000 THEN RAISE EXCEPTION 'Aborting: delete total is %, expected 150035000.', v_amt; END IF;
  IF v_rcp_amt  <>   4145000 THEN RAISE EXCEPTION 'Aborting: receipt total is %, expected 4145000.', v_rcp_amt; END IF;
  IF v_keep_amt <>     27500 THEN RAISE EXCEPTION 'Aborting: kept-bill total is %, expected 27500.', v_keep_amt; END IF;

  -- Per-category counts must match what the operator approved.
  SELECT
    COUNT(*) FILTER (WHERE bc.category_name='1 Year Tuition Fee'),
    COUNT(*) FILTER (WHERE bc.category_name='2 Year Tuition Fee'),
    COUNT(*) FILTER (WHERE bc.category_name='3 Year Tuition Fee'),
    COUNT(*) FILTER (WHERE bc.category_name='4 Year Tuition Fee'),
    COUNT(*) FILTER (WHERE bc.category_name='Hostel Upgrade Fee')
    INTO v_c1, v_c2, v_c3, v_c4, v_ch
  FROM public._bak_bds1y_cat_bills_20260730 b
  LEFT JOIN public.billing_categories bc ON bc.id = b.item_category_id;

  IF v_c1 <> 87 OR v_c2 <> 87 OR v_c3 <> 86 OR v_c4 <> 86 OR v_ch <> 9 THEN
    RAISE EXCEPTION 'Aborting: category split is %/%/%/%/%, expected 87/87/86/86/9.',
      v_c1, v_c2, v_c3, v_c4, v_ch;
  END IF;

  -- THE critical guard: not one Transport Fee bill may be in the delete set.
  SELECT COUNT(*) INTO v_transport_in_del
  FROM public._bak_bds1y_cat_bills_20260730 b
  JOIN public.billing_categories bc ON bc.id = b.item_category_id
  WHERE bc.category_name = 'Transport Fee';
  IF v_transport_in_del <> 0 THEN
    RAISE EXCEPTION 'Aborting: % Transport Fee bill(s) landed in the delete set.', v_transport_in_del;
  END IF;

  -- And no tms_fee_bill row may hang off a bill being deleted.
  SELECT COUNT(*) INTO v_tms_in_del
  FROM public.tms_fee_bill t
  WHERE t.billing_student_bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730);
  IF v_tms_in_del <> 0 THEN
    RAISE EXCEPTION 'Aborting: % tms_fee_bill row(s) would CASCADE. Expected 0.', v_tms_in_del;
  END IF;

  -- No receipt may straddle both sides, or a survivor would lose part of its allocation.
  SELECT COUNT(*) INTO v_span
  FROM public.billing_receipt_items ri
  WHERE ri.bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730)
    AND ri.receipt_id IN (SELECT id FROM public._bak_bds1y_cat_kept_receipts_20260730);
  IF v_span <> 0 THEN
    RAISE EXCEPTION 'Aborting: % receipt item(s) straddle kept and deleted bills.', v_span;
  END IF;

  -- Cohort must not have leaked outside one institution / programme / semester / year.
  SELECT COUNT(DISTINCT institution_id), COUNT(DISTINCT program_id),
         COUNT(DISTINCT semester_id), COUNT(DISTINCT academic_year_id)
    INTO v_inst, v_prog, v_sem, v_ay
  FROM public._bak_bds1y_cat_scope_20260730;
  IF v_inst <> 1 OR v_prog <> 1 OR v_sem <> 1 OR v_ay <> 1 THEN
    RAISE EXCEPTION 'Aborting: cohort spans % institutions / % programmes / % semesters / % years.',
      v_inst, v_prog, v_sem, v_ay;
  END IF;

  -- NO ACTION / RESTRICT paths must be clear or the DELETE aborts mid-way.
  SELECT
      (SELECT COUNT(*) FROM public.billing_student_bills x
         WHERE x.superseded_by_bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730)
           AND x.id NOT IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730))
    + (SELECT COUNT(*) FROM public.billing_refund_request_bills x WHERE x.bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730))
    + (SELECT COUNT(*) FROM public.student_credit_balances x     WHERE x.consumed_against_bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730))
    + (SELECT COUNT(*) FROM public.billing_bill_apportionments x WHERE x.bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730))
    + (SELECT COUNT(*) FROM public.mess_student_billing x        WHERE x.linked_bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730))
    + (SELECT COUNT(*) FROM public.hostel_waitlist x             WHERE x.upgrade_bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730))
    + (SELECT COUNT(*) FROM public.billing_invoices x            WHERE x.student_id IN (SELECT learner_id FROM public._bak_bds1y_cat_scope_20260730))
    + (SELECT COUNT(*) FROM public.billing_refunds x             WHERE x.receipt_id IN (SELECT id FROM public._bak_bds1y_cat_receipts_20260730))
    + (SELECT COUNT(*) FROM public.billing_discounts x           WHERE x.bill_id IN (SELECT id FROM public._bak_bds1y_cat_bills_20260730))
    INTO v_blockers;
  IF v_blockers <> 0 THEN
    RAISE EXCEPTION 'Aborting: % blocking reference(s) found. Expected 0 — re-run discovery.', v_blockers;
  END IF;

  RAISE NOTICE 'Guards passed: deleting % bills (Rs %), % receipts (Rs %), % items, % payment item(s), % logs. Keeping % Transport bills (Rs %) and % receipts.',
    v_del, v_amt, v_rcp, v_rcp_amt, v_items, v_pay, v_logs, v_keep, v_keep_amt, v_keep_rcp;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Delete, in trigger-safe order. Triggers stay ENABLED on purpose so the
--    per-learner summaries recompute from the surviving Transport bills.
-- ---------------------------------------------------------------------------

-- 4a. Receipt items FIRST, while their bills still exist (see header note).
DELETE FROM public.billing_receipt_items ri
USING public._bak_bds1y_cat_receipt_items_20260730 s
WHERE ri.id = s.id;

-- 4b. The 15 now-unallocated receipts. Would cascade billing_invoice_items and
--     billing_refunds (both verified 0).
DELETE FROM public.billing_receipts r
USING public._bak_bds1y_cat_receipts_20260730 s
WHERE r.id = s.id;

-- 4c. The 355 bills. Cascades payment_transaction_items (1) and
--     billing_discounts (0). tms_fee_bill is guarded at 0 above.
DELETE FROM public.billing_student_bills b
USING public._bak_bds1y_cat_bills_20260730 s
WHERE b.id = s.id;

-- 4d. Application-side logs for the removed bills and receipts.
DELETE FROM public.user_activity_logs ual
USING public._bak_bds1y_cat_activity_logs_20260730 s
WHERE ual.id = s.id;

-- ---------------------------------------------------------------------------
-- 5. Verify before committing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bills int; v_rcp int; v_items int; v_pay int; v_logs int;
  v_keep_bills int; v_keep_items int; v_tms int; v_keep_rcp int;
  v_learners int; v_orphans int; v_zero int; v_with int;
BEGIN
  SELECT COUNT(*) INTO v_bills FROM public.billing_student_bills b
    JOIN public._bak_bds1y_cat_bills_20260730 s ON s.id = b.id;
  SELECT COUNT(*) INTO v_rcp   FROM public.billing_receipts r
    JOIN public._bak_bds1y_cat_receipts_20260730 s ON s.id = r.id;
  SELECT COUNT(*) INTO v_items FROM public.billing_receipt_items ri
    JOIN public._bak_bds1y_cat_receipt_items_20260730 s ON s.id = ri.id;
  SELECT COUNT(*) INTO v_pay   FROM public.payment_transaction_items pi
    JOIN public._bak_bds1y_cat_payment_items_20260730 s ON s.id = pi.id;
  SELECT COUNT(*) INTO v_logs  FROM public.user_activity_logs ual
    JOIN public._bak_bds1y_cat_activity_logs_20260730 s ON s.id = ual.id;

  IF v_bills <> 0 THEN RAISE EXCEPTION 'Incomplete: % bills remain.', v_bills;         END IF;
  IF v_rcp   <> 0 THEN RAISE EXCEPTION 'Incomplete: % receipts remain.', v_rcp;        END IF;
  IF v_items <> 0 THEN RAISE EXCEPTION 'Incomplete: % receipt items remain.', v_items; END IF;
  IF v_pay   <> 0 THEN RAISE EXCEPTION 'Incomplete: % payment items remain.', v_pay;   END IF;
  IF v_logs  <> 0 THEN RAISE EXCEPTION 'Incomplete: % activity logs remain.', v_logs;  END IF;

  -- Everything Transport MUST have survived — this is the point of the migration.
  SELECT COUNT(*) INTO v_keep_bills FROM public.billing_student_bills b
    JOIN public._bak_bds1y_cat_kept_bills_20260730 s ON s.id = b.id;
  IF v_keep_bills <> 10 THEN
    RAISE EXCEPTION 'CRITICAL: only % of 10 Transport Fee bills survive.', v_keep_bills;
  END IF;

  SELECT COUNT(*) INTO v_keep_items FROM public.billing_receipt_items ri
   WHERE ri.bill_id IN (SELECT id FROM public._bak_bds1y_cat_kept_bills_20260730);
  IF v_keep_items <> 6 THEN
    RAISE EXCEPTION 'CRITICAL: Transport receipt items are % , expected 6.', v_keep_items;
  END IF;

  SELECT COUNT(*) INTO v_tms FROM public.tms_fee_bill t
   WHERE t.billing_student_bill_id IN (SELECT id FROM public._bak_bds1y_cat_kept_bills_20260730);
  IF v_tms <> 10 THEN
    RAISE EXCEPTION 'CRITICAL: tms_fee_bill rows are %, expected 10.', v_tms;
  END IF;

  SELECT COUNT(*) INTO v_keep_rcp FROM public.billing_receipts r
    JOIN public._bak_bds1y_cat_kept_receipts_20260730 s ON s.id = r.id;
  IF v_keep_rcp <> 3 THEN
    RAISE EXCEPTION 'CRITICAL: only % of 3 Transport receipts survive.', v_keep_rcp;
  END IF;

  -- Learner rows must all survive — this is billing-only.
  SELECT COUNT(*) INTO v_learners FROM public.learners_profiles lp
    JOIN public._bak_bds1y_cat_scope_20260730 s ON s.learner_id = lp.id;
  IF v_learners <> 100 THEN
    RAISE EXCEPTION 'CRITICAL: only % of 100 learner profiles survive.', v_learners;
  END IF;

  -- Expected end state: 5 learners with Transport bills, 95 with none.
  SELECT COUNT(DISTINCT b.student_id) INTO v_with
    FROM public.billing_student_bills b
    JOIN public._bak_bds1y_cat_scope_20260730 s ON s.learner_id = b.student_id;
  SELECT COUNT(*) INTO v_zero FROM public._bak_bds1y_cat_scope_20260730 s
   WHERE NOT EXISTS (SELECT 1 FROM public.billing_student_bills b WHERE b.student_id = s.learner_id);
  IF v_with <> 5 OR v_zero <> 95 THEN
    RAISE EXCEPTION 'Unexpected end state: % learners with bills, % without; expected 5 / 95.', v_with, v_zero;
  END IF;

  -- No dangling FK pointers anywhere.
  SELECT
      (SELECT COUNT(*) FROM public.billing_receipt_items x
         WHERE NOT EXISTS (SELECT 1 FROM public.billing_student_bills b WHERE b.id = x.bill_id))
    + (SELECT COUNT(*) FROM public.billing_receipt_items x
         WHERE NOT EXISTS (SELECT 1 FROM public.billing_receipts r WHERE r.id = x.receipt_id))
    + (SELECT COUNT(*) FROM public.tms_fee_bill x WHERE x.billing_student_bill_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.billing_student_bills b WHERE b.id = x.billing_student_bill_id))
    + (SELECT COUNT(*) FROM public.hostel_waitlist x WHERE x.upgrade_bill_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.billing_student_bills b WHERE b.id = x.upgrade_bill_id))
    INTO v_orphans;
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'Orphaned reference(s) detected after delete: %.', v_orphans;
  END IF;

  RAISE NOTICE 'Delete complete: 355 bills (Rs 15,00,35,000), 15 receipts (Rs 41,45,000), 15 receipt items, 1 payment item, 27 logs removed. Kept 10 Transport bills, 6 items, 10 tms rows, 3 receipts. All 100 learner profiles intact.';
END $$;
