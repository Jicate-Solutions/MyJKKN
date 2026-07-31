-- Purge ALL billing data for ACTIVE BDS "1 Year" learners at JKKN Dental College
-- whose learner academic year is 2025-2026. Requested and confirmed 2026-07-30.
-- Purpose: the operator will recreate this cohort's bills from scratch.
--
-- SCOPE (frozen to ids in _bak_bds1y_scope_20260730)
--   Institution     : JKKN Dental College and Hospital  e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5
--   Degree / Dept   : Undergraduate / Department of Dentistry (UG)
--   Programme       : BDS only  aea1e367-65ad-442d-9b11-ab0277d93a83  (all 9 MDS excluded)
--   Semester        : '1 Year'  f6c09a29-c0fe-4b27-9045-0e15de3cd640
--   Academic year   : learners_profiles.academic_year_id = 2025-2026
--                     7847e67c-ed20-45f4-bab3-df1907c10809
--   Lifecycle       : 'active' only
--   Total           : 99 learners.
--
--   The semester id is pinned DELIBERATELY. Dental has SIX semesters rows all named
--   '1 Year'; only this one carries BDS learners. Matching on semester_name would
--   silently widen the scope. Likewise there are four academic years whose name
--   begins '2025-2026' (one canonical + three 'Additional N'); only the canonical
--   one is in scope. 52 more BDS '1 Year' learners sit in AY 2026-2027 and 2 in
--   '2025-2026 Additional 3' — all deliberately OUT of scope.
--
--   One INACTIVE BDS '1 Year' / 2025-2026 learner exists and is excluded; it holds
--   no billing rows, so the exclusion changes no count.
--
-- WHAT IS REMOVED
--     361  billing_student_bills        Rs 14,76,62,500  (15 paid / 2 partial / 344 unpaid)
--      18  billing_receipts             Rs    41,61,500
--      21  billing_receipt_items        (CASCADE from bills; deleted first — see ORDER)
--      10  tms_fee_bill                 (CASCADE from bills)
--       1  payment_transaction_items    (CASCADE from bills — unavoidable)
--      30  user_activity_logs
--      99  mv_student_billing_summary
--   Verified ZERO and therefore not touched: billing_invoices, billing_invoice_items,
--   billing_discounts, billing_refunds, billing_bill_apportionments,
--   billing_refund_request_bills, student_credit_balances, hostel_waitlist links,
--   mess_student_billing links, and external superseded_by_bill_id references.
--
-- ACCEPTED RISK — recorded explicitly because it is not reversible outside the
-- snapshots this migration creates.
--   All 18 receipts (Rs 41,61,500) are REAL, RECENT and CORRECTLY ALLOCATED:
--   dated 2026-07-09 .. 2026-07-27, every one has a non-null created_by, payment
--   modes cash + online, and every one resolves to a bill through
--   billing_receipt_items. They are NOT the legacy unallocated-import pattern seen
--   in the 2026-07-29 purge. They represent 17 bills held by 12 learners.
--   There is no bill- or receipt-level audit table in this database, so deleting
--   them destroys the only record that this money was collected.
--   The operator was shown these figures, was offered a payment-preserving option
--   (delete only the 344 unpaid bills, which carry zero receipt allocations), and
--   chose the full purge so the cohort can be recreated uniformly.
--
-- DELIBERATELY KEPT: the 1 payment_transactions gateway row and the webhook_logs
-- SAFETY_ALERT rows this delete generates, as the Razorpay reconciliation trail.
-- Note its bill_ids[] array will hold a dangling uuid — payment_transaction_items
-- is ON DELETE CASCADE and cannot be preserved.
--
-- NOT TOUCHED: the 99 learners_profiles rows themselves, BDS years 2/3/4 + CRRI,
-- every MDS programme, every other institution, every non-billing module.
--
-- ORDER IS SET BY TRIGGERS, NOT FKs. billing_receipt_items carries
-- trigger_update_bill_status_on_delete, which UPDATEs the parent bill per deleted
-- row. Those items are therefore deleted FIRST, while their bills still exist, so
-- the trigger is a clean no-op instead of racing the bill delete.
--
-- PERFORMANCE: two AFTER DELETE triggers fire per row —
-- trigger_refresh_student_billing_summary (4 aggregate scans + an upsert) runs ~379
-- times, and prevent_mass_delete (a logger despite the name; it blocks nothing)
-- writes 361 webhook_logs rows. Hence the raised statement_timeout below.
--
-- TO RESTORE (reverse order):
--   INSERT INTO billing_student_bills      SELECT * FROM _bak_bds1y_bills_20260730;
--   INSERT INTO billing_receipts           SELECT * FROM _bak_bds1y_receipts_20260730;
--   INSERT INTO billing_receipt_items      SELECT * FROM _bak_bds1y_receipt_items_20260730;
--   INSERT INTO tms_fee_bill               SELECT * FROM _bak_bds1y_tms_fee_bill_20260730;
--   INSERT INTO payment_transaction_items  SELECT * FROM _bak_bds1y_payment_items_20260730;
--   INSERT INTO user_activity_logs         SELECT * FROM _bak_bds1y_activity_logs_20260730;
--   INSERT INTO mv_student_billing_summary SELECT * FROM _bak_bds1y_summaries_20260730;

