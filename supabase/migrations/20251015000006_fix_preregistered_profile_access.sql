-- Migration: Fix pre-registered profile access for Google OAuth login
-- Created: 2025-10-15
-- Issue:
--   1. 406 errors when pre-registered users try to access their profiles
--   2. 409 conflict when trying to link pre-registered profiles to Google auth
-- Root Cause:
--   - Pre-registered profiles have random UUID as id
--   - Google auth users have different UUID (auth.uid())
--   - RLS policies only check by id, not by email
--   - Profile migration tries to INSERT when profile already exists
-- Solution:
--   1. Add RLS policy to allow users to SELECT profiles by their email
--   2. Add RLS policy to allow users to UPDATE profiles by their email
--   3. Fix email-based profile access for pre-registered users

-- ================================================================================
-- STEP 1: Add policy to allow users to SELECT their own profile by email
-- ================================================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "profiles_select_own_by_email" ON profiles;

-- Create policy to allow authenticated users to read profiles matching their auth email
CREATE POLICY "profiles_select_own_by_email" ON profiles
    FOR SELECT USING (
        auth.uid() IS NOT NULL
        AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

COMMENT ON POLICY "profiles_select_own_by_email" ON profiles IS
'Allows authenticated users to read their own profile by matching email address - fixes pre-registered profile access';

-- ================================================================================
-- STEP 2: Add policy to allow users to UPDATE their own profile by email
-- ================================================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "profiles_update_own_by_email" ON profiles;

-- Create policy to allow authenticated users to update profiles matching their auth email
-- This is needed for profile migration and profile completion
CREATE POLICY "profiles_update_own_by_email" ON profiles
    FOR UPDATE USING (
        auth.uid() IS NOT NULL
        AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

COMMENT ON POLICY "profiles_update_own_by_email" ON profiles IS
'Allows authenticated users to update their own profile by matching email address - fixes profile completion for pre-registered users';

-- ================================================================================
-- STEP 3: Verify policies are applied correctly
-- ================================================================================

-- List all policies on profiles table
SELECT
    polname as policy_name,
    pg_get_expr(polqual, polrelid) as using_expression,
    pg_get_expr(polwithcheck, polrelid) as with_check_expression
FROM pg_policy
WHERE polrelid = 'profiles'::regclass
ORDER BY polname;
