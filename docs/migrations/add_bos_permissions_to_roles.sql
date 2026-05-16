-- Migration: Add BOS Module Permissions to HOD, Faculty, and Principal Roles
-- Purpose: Grant Board of Studies (BOS) access to institutional roles
-- Run this migration to enable BOS syllabi, taxonomy, experts, etc. for HOD and Faculty users

-- Update HOD Role with BOS Permissions
UPDATE custom_roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{}',
  COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'academic.bos-syllabi', jsonb_build_object(
      'view', true, 'create', true, 'edit', true, 'revise', true, 'duplicate', true, 'export', true
    ),
    'academic.bos-taxonomy', jsonb_build_object('view', true, 'edit', true),
    'academic.bos-experts', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
    'academic.bos-compositions', jsonb_build_object('view', true, 'create', true, 'edit', true),
    'academic.bos-meetings', jsonb_build_object('view', true, 'create', true, 'edit', true),
    'academic.bos-ta-da', jsonb_build_object('view', true, 'submit', true),
    'academic.bos-reports', jsonb_build_object('view', true)
  )
)
WHERE role_key = 'hod'
  AND institution_id IS NOT NULL;

-- Update Faculty Role with BOS Permissions
UPDATE custom_roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{}',
  COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'academic.bos-syllabi', jsonb_build_object('view', true, 'export', true),
    'academic.bos-taxonomy', jsonb_build_object('view', true),
    'academic.bos-experts', jsonb_build_object('view', true),
    'academic.bos-compositions', jsonb_build_object('view', true),
    'academic.bos-meetings', jsonb_build_object('view', true),
    'academic.bos-ta-da', jsonb_build_object('view', true, 'submit', true),
    'academic.bos-reports', jsonb_build_object('view', true)
  )
)
WHERE role_key = 'faculty'
  AND institution_id IS NOT NULL;

-- Update Principal Role with BOS Permissions (View-Only)
UPDATE custom_roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{}',
  COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'academic.bos-syllabi', jsonb_build_object('view', true, 'export', true),
    'academic.bos-taxonomy', jsonb_build_object('view', true),
    'academic.bos-experts', jsonb_build_object('view', true),
    'academic.bos-compositions', jsonb_build_object('view', true),
    'academic.bos-meetings', jsonb_build_object('view', true),
    'academic.bos-ta-da', jsonb_build_object('view', true),
    'academic.bos-reports', jsonb_build_object('view', true, 'export', true)
  )
)
WHERE role_key = 'principal'
  AND institution_id IS NOT NULL;

-- Update Coordinator Role with BOS Permissions
UPDATE custom_roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{}',
  COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'academic.bos-syllabi', jsonb_build_object('view', true, 'create', true, 'edit', true, 'export', true),
    'academic.bos-taxonomy', jsonb_build_object('view', true),
    'academic.bos-experts', jsonb_build_object('view', true, 'create', true, 'edit', true),
    'academic.bos-compositions', jsonb_build_object('view', true, 'create', true, 'edit', true),
    'academic.bos-meetings', jsonb_build_object('view', true, 'create', true, 'edit', true),
    'academic.bos-ta-da', jsonb_build_object('view', true, 'submit', true),
    'academic.bos-reports', jsonb_build_object('view', true)
  )
)
WHERE role_key = 'coordinator'
  AND institution_id IS NOT NULL;

-- Also update system-wide roles (for institutions without custom_roles)
INSERT INTO custom_roles (role_key, institution_id, permissions, is_active, created_at)
VALUES
  ('hod', NULL, jsonb_build_object(
    'academic.bos-syllabi', jsonb_build_object('view', true, 'create', true, 'edit', true, 'revise', true, 'duplicate', true, 'export', true),
    'academic.bos-taxonomy', jsonb_build_object('view', true, 'edit', true),
    'academic.bos-experts', jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true),
    'academic.bos-compositions', jsonb_build_object('view', true, 'create', true, 'edit', true),
    'academic.bos-meetings', jsonb_build_object('view', true, 'create', true, 'edit', true),
    'academic.bos-ta-da', jsonb_build_object('view', true, 'submit', true),
    'academic.bos-reports', jsonb_build_object('view', true)
  ), true, now()),
  ('faculty', NULL, jsonb_build_object(
    'academic.bos-syllabi', jsonb_build_object('view', true, 'export', true),
    'academic.bos-taxonomy', jsonb_build_object('view', true),
    'academic.bos-experts', jsonb_build_object('view', true),
    'academic.bos-compositions', jsonb_build_object('view', true),
    'academic.bos-meetings', jsonb_build_object('view', true),
    'academic.bos-ta-da', jsonb_build_object('view', true, 'submit', true),
    'academic.bos-reports', jsonb_build_object('view', true)
  ), true, now()),
  ('principal', NULL, jsonb_build_object(
    'academic.bos-syllabi', jsonb_build_object('view', true, 'export', true),
    'academic.bos-taxonomy', jsonb_build_object('view', true),
    'academic.bos-experts', jsonb_build_object('view', true),
    'academic.bos-compositions', jsonb_build_object('view', true),
    'academic.bos-meetings', jsonb_build_object('view', true),
    'academic.bos-ta-da', jsonb_build_object('view', true),
    'academic.bos-reports', jsonb_build_object('view', true, 'export', true)
  ), true, now())
ON CONFLICT (role_key, institution_id) DO UPDATE
SET permissions = EXCLUDED.permissions;

-- Verify the permissions were added
SELECT role_key, institution_id, permissions->'academic.bos-syllabi' as syllabi_access
FROM custom_roles
WHERE role_key IN ('hod', 'faculty', 'principal')
ORDER BY role_key, institution_id;