SET statement_timeout = '900s';

-- ---------------------------------------------------------------------------
-- 1. Freeze the scope ONCE. Every later step and the rollback read from this
--    table, so the 99 learners cannot drift between statements.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_bds1y_scope_20260730 AS
SELECT lp.id AS learner_id, lp.roll_number, lp.lifecycle_status,
       lp.institution_id, lp.program_id, lp.department_id,
       lp.semester_id, lp.academic_year_id
FROM public.learners_profiles lp
WHERE lp.institution_id  = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'
  AND lp.program_id      = 'aea1e367-65ad-442d-9b11-ab0277d93a83'
  AND lp.semester_id     = 'f6c09a29-c0fe-4b27-9045-0e15de3cd640'
  AND lp.academic_year_id= '7847e67c-ed20-45f4-bab3-df1907c10809'
  AND lp.lifecycle_status= 'active';

-- ---------------------------------------------------------------------------
-- 2. Snapshot every table this migration touches.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_bds1y_bills_20260730 AS
SELECT b.* FROM public.billing_student_bills b
WHERE b.student_id IN (SELECT learner_id FROM public._bak_bds1y_scope_20260730);

CREATE TABLE public._bak_bds1y_receipts_20260730 AS
SELECT r.* FROM public.billing_receipts r
WHERE r.student_id IN (SELECT learner_id FROM public._bak_bds1y_scope_20260730);

CREATE TABLE public._bak_bds1y_receipt_items_20260730 AS
SELECT ri.* FROM public.billing_receipt_items ri
WHERE ri.bill_id    IN (SELECT id FROM public._bak_bds1y_bills_20260730)
   OR ri.receipt_id IN (SELECT id FROM public._bak_bds1y_receipts_20260730);

CREATE TABLE public._bak_bds1y_tms_fee_bill_20260730 AS
SELECT t.* FROM public.tms_fee_bill t
WHERE t.billing_student_bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730);

CREATE TABLE public._bak_bds1y_payment_items_20260730 AS
SELECT pi.* FROM public.payment_transaction_items pi
WHERE pi.bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730);

CREATE TABLE public._bak_bds1y_activity_logs_20260730 AS
SELECT ual.* FROM public.user_activity_logs ual
WHERE ual.resource_id IN (SELECT id FROM public._bak_bds1y_bills_20260730)
   OR ual.resource_id IN (SELECT id FROM public._bak_bds1y_receipts_20260730);

CREATE TABLE public._bak_bds1y_summaries_20260730 AS
SELECT m.* FROM public.mv_student_billing_summary m
WHERE m.student_id IN (SELECT learner_id FROM public._bak_bds1y_scope_20260730);

