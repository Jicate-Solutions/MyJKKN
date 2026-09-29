-- =============================================================================
-- 20260925150000_admitted_threshold_basis_billed_to_date.sql
--
-- The reserved -> admitted 30% gate now counts ADVANCE payments.
--
-- Until now admitted.threshold_basis = 'due_to_date' (2026-08-11 ruling,
-- 20260821040000): paid ÷ bills whose due date has arrived. Tuition for the
-- 2026-27 cohort falls due 30-Sep / 30-Nov-2026, so a learner who had already
-- paid 46% of everything billed (e.g. ₹2,60,000 of ₹5,60,000) scored 0% and
-- sat in 'reserved'. 2026-09-25 audit: 31 reserved learners (+1 account) had
-- paid >= 30% of their whole bill book and were held back by the basis alone.
--
-- Decision (2026-09-25, by the user): measure the gate on everything billed —
-- 'billed_to_date' = paid ÷ all non-application-fee bills. Applies to every
-- institution. evaluate_learner_status_after_payment and
-- fn_onboarding_payment_progress both read this column, so the engine and the
-- onboarding screen move together; no function changes.
--
-- Also decided: Stage B may still promote straight from 'account' (the engine
-- already allows it), so a learner at >= 30% of billed with unpaid
-- Application / University fees goes account -> admitted.
--
-- 'active' (60%, gates_login) is untouched.
--
-- The backfill runs the existing sweep (promotion-only, rule-bound, writes
-- status history) so every learner already over the new bar moves now rather
-- than at the next payment or the 02:05 IST cron.
-- =============================================================================

UPDATE public.admission_statuses
   SET threshold_basis = 'billed_to_date'
 WHERE scope = 'learner'
   AND code = 'admitted';

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admission_statuses
                 WHERE scope = 'learner' AND code = 'admitted'
                   AND threshold_basis = 'billed_to_date') THEN
    RAISE EXCEPTION 'admitted.threshold_basis was not updated';
  END IF;
END
$check$;

SELECT public.fn_sweep_learner_status_promotions(5000);
