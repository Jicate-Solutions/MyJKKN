-- Safety net for billing_student_bills.academic_year_id.
--
-- FOUR code paths insert bills and none set academic_year_id reliably, which
-- left 58.5% of academic bills unstamped over three months:
--   1. lib/services/billing/schedule/student-bill-service.ts  (academic_year_id || null)
--   2. lib/services/billing/onboarding/onboarding-service.ts  (never set)
--   3. app/api/billing/schedule/bills/import/route.ts
--   4. the admission_account_transition_with_bills RPC — in SQL, so no
--      TypeScript fix can reach it
-- The Bill Coverage report reads this column, so an unstamped bill reads as
-- "not generated" and invites an accountant to regenerate a bill that exists.
--
-- This fills the column ONLY when the caller left it NULL. An explicitly
-- supplied year - e.g. an arrear bill raised against a past year - is never
-- overwritten. The academic year must belong to the same institution as the
-- bill, so a cross-institution learner record cannot leak a foreign year in.
--
-- SECURITY DEFINER: the trigger reads learners_profiles, which is RLS-gated.
-- Without it the lookup returns nothing for callers who cannot read that
-- learner's row, and the column would silently stay NULL.

CREATE OR REPLACE FUNCTION public.fn_billing_bill_default_academic_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.academic_year_id IS NULL THEN
    SELECT lp.academic_year_id
      INTO NEW.academic_year_id
    FROM public.learners_profiles lp
    JOIN public.academic_years ay ON ay.id = lp.academic_year_id
    WHERE lp.id = NEW.student_id
      AND ay.institution_id = NEW.institution_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_bill_default_academic_year
  ON public.billing_student_bills;

CREATE TRIGGER trg_billing_bill_default_academic_year
BEFORE INSERT ON public.billing_student_bills
FOR EACH ROW
EXECUTE FUNCTION public.fn_billing_bill_default_academic_year();