-- Lock every snapshot down: RLS on, no policies, no API-role grants.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_bak_bds1y_scope_20260730',       '_bak_bds1y_bills_20260730',
    '_bak_bds1y_receipts_20260730',    '_bak_bds1y_receipt_items_20260730',
    '_bak_bds1y_tms_fee_bill_20260730','_bak_bds1y_payment_items_20260730',
    '_bak_bds1y_activity_logs_20260730','_bak_bds1y_summaries_20260730'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

COMMENT ON TABLE public._bak_bds1y_scope_20260730 IS
  'The 99 ACTIVE BDS "1 Year" learners (Dental, learner AY 2025-2026) whose billing data was purged on 2026-07-30 so it could be recreated. Learner rows themselves were NOT deleted.';

-- ---------------------------------------------------------------------------
-- 3. Guards. Any deviation aborts the whole migration, DDL included.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_learners int; v_bills int; v_receipts int; v_items int;
  v_tms int; v_pay int; v_logs int; v_sum int;
  v_inst int; v_prog int; v_dept int; v_sem int; v_ay int;
  v_inactive int; v_blockers int; v_leak int;
  v_bill_amt numeric; v_rcp_amt numeric;
BEGIN
  SELECT COUNT(*) INTO v_learners FROM public._bak_bds1y_scope_20260730;
  SELECT COUNT(*), COALESCE(SUM(final_amount),0) INTO v_bills, v_bill_amt
    FROM public._bak_bds1y_bills_20260730;
  SELECT COUNT(*), COALESCE(SUM(payment_amount),0) INTO v_receipts, v_rcp_amt
    FROM public._bak_bds1y_receipts_20260730;
  SELECT COUNT(*) INTO v_items FROM public._bak_bds1y_receipt_items_20260730;
  SELECT COUNT(*) INTO v_tms   FROM public._bak_bds1y_tms_fee_bill_20260730;
  SELECT COUNT(*) INTO v_pay   FROM public._bak_bds1y_payment_items_20260730;
  SELECT COUNT(*) INTO v_logs  FROM public._bak_bds1y_activity_logs_20260730;
  SELECT COUNT(*) INTO v_sum   FROM public._bak_bds1y_summaries_20260730;

  IF v_learners <> 99  THEN RAISE EXCEPTION 'Aborting: expected 99 learners in scope, got %.', v_learners; END IF;
  IF v_bills    <> 361 THEN RAISE EXCEPTION 'Aborting: expected 361 bills, got %.', v_bills;               END IF;
  IF v_receipts <> 18  THEN RAISE EXCEPTION 'Aborting: expected 18 receipts, got %.', v_receipts;          END IF;
  IF v_items    <> 21  THEN RAISE EXCEPTION 'Aborting: expected 21 receipt items, got %.', v_items;        END IF;
  IF v_tms      <> 10  THEN RAISE EXCEPTION 'Aborting: expected 10 tms_fee_bill rows, got %.', v_tms;      END IF;
  IF v_pay      <> 1   THEN RAISE EXCEPTION 'Aborting: expected 1 payment item, got %.', v_pay;            END IF;
  IF v_logs     <> 30  THEN RAISE EXCEPTION 'Aborting: expected 30 activity logs, got %.', v_logs;         END IF;
  IF v_sum      <> 99  THEN RAISE EXCEPTION 'Aborting: expected 99 summary rows, got %.', v_sum;           END IF;

  -- Money must match what the operator was shown and approved.
  IF v_bill_amt <> 147662500 THEN RAISE EXCEPTION 'Aborting: bill total is %, expected 147662500.', v_bill_amt; END IF;
  IF v_rcp_amt  <>   4161500 THEN RAISE EXCEPTION 'Aborting: receipt total is %, expected 4161500.', v_rcp_amt; END IF;

  -- Scope must not have leaked outside one institution / programme / dept /
  -- semester / academic year.
  SELECT COUNT(DISTINCT institution_id), COUNT(DISTINCT program_id),
         COUNT(DISTINCT department_id),  COUNT(DISTINCT semester_id),
         COUNT(DISTINCT academic_year_id)
    INTO v_inst, v_prog, v_dept, v_sem, v_ay
  FROM public._bak_bds1y_scope_20260730;

  IF v_inst <> 1 THEN RAISE EXCEPTION 'Aborting: scope spans % institutions, expected 1.', v_inst; END IF;
  IF v_prog <> 1 THEN RAISE EXCEPTION 'Aborting: scope spans % programmes, expected 1.', v_prog;   END IF;
  IF v_dept <> 1 THEN RAISE EXCEPTION 'Aborting: scope spans % departments, expected 1.', v_dept;  END IF;
  IF v_sem  <> 1 THEN RAISE EXCEPTION 'Aborting: scope spans % semesters, expected 1.', v_sem;     END IF;
  IF v_ay   <> 1 THEN RAISE EXCEPTION 'Aborting: scope spans % academic years, expected 1.', v_ay; END IF;

  -- No inactive learner may have slipped in.
  SELECT COUNT(*) INTO v_inactive FROM public._bak_bds1y_scope_20260730
   WHERE lifecycle_status <> 'active';
  IF v_inactive <> 0 THEN RAISE EXCEPTION 'Aborting: % non-active learner(s) in scope.', v_inactive; END IF;

  -- Nothing outside the scope may reference these bills through a
  -- NO ACTION / RESTRICT path, or the DELETE would abort mid-way.
  SELECT
      (SELECT COUNT(*) FROM public.billing_student_bills x
         WHERE x.superseded_by_bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730)
           AND x.id NOT IN (SELECT id FROM public._bak_bds1y_bills_20260730))
    + (SELECT COUNT(*) FROM public.billing_refund_request_bills x   WHERE x.bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730))
    + (SELECT COUNT(*) FROM public.student_credit_balances x         WHERE x.consumed_against_bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730))
    + (SELECT COUNT(*) FROM public.billing_bill_apportionments x     WHERE x.bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730))
    + (SELECT COUNT(*) FROM public.mess_student_billing x            WHERE x.linked_bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730))
    + (SELECT COUNT(*) FROM public.hostel_waitlist x                 WHERE x.upgrade_bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730))
    + (SELECT COUNT(*) FROM public.billing_invoices x                WHERE x.student_id IN (SELECT learner_id FROM public._bak_bds1y_scope_20260730))
    + (SELECT COUNT(*) FROM public.billing_refunds x                 WHERE x.receipt_id IN (SELECT id FROM public._bak_bds1y_receipts_20260730))
    + (SELECT COUNT(*) FROM public.billing_discounts x               WHERE x.bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730))
    INTO v_blockers;

  IF v_blockers <> 0 THEN
    RAISE EXCEPTION 'Aborting: % blocking reference(s) found. Expected 0 — re-run discovery.', v_blockers;
  END IF;

  -- The bill<->receipt subgraph must be CLOSED: no receipt outside the scope may
  -- hold an item against an in-scope bill, and no in-scope receipt may hold an
  -- item against a bill outside the scope. Either would strand a payment record.
  SELECT
      (SELECT COUNT(*) FROM public.billing_receipt_items ri
         WHERE ri.bill_id IN (SELECT id FROM public._bak_bds1y_bills_20260730)
           AND ri.receipt_id NOT IN (SELECT id FROM public._bak_bds1y_receipts_20260730))
    + (SELECT COUNT(*) FROM public.billing_receipt_items ri
         WHERE ri.receipt_id IN (SELECT id FROM public._bak_bds1y_receipts_20260730)
           AND ri.bill_id NOT IN (SELECT id FROM public._bak_bds1y_bills_20260730))
    INTO v_leak;

  IF v_leak <> 0 THEN
    RAISE EXCEPTION 'Aborting: bill/receipt subgraph is not closed (% crossing item(s)).', v_leak;
  END IF;

  RAISE NOTICE 'Guards passed: % learners, % bills (Rs %), % receipts (Rs %), % receipt items.',
    v_learners, v_bills, v_bill_amt, v_receipts, v_rcp_amt, v_items;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Delete, in trigger-safe order.
