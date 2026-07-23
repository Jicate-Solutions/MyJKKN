-- billing_categories is a lookup/catalog table (category_name, kind, default
-- amount). Its SELECT policy required billing.categories.view, which students
-- lack — so /learners/my-bills resolved every bill's category to NULL: no fee
-- head badges, transport bills not sectioned, and the per-bill Pay Online
-- button (gated on category kind) never appeared. Lookup reads must not be
-- gated behind manage permissions; writes stay permission-gated.

DROP POLICY IF EXISTS billing_categories_select ON public.billing_categories;

CREATE POLICY billing_categories_select ON public.billing_categories
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);
