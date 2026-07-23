-- Migration: Fix HOD role and backfill missing user_roles
-- Issue: Multi-role migration used INNER JOIN on role_key, skipping users
--        whose profile.role (e.g., 'hod') didn't have a matching custom_role
-- Solution: Ensure HOD custom_role exists, then backfill user_roles for any missing users
-- Date: 2026-05-06

BEGIN;

-- ============================================================================
-- Step 1: Ensure the HOD custom_role exists
-- ============================================================================

INSERT INTO public.custom_roles (
  role_key,
  role_name,
  description,
  is_system_role,
  is_active,
  institution_scope,
  permissions,
  module_scopes
) VALUES (
  'hod',
  'Head of Department',
  'Department-level academic leadership. Manages faculty, courses, syllabi, academic calendars, and approves academic actions within their department.',
  true,
  true,
  'own',
  jsonb_build_object(
    'academic.bos-syllabi.view', true,
    'academic.bos-syllabi.create', true,
    'academic.bos-syllabi.edit', true,
    'academic.bos-syllabi.delete', true,
    'academic.bos-taxonomy.view', true,
    'academic.staff.planning.view', true,
    'academic.staff.planning.create', true,
    'academic.staff.planning.edit', true
  ),
  '{}'::jsonb
)
ON CONFLICT (role_key) DO UPDATE
SET
  is_active = true,
  permissions = custom_roles.permissions || jsonb_build_object(
    'academic.bos-syllabi.view', true,
    'academic.bos-syllabi.create', true,
    'academic.bos-syllabi.edit', true,
    'academic.bos-syllabi.delete', true,
    'academic.bos-taxonomy.view', true,
    'academic.staff.planning.view', true,
    'academic.staff.planning.create', true,
    'academic.staff.planning.edit', true
  ),
  updated_at = NOW();

-- ============================================================================
-- Step 2: Backfill user_roles for any users whose profile.role is 'hod'
--         but who don't have a user_role record yet
-- ============================================================================

INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at)
SELECT
  p.id as user_id,
  cr.id as role_id,
  true as is_primary,
  COALESCE(p.created_at, NOW()) as assigned_at
FROM profiles p
INNER JOIN custom_roles cr ON cr.role_key = p.role
WHERE p.role = 'hod'
AND NOT EXISTS (
  -- Only insert if no user_role already exists for this user
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = p.id AND ur.role_id = cr.id
)
AND p.is_active = true;

-- ============================================================================
-- Step 3: Log the number of users backfilled
-- ============================================================================
-- Run a quick sanity check: SELECT COUNT(*) FROM user_roles ur
--   JOIN custom_roles cr ON cr.id = ur.role_id
--   WHERE cr.role_key = 'hod'
--   to verify HOD users now have role assignments

COMMIT;
