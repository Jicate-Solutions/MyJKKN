-- =============================================================================
-- Student RLS: hide bills in learner-invisible categories
-- =============================================================================
-- Defence in depth for `billing_categories.visible_to_learners`. The learner
-- surfaces already filter in application code, but a signed-in learner can hit
-- PostgREST directly from the browser, so the rule belongs in the database too.
--
-- billing_student_bills has TWO permissive SELECT policies that expose rows to a
-- learner. Permissive policies are OR'd, so restricting one and not the other
-- would leak straight through the second. Both are rebuilt here from their live
-- definitions with the visibility clause added to the STUDENT branch only —
-- staff/admin branches are untouched, so Accounts keeps full sight of every fee.
--
-- Written as `item_category_id IN (SELECT …)` rather than `= ANY(fn())` so the
-- planner evaluates the (var-free) sub-select once per query instead of once per
-- row — the same trap that produced 57014 timeouts elsewhere in this schema.
--
-- Uncategorised bills stay visible: hiding a bill nobody classified would
-- silently drop real money from the learner's statement.
--
-- DELIBERATELY NOT RESTRICTED: billing_receipt_items.
-- A receipt is proof the learner actually paid, so it is still shown in full;
-- its hidden LINES are collapsed into one unnamed "Other fees" row in the page
-- layer (lib/utils/billing/learner-visibility.ts). Hiding the item rows here
-- would break that collapse and make the receipt total stop matching the amount
-- paid. The masking on receipts is presentational by design.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. "Students can view their own bills" (authenticated)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Students can view their own bills" ON public.billing_student_bills;

CREATE POLICY "Students can view their own bills"
  ON public.billing_student_bills
  FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT lp.id
      FROM learners_profiles lp
      JOIN profiles p
        ON (p.email = lp.student_email OR p.email = lp.college_email)
      WHERE p.id = auth.uid()
        AND p.role = 'student'
    )
    AND (
      item_category_id IS NULL
      OR item_category_id IN (
        SELECT id FROM public.billing_categories WHERE visible_to_learners
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. "bills_select_scoped" — super admin / permissioned staff / self branches.
--    Only the third (self) branch gains the visibility clause.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS bills_select_scoped ON public.billing_student_bills;

CREATE POLICY bills_select_scoped
  ON public.billing_student_bills
  FOR SELECT
  USING (
    (SELECT (is_super_admin() OR is_admin()))
    OR (
      institution_id IN (
        SELECT unnest(_user_accessible_institutions()) AS unnest
        WHERE user_has_permission('billing.bills.view')
           OR user_has_permission('billing.schedule.view')
      )
    )
    OR (
      student_id IN (
        SELECT lp.id
        FROM learners_profiles lp
        JOIN profiles p
          ON (p.email = lp.student_email OR p.email = lp.college_email)
        WHERE p.id = auth.uid()
      )
      AND (
        item_category_id IS NULL
        OR item_category_id IN (
          SELECT id FROM public.billing_categories WHERE visible_to_learners
        )
      )
    )
  );
