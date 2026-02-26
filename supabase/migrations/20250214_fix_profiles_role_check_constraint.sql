-- Migration: Fix profiles_role_check constraint
-- Date: 2025-02-14
-- Purpose: Update role constraint to include all application roles
-- Issue: Google OAuth login failing with constraint violation (HTTP 23514)
--
-- Original constraint only allowed: student, staff, admin, super_admin
-- Updated constraint includes: student, staff, admin, super_admin, administrator, faculty, hod, guest, driver

-- Drop the old constraint
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add updated constraint with all roles used in the application
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN (
  'student',
  'staff',
  'admin',
  'super_admin',
  'administrator',
  'faculty',
  'hod',
  'guest',
  'driver'
));

-- Verify the constraint was applied
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'profiles_role_check'
    ) THEN
        RAISE NOTICE 'profiles_role_check constraint updated successfully';
    ELSE
        RAISE EXCEPTION 'Failed to create profiles_role_check constraint';
    END IF;
END $$;
