-- ============================================================================
-- Migration: 20260615121500_health_programs_manage_grant
-- Health → Wellness Programs (PR3/3) — grant the manage permission onto the
-- health_supervisor role so the admin authoring + impact surfaces are reachable
-- by the people who run them (not super-admin only).
-- ============================================================================
-- Context: the Wellness Programs feature gates its admin pages, RLS write
-- policies, and the fn_health_program_impact RPC on health.programs.manage.
-- The permission keys (health.programs.view / .manage) are defined in
-- lib/constants/permissions.ts, but no role carries them yet — so today only
-- super-admins (who bypass the checks) can use the feature. This grants both
-- keys to health_supervisor.
--
-- Permissions model: custom_roles.permissions is a flat jsonb { "dotted.key": bool }.
-- Canonical grant pattern: UPDATE ... SET permissions = COALESCE(permissions,'{}') || '{...}'.
-- Idempotent two ways: the || merge re-applies the same keys to the same values,
-- and the WHERE guard skips rows that already carry manage = 'true'.
-- ============================================================================

UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb)
      || '{"health.programs.view": true, "health.programs.manage": true}'::jsonb,
    updated_at = now()
WHERE role_key = 'health_supervisor'
  AND COALESCE(permissions->>'health.programs.manage', 'false') <> 'true';
