-- Migration: Fix staff-to-profile sync by allowing trigger to insert pre-registered profiles
-- Created: 2025-10-15
-- Issue: Staff created with institution_email but profile not created in profiles table
-- Root Cause: RLS policy blocks trigger from inserting profiles with is_pre_registered=true
-- Solution: Add policy to allow INSERT when is_pre_registered=true

-- Drop existing policy if it exists (safe to ignore error if not exists)
DROP POLICY IF EXISTS "profiles_insert_preregistered" ON profiles;

-- Add new policy to allow pre-registered profile creation
CREATE POLICY "profiles_insert_preregistered" ON profiles
    FOR INSERT WITH CHECK (is_pre_registered = true);

-- Add comment to document the fix
COMMENT ON POLICY "profiles_insert_preregistered" ON profiles IS
'Allows sync_staff_to_profiles() trigger to create pre-registered profiles - fixes staff profile sync issue';
