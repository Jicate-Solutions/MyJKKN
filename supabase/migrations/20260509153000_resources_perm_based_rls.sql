-- 20260509153000_resources_perm_based_rls.sql
--
-- Replace legacy hardcoded-role RLS policies on `resources` with the
-- canonical permission + institution-access pattern used across the
-- codebase (organizations.programs/degrees/departments, admission_leads,
-- and resource_parent_categories per 20260509110001).
--
-- ROOT CAUSE
--   Two legacy policies coexisted with the newer permission-aware ones:
--     1) "Enhanced resources management with department filtering" (FOR ALL)
--        gated on profiles.role IN ('super_admin','admin') only — silently
--        rejected every other role.
--     2) "resources_insert_admin" / update_admin / delete_admin pinned access
--        to institution_id IN (SELECT profiles.institution_id WHERE
--        id=auth.uid()) which silently fails for any role with scope='all'
--        or a multi-institution scope, even when role_has_institution_access()
--        would otherwise authorize them.
--
--   Net effect: 'administrator' role users (e.g. JICATE Staff with
--   administrator role assigned) who had every permission key granted in
--   custom_roles.permissions saw `42501 new row violates row-level security
--   policy for table resources` on INSERT despite the UI rendering the form.
--
-- DESIGN
--   New policies mirror the canonical contract:
--     is_super_admin()
--     OR is_admin(auth.uid())
--     OR ( role_has_institution_access(institution_id)
--          AND user_has_permission('resources.resources.<action>') )
--
--   `role_has_institution_access(uuid)` and `user_has_permission(text)` are
--   both SECURITY DEFINER and short-circuit on super-admin, so the explicit
--   is_super_admin() / is_admin() OR-clauses are kept for clarity and to
--   match the contract documented in supabase/setup/03_policies.sql.
--
-- SCOPE
--   Touches INSERT / UPDATE / DELETE on `resources` only. SELECT policies are
--   intentionally left as-is to avoid a separate visibility regression.

BEGIN;

-- 1. Drop the legacy FOR ALL policy that hardcodes profile.role
DROP POLICY IF EXISTS "Enhanced resources management with department filtering"
  ON public.resources;

-- 2. Drop the older institution-pinned write policies (will be recreated)
DROP POLICY IF EXISTS resources_insert_admin ON public.resources;
DROP POLICY IF EXISTS resources_update_admin ON public.resources;
DROP POLICY IF EXISTS resources_delete_admin ON public.resources;

-- Also drop any older naming that may exist on some environments
DROP POLICY IF EXISTS resources_all_admin ON public.resources;

-- 3. Recreate write policies using the canonical pattern
CREATE POLICY resources_insert_perm
  ON public.resources
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_admin(auth.uid())
    OR (
      role_has_institution_access(institution_id)
      AND user_has_permission('resources.resources.create')
    )
  );

CREATE POLICY resources_update_perm
  ON public.resources
  FOR UPDATE
  USING (
    is_super_admin()
    OR is_admin(auth.uid())
    OR (
      role_has_institution_access(institution_id)
      AND user_has_permission('resources.resources.edit')
    )
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin(auth.uid())
    OR (
      role_has_institution_access(institution_id)
      AND user_has_permission('resources.resources.edit')
    )
  );

CREATE POLICY resources_delete_perm
  ON public.resources
  FOR DELETE
  USING (
    is_super_admin()
    OR is_admin(auth.uid())
    OR (
      role_has_institution_access(institution_id)
      AND user_has_permission('resources.resources.delete')
    )
  );

COMMIT;
