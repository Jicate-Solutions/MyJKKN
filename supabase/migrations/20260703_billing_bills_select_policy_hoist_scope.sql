-- /billing/schedule 57014 statement timeout for all-institution non-admin
-- users (e.g. role 'accounts'). billing_student_bills had TWO overlapping
-- SELECT policies (bills_select_institution + billing_bills_select_permission)
-- whose OR'd quals called is_super_admin()/is_admin()/
-- role_has_institution_access()/user_has_permission() PER ROW — ~10k rows x
-- several catalog-reading calls ≈ 4s for the count alone, and the PostgREST
-- count+data request blew the 8s statement timeout. The June service-side
-- institution scoping only helped users whose accessible-institution list is
-- small; for an accounts user the IN() list covers every institution.
--
-- Fix: consolidate into ONE policy where every user-constant predicate is
-- hoisted out of the per-row loop:
--   * (SELECT is_super_admin() OR is_admin())  → scalar InitPlan, runs once
--   * institution_id IN (SELECT unnest(_user_accessible_institutions())
--       WHERE user_has_permission(...))        → uncorrelated hashed SubPlan,
--       runs once; per-row work is a hash probe
--   * student-self subquery                    → already a hashed SubPlan
-- _user_accessible_institutions() is defined as exactly the set of
-- institutions where role_has_institution_access() holds, and the permission
-- keys are the union of the two old policies (billing.bills.view /
-- billing.schedule.view), so the visible-row set is unchanged
-- (verified: 9936/35/9936 rows for accounts / student / accountant_assistant
-- before and after; count timing 4169ms → 8ms).
--
-- NOTE (from the 2026-06-05 incident): rewriting as
-- role-per-row `institution_id = ANY(_user_accessible_institutions())` makes
-- things WORSE — inside an OR the planner calls the STABLE function per row.
-- The IN (SELECT ...) subquery form is what makes it a run-once hashed SubPlan.

DROP POLICY IF EXISTS "bills_select_institution" ON public.billing_student_bills;
DROP POLICY IF EXISTS "billing_bills_select_permission" ON public.billing_student_bills;

CREATE POLICY "bills_select_scoped" ON public.billing_student_bills
FOR SELECT
USING (
  (SELECT public.is_super_admin() OR public.is_admin())
  OR institution_id IN (
    SELECT unnest(public._user_accessible_institutions())
    WHERE public.user_has_permission('billing.bills.view')
       OR public.user_has_permission('billing.schedule.view')
  )
  OR student_id IN (
    SELECT lp.id
    FROM public.learners_profiles lp
    JOIN public.profiles p
      ON (p.email = lp.student_email OR p.email = lp.college_email)
    WHERE p.id = auth.uid()
  )
);
