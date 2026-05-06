-- ============================================================================
-- 20260510100002 — Register admission.settings.manage permission
-- ============================================================================
-- Plan 1's RLS policies on admission_settings_per_institution reference
-- 'admission.settings.manage' as the write-gate. This migration ensures the
-- permission key is granted to admin-tier roles. JSONB on
-- public.custom_roles.permissions. Resolver: user_has_permission(text).
--
-- Grants:
--   admission.settings.manage → administrator, super_admin
--
-- Idempotent: skip rows that already have the key set to 'true'.
--
-- Plan: 2026-05-05-admission-fees-plan-06-cutover-adoption.md Task 3
-- Spec §10.1
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.settings.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE(permissions->>'admission.settings.manage','false') <> 'true';
