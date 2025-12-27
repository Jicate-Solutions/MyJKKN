-- ============================================
-- Migration: Add System Role Support to custom_roles
-- Created: 2025-12-27
-- Purpose: Add role_key and is_system_role columns for student role management
-- ============================================

-- Add role_key and is_system_role columns to custom_roles table
ALTER TABLE public.custom_roles
ADD COLUMN IF NOT EXISTS role_key VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_system_role BOOLEAN DEFAULT false;

-- Create unique constraint on institution_id + role_key
-- This ensures each institution can have only one role with a given key
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_roles_institution_role_key
ON public.custom_roles(institution_id, role_key);

-- Add helpful comments
COMMENT ON COLUMN custom_roles.role_key IS 'Unique identifier for the role (e.g., student, faculty, admin). Used for programmatic role lookup.';
COMMENT ON COLUMN custom_roles.is_system_role IS 'True for system-managed roles (student, super_admin, etc.) that cannot be deleted by users.';

-- Migrate existing roles: Generate role_key from role_name
-- This handles any existing custom roles in the database
UPDATE public.custom_roles
SET role_key = LOWER(REPLACE(role_name, ' ', '_'))
WHERE role_key IS NULL;

-- Make role_key NOT NULL after migration
ALTER TABLE public.custom_roles
ALTER COLUMN role_key SET NOT NULL;

-- Create index for faster role lookups by role_key
CREATE INDEX IF NOT EXISTS idx_custom_roles_role_key
ON public.custom_roles(role_key)
WHERE is_system_role = true;

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Added role_key and is_system_role columns to custom_roles table';
END $$;
