-- One-time backfill of billing_student_bills.academic_year_id.
--
-- WHY: the bill-creation paths never set this column, so 4,971 of 8,503
-- 'academic' bills carried no academic year. The Bill Coverage report matches a
-- learner's academic year against the bill's, so unstamped bills read as "no
-- bill generated" and would prompt accountants to regenerate bills that already
-- exist.
--
-- DERIVATION: the learner's own academic year, accepted only when that academic
-- year belongs to the same institution as the bill. Rows failing that guard are
-- deliberately left NULL rather than guessed:
--   * 55 rows - learner has no academic year at all
--   * 11 rows - learner's academic year belongs to a different institution
-- Both sets are reported by the verification query in the plan and must be
-- resolved by hand, not by widening this UPDATE.

UPDATE public.billing_student_bills b
SET academic_year_id = lp.academic_year_id,
    updated_at = now()
FROM public.learners_profiles lp
JOIN public.academic_years ay ON ay.id = lp.academic_year_id
WHERE b.student_id = lp.id
  AND b.academic_year_id IS NULL
  AND ay.institution_id = b.institution_id;
