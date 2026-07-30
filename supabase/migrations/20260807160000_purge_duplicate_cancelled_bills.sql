-- Purge the 316 phantom bills created by the 2026-07-25 billing import re-run.
--
-- INCIDENT
-- `app/api/billing/schedule/bills/import/route.ts` does a bare `.insert(insertRows)`
-- with no existence check and no onConflict, so re-running an import duplicates every
-- row. At 2026-07-25 01:16:01 UTC a single transaction created 317 bills for 84 BDS
-- learners at JKKN Dental College — 100% duplicates of originals raised on 15-Jun (252)
-- and 19-Jun (65). ~Rs 13.58 Cr of phantom liability. 316 of those copies were
-- subsequently marked `cancelled`; this migration removes them.
--
-- The 317th row (BDS25080 / SOMRITA.K, Rs 4,25,000) received a payment and is now that
-- learner's live `paid` bill with no sibling. It is deliberately NOT touched — the
-- predicate below only matches `cancelled` rows.
--
-- WHY A HARD DELETE IS SAFE HERE (verified 2026-07-29)
-- Every one of the 316 rows carries ZERO dependent records: no billing_receipt_items,
-- no payment_transaction_items, no billing_bill_apportionments, no billing_discounts,
-- no billing_refund_request_bills, no student_credit_balances, no hostel_waitlist link
-- and no tms_fee_bill row. No refunded_amount, no refund_status, no payment_date.
-- And each one still has a LIVE twin on the 7-dimension duplicate key
-- (student, category, academic_year, fee_source, description, due_date, amount) —
-- so the charge history survives on the original bill. Nothing is lost.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
-- The other 187 cancelled bills stay. They are lifecycle cancellations, not mistakes:
--   167  expired/declined hostel upgrade offers (Dental 164, Pharmacy 3) — each is
--        linked from hostel_waitlist.upgrade_bill_id and is the only record that the
--        offer was made and priced. That FK is ON DELETE SET NULL, so a blanket
--        "delete all cancelled" would silently sever all 167 links.
--    16  Razorpay payment-gateway test dues (JKKN Testing Institution, 11-Jun)
--     4  tuition/transport cancellations across Pharmacy, Allied Health, Engineering
-- There is NO bill-level audit/history table in this database, so a delete here is
-- permanent. Removing those 187 would destroy the only evidence of real decisions.
--
-- NOTE: this changes no totals anywhere in the app. `lib/billing/bill-status.ts`
-- already excludes both void statuses from every figure, and the dedup structures
-- (uq_bill_dedup_category, uq_bill_dedup_package, idx_bsb_student_category_live,
-- trigger billing_enforce_once_per_learner) are all partial on
-- `status NOT IN ('cancelled','superseded')` — cancelled rows are already invisible
-- to them. This purge reclaims rows; it neither fixes nor weakens duplicate
-- prevention. The unguarded import path remains the actual root cause.

-- ---------------------------------------------------------------------------
-- 1. Snapshot the exact target set FIRST, so the guard and the DELETE below
--    operate on identical rows (re-evaluating the predicate three times would
--    risk drift). Creating this table is also the re-run guard: a second run
--    fails loudly on "already exists" rather than silently deleting more.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_billing_cancelled_dupes_20260729 AS
SELECT c.*
FROM public.billing_student_bills c
WHERE c.status = 'cancelled'
  -- The bad transaction's window. Postgres now() is transaction-scoped, so every
  -- row from that single INSERT shares one microsecond-identical created_at.
  AND c.created_at >= '2026-07-25 01:16:00+00'
  AND c.created_at <  '2026-07-25 01:17:00+00'
  -- ...and independently confirm a live original still exists for each one.
  -- Both predicates were measured to select the same 316 rows, with zero rows
  -- in either difference. Requiring both means a drifted assumption aborts the
  -- migration at the guard instead of deleting the wrong set.
  AND EXISTS (
    SELECT 1
    FROM public.billing_student_bills l
    WHERE l.status NOT IN ('cancelled', 'superseded')
      AND l.student_id       = c.student_id
      AND l.item_category_id IS NOT DISTINCT FROM c.item_category_id
      AND l.academic_year_id IS NOT DISTINCT FROM c.academic_year_id
      AND l.fee_source       = c.fee_source
      AND l.bill_description IS NOT DISTINCT FROM c.bill_description
      AND l.due_date         = c.due_date
      AND l.final_amount     = c.final_amount
  );

-- Match the existing _bak_* convention: RLS on with no policies, i.e. reachable
-- by service_role / table owner only. Belt-and-braces revoke for the API roles.
ALTER TABLE public._bak_billing_cancelled_dupes_20260729 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bak_billing_cancelled_dupes_20260729 FROM anon, authenticated;