-- ---------------------------------------------------------------------------

-- 4a. Receipt items FIRST, while their bills still exist (see header note).
DELETE FROM public.billing_receipt_items ri
USING public._bak_bds1y_receipt_items_20260730 s
WHERE ri.id = s.id;

-- 4b. Receipts. Would cascade billing_invoice_items and billing_refunds (both 0).
DELETE FROM public.billing_receipts r
USING public._bak_bds1y_receipts_20260730 s
WHERE r.id = s.id;

-- 4c. Bills. Cascades tms_fee_bill (10), payment_transaction_items (1),
--     billing_discounts (0).
DELETE FROM public.billing_student_bills b
USING public._bak_bds1y_bills_20260730 s
WHERE b.id = s.id;

-- 4d. Application-side logs and the now-stale per-learner summaries.
DELETE FROM public.user_activity_logs ual
USING public._bak_bds1y_activity_logs_20260730 s
WHERE ual.id = s.id;

DELETE FROM public.mv_student_billing_summary m
USING public._bak_bds1y_summaries_20260730 s
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
    JOIN public._bak_bds1y_bills_20260730 s ON s.id = b.id;
  SELECT COUNT(*) INTO v_receipts FROM public.billing_receipts r
    JOIN public._bak_bds1y_receipts_20260730 s ON s.id = r.id;
  SELECT COUNT(*) INTO v_items    FROM public.billing_receipt_items ri
    JOIN public._bak_bds1y_receipt_items_20260730 s ON s.id = ri.id;
  SELECT COUNT(*) INTO v_tms      FROM public.tms_fee_bill t
    JOIN public._bak_bds1y_tms_fee_bill_20260730 s ON s.id = t.id;
  SELECT COUNT(*) INTO v_pay      FROM public.payment_transaction_items pi
    JOIN public._bak_bds1y_payment_items_20260730 s ON s.id = pi.id;
  SELECT COUNT(*) INTO v_logs     FROM public.user_activity_logs ual
    JOIN public._bak_bds1y_activity_logs_20260730 s ON s.id = ual.id;
  SELECT COUNT(*) INTO v_sum      FROM public.mv_student_billing_summary m
    JOIN public._bak_bds1y_summaries_20260730 s ON s.student_id = m.student_id;

  IF v_bills    <> 0 THEN RAISE EXCEPTION 'Incomplete: % bills remain.', v_bills;           END IF;
  IF v_receipts <> 0 THEN RAISE EXCEPTION 'Incomplete: % receipts remain.', v_receipts;     END IF;
  IF v_items    <> 0 THEN RAISE EXCEPTION 'Incomplete: % receipt items remain.', v_items;   END IF;
  IF v_tms      <> 0 THEN RAISE EXCEPTION 'Incomplete: % tms_fee_bill rows remain.', v_tms; END IF;
  IF v_pay      <> 0 THEN RAISE EXCEPTION 'Incomplete: % payment items remain.', v_pay;     END IF;
  IF v_logs     <> 0 THEN RAISE EXCEPTION 'Incomplete: % activity logs remain.', v_logs;    END IF;
  IF v_sum      <> 0 THEN RAISE EXCEPTION 'Incomplete: % summary rows remain.', v_sum;      END IF;

  -- The learners themselves MUST all survive — this purge is billing-only.
  SELECT COUNT(*) INTO v_learners
  FROM public.learners_profiles lp
  JOIN public._bak_bds1y_scope_20260730 s ON s.learner_id = lp.id;

  IF v_learners <> 99 THEN
    RAISE EXCEPTION 'CRITICAL: only % of 99 learner profiles survive. Learner rows must never be deleted by this migration.', v_learners;
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

  RAISE NOTICE 'Purge complete: 361 bills, 18 receipts, 21 receipt items, 10 tms rows, 1 payment item, 30 logs, 99 summaries removed. All 99 learner profiles intact.';
END $$;
