-- Learner "My Bills": hide advance-year bills beyond ONE year ahead.
--
-- A learner sees every past + current academic-year bill and at most ONE advance
-- year (the next AY). Later years stay fully visible to staff/accounts and only
-- disappear on the learner surface, re-appearing automatically as the
-- institution's current AY rolls forward. Reason: a learner could pick a far-future
-- AY (e.g. 2030-31) in the online-pay picker and pay it by mistake.
--
-- "Current AY" = latest ACTIVE academic year of the bill's institution with
-- start_date <= as-of date (same rule the billing coverage audit uses).
--
-- SECURITY DEFINER is required: the student policies on academic_years read
-- billing_student_bills, and the bills policy below must read academic_years —
-- an invoker-side lookup would recurse. The function takes no caller identity and
-- returns only a boolean about the bill's own year.

CREATE OR REPLACE FUNCTION public.fn_learner_bill_year_visible(
  p_academic_year_id uuid,
  p_as_of date DEFAULT current_date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH by AS (
    SELECT institution_id, start_date
    FROM public.academic_years
    WHERE id = p_academic_year_id
  ),
  cur AS (
    SELECT max(a.start_date) AS start_date
    FROM public.academic_years a, by
    WHERE a.institution_id = by.institution_id
      AND a.is_active
      AND a.start_date <= p_as_of
  ),
  nxt AS (
    SELECT min(a.start_date) AS start_date
    FROM public.academic_years a, by, cur
    WHERE a.institution_id = by.institution_id
      AND a.is_active
      AND a.start_date > cur.start_date
  )
  SELECT CASE
    WHEN p_academic_year_id IS NULL THEN true
    WHEN NOT EXISTS (SELECT 1 FROM by) THEN true          -- dangling FK: never hide money
    WHEN (SELECT start_date FROM cur) IS NULL THEN true   -- no current AY resolvable
    ELSE (SELECT start_date FROM by)
         <= coalesce((SELECT start_date FROM nxt), (SELECT start_date FROM cur))
  END;
$$;

REVOKE ALL ON FUNCTION public.fn_learner_bill_year_visible(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_learner_bill_year_visible(uuid, date) TO authenticated, service_role;

-- Student SELECT policy: existing two clauses kept verbatim + the year window.
DROP POLICY IF EXISTS "Students can view their own bills" ON public.billing_student_bills;
CREATE POLICY "Students can view their own bills" ON public.billing_student_bills
  FOR SELECT TO authenticated
  USING (
    (
      student_id IN (
        SELECT lp.id
        FROM public.learners_profiles lp
        JOIN public.profiles p
          ON (p.email = lp.student_email OR p.email = lp.college_email)
        WHERE p.id = (SELECT auth.uid()) AND p.role = 'student'
      )
    )
    AND (
      item_category_id IS NULL
      OR item_category_id IN (
        SELECT bc.id FROM public.billing_categories bc WHERE bc.visible_to_learners
      )
    )
    AND public.fn_learner_bill_year_visible(academic_year_id)
  );

-- bills_select_scoped ALSO carries a learner "self" branch (permissive policies are
-- OR'd), so the window must be applied there too or the hidden years leak through
-- it. Staff branches (super admin / admin / institution + billing.bills.view or
-- billing.schedule.view) are unchanged and see every year.
DROP POLICY IF EXISTS "bills_select_scoped" ON public.billing_student_bills;
CREATE POLICY "bills_select_scoped" ON public.billing_student_bills
  FOR SELECT
  USING (
    (SELECT ((SELECT public.is_super_admin()) OR (SELECT public.is_admin())))
    OR (
      institution_id IN (
        SELECT unnest((SELECT public._user_accessible_institutions()))
        WHERE (SELECT public.user_has_permission('billing.bills.view'))
           OR (SELECT public.user_has_permission('billing.schedule.view'))
      )
    )
    OR (
      student_id IN (
        SELECT lp.id
        FROM public.learners_profiles lp
        JOIN public.profiles p
          ON (p.email = lp.student_email OR p.email = lp.college_email)
        WHERE p.id = (SELECT auth.uid())
      )
      AND (
        item_category_id IS NULL
        OR item_category_id IN (
          SELECT bc.id FROM public.billing_categories bc WHERE bc.visible_to_learners
        )
      )
      AND public.fn_learner_bill_year_visible(academic_year_id)
    )
  );
