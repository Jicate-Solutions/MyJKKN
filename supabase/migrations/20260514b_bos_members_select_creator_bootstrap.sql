-- ============================================================================
-- Migration: 20260514b_bos_members_select_creator_bootstrap.sql
-- Description: Adds the creator-of-parent-composition carve-out to
--              bos_members_select. The previous bos_members policies (20260514
--              + 20260514a) allowed the creator to INSERT/UPDATE/DELETE member
--              rows, but the SELECT policy still required the user to already
--              be in bos_members for the composition.
--
-- Symptom: supabase-js `.insert().select()` chain triggers two RLS checks:
--          WITH CHECK on insert (passed), then USING on the implicit
--          RETURNING SELECT (denied — user can't see the just-inserted row
--          because they're not yet a member of the composition). Net effect:
--          row goes in, transaction rolls back, user gets misleading 42501.
--
-- Fix: bos_members_select now allows reading rows when the user is the
--      creator of the parent composition (matches the INSERT/UPDATE/DELETE
--      bootstrap clauses introduced by 20260514a).
-- Created: 2026-05-14
-- ============================================================================

DROP POLICY IF EXISTS "bos_members_select" ON bos_members;

CREATE POLICY "bos_members_select" ON bos_members FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = bos_members.staff_id
      AND s.profile_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM bos_compositions c
    WHERE c.id = bos_members.composition_id
      AND c.created_by = (SELECT auth.uid())
  )
  OR (
    user_has_permission('academic.bos-compositions.view')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of(composition_id))
  )
);

NOTIFY pgrst, 'reload schema';
