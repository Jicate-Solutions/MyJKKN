-- ============================================================================
-- 20260508160001 — Grant admission_fees.delete to Admission Officer role
-- ============================================================================
-- Migration 20260507100016 deliberately kept admission_fees.delete on
-- super_admin only because deleting a fee structure removes it from history
-- (already-resolved learners keep their snapshotted fee_items, but the
-- structure row itself disappears). Operationally this proved too restrictive:
-- Admission Officers regularly need to clean up incorrectly-created
-- structures without escalating, and the existing Archive flow is the
-- recommended path for "stop using going forward" anyway.
--
-- This migration grants admission_fees.delete to role_key='admission'.
-- admission_staff is intentionally NOT included — staff-tier still funnels
-- destructive cleanup through the officer.
--
-- The RLS DELETE policy on admission_fee_structures (migration
-- 20260507100011) already gates on user_has_permission('admission_fees.delete')
-- + role_has_institution_access, so this single permission grant is enough
-- to enable the per-row Delete action and the new bulk-delete bar in the
-- list view.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                   || '{"admission_fees.delete": true}'::jsonb,
       updated_at  = now()
 WHERE role_key = 'admission'
   AND COALESCE((permissions->>'admission_fees.delete')::boolean, false) = false;
