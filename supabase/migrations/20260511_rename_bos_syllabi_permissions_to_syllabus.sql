-- Migration: Rename BOS permission keys bos-syllabi → bos-syllabus
-- Reason: Route and module key were renamed from /bos/syllabi → /bos/syllabus.
--         All custom_roles.permissions JSONB keys must match the new module key
--         so that canAccess('academic.bos-syllabus', 'view') resolves correctly.
--         Also adds courses/scheme flat keys to HOD + principal, inserts facilitator.
-- Date: 2026-05-11
-- Status: APPLIED directly via Management API (project kvizhngldtiuufknvehv)

BEGIN;

-- ============================================================================
-- Step 1: HOD — rename syllabi flat keys → syllabus, add courses + scheme
-- ============================================================================
-- HOD had mixed key formats:
--   "academic.bos-syllabi": {nested object}        → removed (hook ignores nested values)
--   "academic.bos-syllabi.view/create/edit/delete" → renamed to bos-syllabus.*
--   revise/duplicate/export were only in nested obj → added as flat keys
--   courses + scheme were absent                    → added

UPDATE public.custom_roles
SET
  permissions = (
    permissions
    - 'academic.bos-syllabi'
    - 'academic.bos-syllabi.view'
    - 'academic.bos-syllabi.create'
    - 'academic.bos-syllabi.edit'
    - 'academic.bos-syllabi.delete'
    - 'academic.bos-syllabi.revise'
    - 'academic.bos-syllabi.duplicate'
    - 'academic.bos-syllabi.export'
  ) || jsonb_build_object(
    'academic.bos-syllabus.view',      true,
    'academic.bos-syllabus.create',    true,
    'academic.bos-syllabus.edit',      true,
    'academic.bos-syllabus.delete',    true,
    'academic.bos-syllabus.revise',    true,
    'academic.bos-syllabus.duplicate', true,
    'academic.bos-syllabus.export',    true,
    'academic.bos-courses.view',       true,
    'academic.bos-courses.create',     true,
    'academic.bos-courses.edit',       true,
    'academic.bos-courses.import',     true,
    'academic.bos-scheme.view',        true,
    'academic.bos-scheme.edit',        true
  ),
  updated_at = NOW()
WHERE role_key = 'hod';

-- ============================================================================
-- Step 2: Principal — replace nested syllabi object with flat syllabus keys
-- ============================================================================
-- Principal had: "academic.bos-syllabi": {"view": true, "export": true}
-- The hook only reads flat keys (value === true), so the nested format never
-- granted access. Removed the nested key, added flat keys + courses/scheme view.

UPDATE public.custom_roles
SET
  permissions = (
    permissions
    - 'academic.bos-syllabi'
    - 'academic.bos-syllabi.view'
    - 'academic.bos-syllabi.export'
  ) || jsonb_build_object(
    'academic.bos-syllabus.view',   true,
    'academic.bos-syllabus.export', true,
    'academic.bos-courses.view',    true,
    'academic.bos-scheme.view',     true
  ),
  updated_at = NOW()
WHERE role_key = 'principal';

-- ============================================================================
-- Step 3: Insert Facilitator role (did not exist in custom_roles)
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
  'facilitator',
  'Facilitator',
  'Academic facilitator with ability to create and edit syllabi and participate in BOS meetings.',
  true,
  true,
  'own',
  jsonb_build_object(
    'academic.bos-syllabus.view',   true,
    'academic.bos-syllabus.create', true,
    'academic.bos-syllabus.edit',   true,
    'academic.bos-syllabus.export', true,
    'academic.bos-taxonomy.view',   true,
    'academic.bos-experts.view',    true,
    'academic.bos-compositions.view', true,
    'academic.bos-meetings.view',   true,
    'academic.bos-courses.view',    true,
    'academic.bos-courses.create',  true,
    'academic.bos-courses.edit',    true,
    'academic.bos-scheme.view',     true,
    'academic.bos-reports.view',    true,
    'academic.bos-ta-da.view',      true,
    'academic.bos-ta-da.submit',    true
  ),
  '{}'::jsonb
)
ON CONFLICT (role_key) DO UPDATE
SET
  is_active   = true,
  permissions = EXCLUDED.permissions,
  updated_at  = NOW();

-- ============================================================================
-- Step 4: Backfill user_roles for facilitator users missing a role assignment
-- ============================================================================

INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at)
SELECT
  p.id       AS user_id,
  cr.id      AS role_id,
  true       AS is_primary,
  COALESCE(p.created_at, NOW()) AS assigned_at
FROM profiles p
INNER JOIN custom_roles cr ON cr.role_key = p.role
WHERE p.role = 'facilitator'
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = cr.id
  );

COMMIT;
