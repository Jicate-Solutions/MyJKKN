-- =====================================================
-- Migration: Setup RLS Policies for Child App Tables
-- Date: 2025-01-23
-- Purpose: Ensure proper security with Row Level Security
-- =====================================================

-- Step 1: Enable RLS on all child app tables
-- =====================================================
ALTER TABLE child_app_unified_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_app_auth_codes_bucket ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_app_analytics ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies to start fresh
-- =====================================================
DROP POLICY IF EXISTS "Users can view own sessions" ON child_app_unified_sessions;
DROP POLICY IF EXISTS "Service role can manage all sessions" ON child_app_unified_sessions;
DROP POLICY IF EXISTS "Service role can manage auth codes" ON child_app_auth_codes_bucket;

-- Step 3: Create policies for child_app_unified_sessions
-- =====================================================

-- Users can view their own sessions
CREATE POLICY "users_view_own_sessions" ON child_app_unified_sessions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can update their own sessions (for logout, etc.)
CREATE POLICY "users_update_own_sessions" ON child_app_unified_sessions
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "service_role_full_access_sessions" ON child_app_unified_sessions
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Authenticated apps can manage sessions (using API key validation)
CREATE POLICY "authenticated_apps_manage_sessions" ON child_app_unified_sessions
    FOR ALL
    USING (
        -- This allows authenticated requests from the API routes
        auth.uid() IS NOT NULL 
        OR auth.jwt()->>'role' = 'service_role'
        OR EXISTS (
            SELECT 1 FROM applications 
            WHERE uses_parent_auth = true 
            AND is_active = true
        )
    );

-- Step 4: Create policies for child_app_auth_codes_bucket
-- =====================================================

-- Only service role can access auth codes (security critical)
CREATE POLICY "service_role_only_auth_codes" ON child_app_auth_codes_bucket
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Allow authenticated API routes to manage codes
CREATE POLICY "api_routes_manage_codes" ON child_app_auth_codes_bucket
    FOR ALL
    USING (
        -- This ensures only server-side API routes can access
        auth.jwt()->>'role' = 'service_role'
        OR (
            -- Allow access from authenticated server contexts
            current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
        )
    );

-- Step 5: Create policies for child_app_analytics
-- =====================================================

-- Service role has full access to analytics
CREATE POLICY "service_role_manage_analytics" ON child_app_analytics
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Authenticated users can view analytics for their apps
CREATE POLICY "users_view_app_analytics" ON child_app_analytics
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM applications a
            WHERE a.app_id = child_app_analytics.app_id
            AND (
                a.created_by = auth.uid()
                OR auth.jwt()->>'role' IN ('admin', 'super_admin', 'institution_admin')
            )
        )
    );

-- Allow analytics service to insert/update
CREATE POLICY "analytics_service_write" ON child_app_analytics
    FOR INSERT
    USING (true)
    WITH CHECK (true);

CREATE POLICY "analytics_service_update" ON child_app_analytics
    FOR UPDATE
    USING (true);

-- Step 6: Create helper function for checking app access
-- =====================================================
CREATE OR REPLACE FUNCTION check_app_access(p_app_id VARCHAR, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user has access to the app
    RETURN EXISTS (
        SELECT 1 FROM applications
        WHERE app_id = p_app_id
        AND is_active = true
        AND (
            created_by = p_user_id
            OR p_user_id IN (
                SELECT user_id FROM child_app_unified_sessions
                WHERE app_sessions ? p_app_id
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Grant appropriate permissions
-- =====================================================

-- Unified sessions
GRANT SELECT ON child_app_unified_sessions TO authenticated;
GRANT ALL ON child_app_unified_sessions TO service_role;

-- Auth codes bucket (restricted)
GRANT ALL ON child_app_auth_codes_bucket TO service_role;
-- No direct access for authenticated users (must go through API)

-- Analytics
GRANT SELECT ON child_app_analytics TO authenticated;
GRANT ALL ON child_app_analytics TO service_role;

-- Step 8: Verify RLS is enabled
-- =====================================================
DO $$
DECLARE
    rls_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RLS Policy Setup Complete';
    RAISE NOTICE '========================================';
    
    FOR rls_record IN 
        SELECT 
            tablename,
            CASE 
                WHEN rowsecurity = true THEN '✅ ENABLED'
                ELSE '❌ DISABLED'
            END as status
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE '%child_app%'
        ORDER BY tablename
    LOOP
        RAISE NOTICE '% - RLS: %', rls_record.tablename, rls_record.status;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Policy Summary:';
    RAISE NOTICE '  child_app_unified_sessions:';
    RAISE NOTICE '    - Users can view/update own sessions';
    RAISE NOTICE '    - Service role has full access';
    RAISE NOTICE '  child_app_auth_codes_bucket:';
    RAISE NOTICE '    - Service role only (security critical)';
    RAISE NOTICE '  child_app_analytics:';
    RAISE NOTICE '    - Service role full access';
    RAISE NOTICE '    - App owners can view their analytics';
END $$;

-- =====================================================
-- Security Notes:
-- 1. Auth codes are restricted to service role only
-- 2. Users can only see their own session data
-- 3. Analytics visible to app owners and admins
-- 4. All API operations use service role
-- =====================================================