-- Migration: Add School Principal + School Facilitator roles (permission parity copies)
-- Reason: Create two new roles that inherit ALL permissions currently assigned to
--         their source system roles:
--           school_principal  ← copy of principal  ("School Principal")
--           school_faculty    ← copy of faculty    ("School Facilitator")
--
--         Permissions live in custom_roles.permissions (JSONB), so "copy all
--         permissions" is a column copy. We INSERT ... SELECT directly from the
--         source row so we capture the LIVE permission set (which has drifted from
--         older seed migrations via UI edits + the syllabi→syllabus rename) rather
--         than re-typing keys that could go stale. institution_scope and
--         module_scopes are copied too, since they also shape access.
--
--         ON CONFLICT (role_key) DO UPDATE makes this idempotent: re-running
--         re-syncs the derived role to its source, preserving parity over time.
-- Date: 2026-06-08

BEGIN;

-- ============================================================================
-- School Principal  ← principal
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
)
SELECT
  'school_principal',
  'School Principal',
  'School-level institution head. Inherits all permissions from the Principal role.',
  src.is_system_role,
  src.is_active,
  src.institution_scope,
  src.permissions,
  src.module_scopes
FROM public.custom_roles src
WHERE src.role_key = 'principal'
ON CONFLICT (role_key) DO UPDATE
SET
  permissions       = EXCLUDED.permissions,
  institution_scope = EXCLUDED.institution_scope,
  module_scopes     = EXCLUDED.module_scopes,
  is_active         = EXCLUDED.is_active,
  updated_at        = NOW();

-- ============================================================================
-- School Facilitator  ← faculty
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
)
SELECT
  'school_faculty',
  'School Facilitator',
  'School-level facilitator. Inherits all permissions from the Faculty role.',
  src.is_system_role,
  src.is_active,
  src.institution_scope,
  src.permissions,
  src.module_scopes
FROM public.custom_roles src
WHERE src.role_key = 'faculty'
ON CONFLICT (role_key) DO UPDATE
SET
  permissions       = EXCLUDED.permissions,
  institution_scope = EXCLUDED.institution_scope,
  module_scopes     = EXCLUDED.module_scopes,
  is_active         = EXCLUDED.is_active,
  updated_at        = NOW();

-- ============================================================================
-- Parity assertion — fails the migration if either copy is incomplete
-- ============================================================================
DO $$
DECLARE
  mismatch_count INT;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM (
    SELECT 'school_principal' AS tgt, 'principal' AS srt
    UNION ALL
    SELECT 'school_faculty', 'faculty'
  ) m
  JOIN public.custom_roles t ON t.role_key = m.tgt
  JOIN public.custom_roles s ON s.role_key = m.srt
  WHERE t.permissions       IS DISTINCT FROM s.permissions
     OR t.institution_scope IS DISTINCT FROM s.institution_scope
     OR t.module_scopes     IS DISTINCT FROM s.module_scopes;

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Permission parity check failed for % derived role(s)', mismatch_count;
  END IF;
END $$;

COMMIT;
