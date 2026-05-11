-- 20260509110001_resource_categories_perm_based_rls.sql
--
-- Replace legacy hardcoded-role RLS policies on resource_parent_categories
-- and resource_sub_categories with permission-driven policies so the
-- 'administrator' (and any other future role) can create / edit / delete
-- categories when granted the corresponding permission key.
--
-- ROOT CAUSE
--   The original policies checked:
--     EXISTS (SELECT 1 FROM profiles
--             WHERE id = auth.uid()
--               AND role = ANY (ARRAY['super_admin','admin']))
--   The 'administrator' role (custom_roles.role_key='administrator') was not
--   in that array, so RLS rejected INSERT/UPDATE/DELETE silently even though
--   the role has resources.categories.create / resources.subcategories.create
--   granted in custom_roles.permissions and the UI button rendered for it.
--
-- DESIGN
--   user_has_permission(text) already short-circuits TRUE for users with
--   profiles.is_super_admin = true, so we do not need a separate
--   is_super_admin() OR clause. This matches the existing pattern on
--   resources / resource_reservations.
--
-- SAFETY
--   No role loses access:
--     - super_admin (9 users) : passes via is_super_admin = true bypass
--     - admin (1 user)         : custom_roles.role_key='admin' permissions
--                                JSONB inherits relevant grants OR legacy
--                                fallback path of user_has_permission()
--     - administrator (3)      : passes via the granted permission keys

BEGIN;

-- ===== resource_parent_categories =====

DROP POLICY IF EXISTS "Users can create parent categories"
  ON resource_parent_categories;
DROP POLICY IF EXISTS "Users can update parent categories"
  ON resource_parent_categories;
DROP POLICY IF EXISTS "Users can delete parent categories"
  ON resource_parent_categories;
-- Also drop the older naming variants that may exist on some environments
DROP POLICY IF EXISTS "parent_cat_insert_admin"
  ON resource_parent_categories;
DROP POLICY IF EXISTS "parent_cat_update_admin"
  ON resource_parent_categories;
DROP POLICY IF EXISTS "parent_cat_delete_admin"
  ON resource_parent_categories;

CREATE POLICY "parent_cat_insert_perm"
  ON resource_parent_categories
  FOR INSERT
  WITH CHECK (user_has_permission('resources.categories.create'));

CREATE POLICY "parent_cat_update_perm"
  ON resource_parent_categories
  FOR UPDATE
  USING (user_has_permission('resources.categories.edit'));

CREATE POLICY "parent_cat_delete_perm"
  ON resource_parent_categories
  FOR DELETE
  USING (user_has_permission('resources.categories.delete'));

-- ===== resource_sub_categories =====

DROP POLICY IF EXISTS "Users can create sub categories"
  ON resource_sub_categories;
DROP POLICY IF EXISTS "Users can update sub categories"
  ON resource_sub_categories;
DROP POLICY IF EXISTS "Users can delete sub categories"
  ON resource_sub_categories;
-- Also drop the older naming variants
DROP POLICY IF EXISTS "sub_cat_insert_admin"
  ON resource_sub_categories;
DROP POLICY IF EXISTS "sub_cat_update_admin"
  ON resource_sub_categories;
DROP POLICY IF EXISTS "sub_cat_delete_admin"
  ON resource_sub_categories;

CREATE POLICY "sub_cat_insert_perm"
  ON resource_sub_categories
  FOR INSERT
  WITH CHECK (user_has_permission('resources.subcategories.create'));

CREATE POLICY "sub_cat_update_perm"
  ON resource_sub_categories
  FOR UPDATE
  USING (user_has_permission('resources.subcategories.edit'));

CREATE POLICY "sub_cat_delete_perm"
  ON resource_sub_categories
  FOR DELETE
  USING (user_has_permission('resources.subcategories.delete'));

COMMIT;
