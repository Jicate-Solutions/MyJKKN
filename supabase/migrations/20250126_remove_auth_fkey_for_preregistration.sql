-- Remove foreign key constraint to allow pre-registration
-- Date: 2025-01-26
-- Purpose: Allow creating profiles without corresponding auth.users entries for pre-registration

-- First, check what foreign key constraints exist
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find and drop the foreign key constraint linking profiles.id to auth.users.id
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
    AND confrelid = 'auth.users'::regclass
    AND contype = 'f';
    
    IF constraint_name IS NOT NULL THEN
        RAISE NOTICE 'Dropping foreign key constraint: %', constraint_name;
        EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_name);
    ELSE
        RAISE NOTICE 'No foreign key constraint found between profiles and auth.users';
    END IF;
END $$;

-- The profiles_id_fkey constraint enforces that profiles.id must exist in auth.users.id
-- By removing this, we can create pre-registered profiles with any UUID
-- The link_pre_registered_profile trigger will handle linking when users actually sign up

-- Add a partial unique constraint on email for non-pre-registered profiles
-- This ensures email uniqueness for active profiles while allowing pre-registered duplicates during migration
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique_active
ON public.profiles(email)
WHERE is_pre_registered = FALSE;

-- Add a check to ensure pre-registered profiles have valid UUIDs
ALTER TABLE public.profiles
ADD CONSTRAINT check_profile_id_is_uuid
CHECK (id IS NOT NULL AND id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Create a function to validate profile operations
CREATE OR REPLACE FUNCTION public.validate_profile_operation()
RETURNS TRIGGER AS $$
BEGIN
    -- For non-pre-registered profiles, ensure they have a corresponding auth user
    IF NEW.is_pre_registered = FALSE THEN
        -- Check if auth user exists (only for non-service role operations)
        IF auth.jwt() ->> 'role' != 'service_role' AND NOT EXISTS (
            SELECT 1 FROM auth.users WHERE id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Profile must have corresponding auth user for non-pre-registered profiles';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to validate profile operations
DROP TRIGGER IF EXISTS validate_profile_operation_trigger ON public.profiles;
CREATE TRIGGER validate_profile_operation_trigger
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_profile_operation();

-- Add comment explaining the design
COMMENT ON TABLE public.profiles IS 'User profiles table that supports both authenticated users and pre-registered profiles. Pre-registered profiles (is_pre_registered=TRUE) can exist without auth.users entries and will be linked when users sign up with Google OAuth.';

-- Verify the changes
DO $$
BEGIN
    RAISE NOTICE 'Foreign key constraints removed. Pre-registration is now enabled.';
    RAISE NOTICE 'Profiles can now be created with is_pre_registered=TRUE without auth.users entries.';
    RAISE NOTICE 'When users sign up with Google OAuth, the link_pre_registered_profile trigger will link them.';
END $$;