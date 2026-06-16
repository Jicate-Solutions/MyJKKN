-- ============================================================================
-- 20260616160100 — Delete the two TEST transport fee structures + their bills.
-- ============================================================================
-- Removes the two test rows in tms_fee_structure created 2026-06-13:
--   • 7a379fb7-2d97-461b-ae4c-e7916d90589d  "testing"   (₹5,500, 3 terms, 0 bills)
--   • 31c585bc-7cc0-4f39-8cb1-53a873f8e047  "testing1"  (₹5,000, 3 terms, 3 bills)
--
-- "testing1" generated 3 billing_student_bills (one learner, ₹5,000 total) — all
-- status='unpaid', no payment_date, and ZERO receipt / payment-transaction /
-- discount rows reference them (verified). Nothing financial is lost, mirroring
-- the precedent in 20260602180000_delete_all_transport_fee_bills.sql.
--
-- Deletion order:
--   1. Snapshot everything to _bak_* tables (recovery path; drop after smoke).
--   2. Delete the 3 soft-linked billing_student_bills explicitly (the leaf that
--      a structure cascade would otherwise orphan).
--   3. Delete the 2 tms_fee_structure rows — ON DELETE CASCADE then clears their
--      tms_fee_structure_term, tms_fee_generation_run and tms_fee_bill rows.
--
-- With 20260616160000 applied, step 3's cascade also fires the safe-delete
-- trigger; the bills are already gone by then, so it is a harmless no-op.
-- billing_student_bills' AFTER DELETE trigger auto-refreshes
-- mv_student_billing_summary. Data-only migration; idempotent on re-run.
-- ============================================================================

-- 1. Backups -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bak_tms_fee_structure_20260616 AS
  SELECT * FROM public.tms_fee_structure;
CREATE TABLE IF NOT EXISTS public._bak_tms_fee_structure_term_20260616 AS
  SELECT * FROM public.tms_fee_structure_term;
CREATE TABLE IF NOT EXISTS public._bak_tms_fee_bill_20260616 AS
  SELECT * FROM public.tms_fee_bill;
CREATE TABLE IF NOT EXISTS public._bak_tms_fee_generation_run_20260616 AS
  SELECT * FROM public.tms_fee_generation_run;
CREATE TABLE IF NOT EXISTS public._bak_billing_student_bills_tms_test_20260616 AS
  SELECT b.*
  FROM public.billing_student_bills b
  JOIN public.tms_fee_bill fb ON fb.billing_student_bill_id = b.id
  WHERE fb.fee_structure_id IN (
    '7a379fb7-2d97-461b-ae4c-e7916d90589d',
    '31c585bc-7cc0-4f39-8cb1-53a873f8e047'
  );

-- 2. Delete the soft-linked student bills ------------------------------------
DELETE FROM public.billing_student_bills b
USING public.tms_fee_bill fb
WHERE fb.billing_student_bill_id = b.id
  AND fb.fee_structure_id IN (
    '7a379fb7-2d97-461b-ae4c-e7916d90589d',
    '31c585bc-7cc0-4f39-8cb1-53a873f8e047'
  );

-- 3. Delete the test structures (cascade clears terms / run / ledger) ---------
DELETE FROM public.tms_fee_structure
WHERE id IN (
  '7a379fb7-2d97-461b-ae4c-e7916d90589d',
  '31c585bc-7cc0-4f39-8cb1-53a873f8e047'
);