COMMENT ON TABLE public._bak_billing_cancelled_dupes_20260729 IS
  'Snapshot of the 316 cancelled duplicate bills from the 2026-07-25 01:16 import '
  're-run, taken immediately before they were hard-deleted on 2026-07-29. '
  'Restore with: INSERT INTO billing_student_bills SELECT * FROM this table.';

-- ---------------------------------------------------------------------------
-- 2. Guard. Any deviation from the verified shape aborts the whole migration
--    (DDL included — Postgres rolls back CREATE TABLE too).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count       int;
  v_value       numeric;
  v_deps        int;
  v_institutions int;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(final_amount), 0), COUNT(DISTINCT institution_id)
    INTO v_count, v_value, v_institutions
  FROM public._bak_billing_cancelled_dupes_20260729;

  IF v_count <> 316 THEN
    RAISE EXCEPTION
      'Aborting purge: expected exactly 316 duplicate cancelled bills, matched %. '
      'The data has changed since verification on 2026-07-29 — re-run the analysis '
      'before deleting anything.', v_count;
  END IF;

  IF v_institutions <> 1 THEN
    RAISE EXCEPTION
      'Aborting purge: target set spans % institutions, expected 1 (JKKN Dental '
      'College and Hospital).', v_institutions;
  END IF;

  -- Nothing anywhere may depend on these bills. Covers the FK children (both the
  -- CASCADE ones that would delete silently and the NO ACTION ones that would
  -- block) plus the two soft references that have no FK at all.
  SELECT
      (SELECT COUNT(*) FROM public.billing_receipt_items         x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.payment_transaction_items     x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.billing_bill_apportionments   x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.billing_discounts             x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.billing_refund_request_bills  x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.student_credit_balances       x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.consumed_against_bill_id)
    + (SELECT COUNT(*) FROM public.tms_fee_bill                  x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.billing_student_bill_id)
    + (SELECT COUNT(*) FROM public.hostel_waitlist               x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.upgrade_bill_id)
    + (SELECT COUNT(*) FROM public.mess_student_billing          x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.linked_bill_id)
    + (SELECT COUNT(*) FROM public.billing_student_bills         x JOIN public._bak_billing_cancelled_dupes_20260729 b ON b.id = x.superseded_by_bill_id)
    + (SELECT COUNT(*) FROM public.payment_transactions          x WHERE EXISTS (
         SELECT 1 FROM public._bak_billing_cancelled_dupes_20260729 b WHERE b.id = ANY(x.bill_ids)))
    INTO v_deps;

  IF v_deps <> 0 THEN
    RAISE EXCEPTION
      'Aborting purge: % dependent row(s) reference these bills. Expected 0 — '
      'a receipt, payment, discount, refund, credit, transport, mess or hostel '
      'record now points at a bill about to be deleted.', v_deps;
  END IF;

  -- No money may have landed on any of them since verification.
  IF EXISTS (
    SELECT 1 FROM public._bak_billing_cancelled_dupes_20260729
    WHERE COALESCE(refunded_amount, 0) <> 0
       OR refund_status IS NOT NULL
       OR payment_date IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Aborting purge: at least one target bill carries a payment or refund signal.';
  END IF;

  RAISE NOTICE 'Guards passed: purging % duplicate cancelled bills worth %.',
    v_count, v_value;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Delete, scoped strictly to the snapshotted ids.
-- ---------------------------------------------------------------------------
DELETE FROM public.billing_student_bills b
USING public._bak_billing_cancelled_dupes_20260729 s
WHERE b.id = s.id;

-- ---------------------------------------------------------------------------
-- 4. Verify the outcome before committing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_remaining int;
  v_backed_up int;
  v_cancelled int;
BEGIN
  SELECT COUNT(*) INTO v_backed_up FROM public._bak_billing_cancelled_dupes_20260729;

  SELECT COUNT(*) INTO v_remaining
  FROM public.billing_student_bills b
  JOIN public._bak_billing_cancelled_dupes_20260729 s ON s.id = b.id;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Purge incomplete: % target bill(s) still present.', v_remaining;
  END IF;

  IF v_backed_up <> 316 THEN
    RAISE EXCEPTION 'Backup table holds % rows, expected 316.', v_backed_up;
  END IF;

  SELECT COUNT(*) INTO v_cancelled
  FROM public.billing_student_bills WHERE status = 'cancelled';

  -- 503 cancelled before, minus 316 purged = 187 lifecycle cancellations retained.
  IF v_cancelled <> 187 THEN
    RAISE WARNING
      'Cancelled bills now number % (expected 187). Not fatal — bills may have been '
      'cancelled by normal activity since 2026-07-29 — but worth a look.', v_cancelled;
  END IF;

  RAISE NOTICE 'Purge complete: 316 duplicates removed, % cancelled bills retained.',
    v_cancelled;
END $$;
