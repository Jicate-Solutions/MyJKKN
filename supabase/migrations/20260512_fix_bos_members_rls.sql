-- Migration: 20260512_fix_bos_members_rls.sql
--
-- Root cause: bos_members RLS policies checked 'bos.members.*' permission keys,
-- but the application seeds 'academic.bos-compositions.*' keys. Non-admin users
-- therefore always failed the permission check, making add/remove member return 500.
--
-- Fix: replace all four bos_members policies to use the canonical app keys.

-- SELECT
DROP POLICY IF EXISTS "bos_members_select" ON public.bos_members;
CREATE POLICY "bos_members_select" ON public.bos_members
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('academic.bos-compositions.view')
      AND role_has_institution_access(institutions_id)
    )
  );

-- INSERT
DROP POLICY IF EXISTS "bos_members_insert" ON public.bos_members;
CREATE POLICY "bos_members_insert" ON public.bos_members
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id)
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "bos_members_update" ON public.bos_members;
CREATE POLICY "bos_members_update" ON public.bos_members
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id)
    )
  );

-- DELETE
DROP POLICY IF EXISTS "bos_members_delete" ON public.bos_members;
CREATE POLICY "bos_members_delete" ON public.bos_members
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id)
    )
  );
