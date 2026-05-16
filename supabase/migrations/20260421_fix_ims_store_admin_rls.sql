-- Migration: 20260421_fix_ims_store_admin_rls
-- Purpose: Allow store_admin to create/update/delete categories and items.
--   The 20260226 migration locked category writes to super_admin+admin only,
--   but store_admin was added to profiles.role later (20260225) and was never
--   included in these policies, causing all category and item creation to fail
--   for store_admin users.

-- ── ims_item_categories ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ims_item_categories_insert" ON public.ims_item_categories;
DROP POLICY IF EXISTS "ims_item_categories_update" ON public.ims_item_categories;
DROP POLICY IF EXISTS "ims_item_categories_delete" ON public.ims_item_categories;

CREATE POLICY "ims_item_categories_insert"
  ON public.ims_item_categories FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() IN ('super_admin', 'admin', 'store_admin'));

CREATE POLICY "ims_item_categories_update"
  ON public.ims_item_categories FOR UPDATE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin', 'store_admin'));

CREATE POLICY "ims_item_categories_delete"
  ON public.ims_item_categories FOR DELETE TO authenticated
  USING (get_current_user_role() IN ('super_admin', 'admin', 'store_admin'));

-- ── ims_items ─────────────────────────────────────────────────────────────────
-- Add store_admin to the role bypass alongside super_admin so that institution_id
-- null-edge-cases during context hydration cannot block a legitimate store_admin.
DROP POLICY IF EXISTS "ims_items_insert" ON public.ims_items;
DROP POLICY IF EXISTS "ims_items_update" ON public.ims_items;
DROP POLICY IF EXISTS "ims_items_delete" ON public.ims_items;

CREATE POLICY "ims_items_insert"
  ON public.ims_items FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() IN ('super_admin', 'store_admin')
  );

CREATE POLICY "ims_items_update"
  ON public.ims_items FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() IN ('super_admin', 'store_admin')
  );

CREATE POLICY "ims_items_delete"
  ON public.ims_items FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR get_current_user_role() IN ('super_admin', 'store_admin')
  );
