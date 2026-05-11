-- ============================================================================
-- 20260509100008 — Re-broaden billing_student_bills.status to preserve legacy values
-- ============================================================================
-- Plan 5 Task 3 narrowed the status check to ('unpaid','partially_paid','paid',
-- 'superseded'), inadvertently dropping 'cancelled' and 'overdue' that the
-- pre-existing constraint allowed. Multiple call sites in
-- lib/services/billing/{schedule,reports} filter on status='overdue' or
-- write status='cancelled', and removing those values broke the contract
-- even though no rows currently held them.
--
-- This migration re-broadens the check to the union of the legacy values
-- AND the new 'superseded'. Preserves backward compat; keeps Plan 5's
-- supersede-not-delete invariant.
-- ============================================================================

ALTER TABLE public.billing_student_bills
    DROP CONSTRAINT billing_student_bills_status_check;

ALTER TABLE public.billing_student_bills
    ADD CONSTRAINT billing_student_bills_status_check
    CHECK (status IN ('unpaid','partially_paid','paid','cancelled','overdue','superseded'));
