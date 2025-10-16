-- Migration: Rollback broken RLS policies that query auth.users
-- Created: 2025-10-15
-- Issue: Policies trying to query auth.users cause "permission denied" errors (42501)
-- Root Cause: Regular authenticated users cannot access auth.users table
-- Solution: Remove problematic policies and use alternative approach

-- ================================================================================
-- STEP 1: Drop the broken policies
-- ================================================================================

DROP POLICY IF EXISTS "profiles_select_own_by_email" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_by_email" ON profiles;

-- ================================================================================
-- STEP 2: Add policy to allow profile migration by service role
-- ================================================================================

-- This policy allows the application service role to manage pre-registered profiles
-- during the OAuth callback process
DROP POLICY IF EXISTS "profiles_service_role_access" ON profiles;

CREATE POLICY "profiles_service_role_access" ON profiles
    FOR ALL USING (
        -- Allow if this is a service role operation (bypass RLS)
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
        OR
        -- Or if this is the user's own profile
        auth.uid() = id
    );

COMMENT ON POLICY "profiles_service_role_access" ON profiles IS
'Allows service role to manage profiles during OAuth migration, and users to access their own profiles';
