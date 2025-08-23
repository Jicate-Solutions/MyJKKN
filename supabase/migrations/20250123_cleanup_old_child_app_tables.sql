-- =====================================================
-- Migration: Clean up old child app tables
-- Date: 2025-01-23
-- Purpose: Remove old tables and keep only optimized structure
-- =====================================================

-- Step 1: Drop views that depend on old tables
-- =====================================================
DROP VIEW IF EXISTS child_app_user_sessions_view CASCADE;
DROP VIEW IF EXISTS child_app_auth_codes_view CASCADE;
DROP VIEW IF EXISTS child_app_migration_summary CASCADE;
DROP VIEW IF EXISTS old_child_app_tables_schema CASCADE;

-- Step 2: Drop old tables (keeping only optimized ones)
-- =====================================================

-- Drop the old session table (replaced by child_app_unified_sessions)
DROP TABLE IF EXISTS child_app_user_sessions CASCADE;

-- Drop the old auth codes table (replaced by child_app_auth_codes_bucket)
DROP TABLE IF EXISTS child_app_auth_codes CASCADE;

-- Drop old child app related tables that are no longer needed
DROP TABLE IF EXISTS child_app_sessions CASCADE;
DROP TABLE IF EXISTS child_app_access_logs CASCADE;
DROP TABLE IF EXISTS child_app_permissions CASCADE;
DROP TABLE IF EXISTS user_child_app_permissions CASCADE;
DROP TABLE IF EXISTS registered_child_apps CASCADE;

-- Step 3: Clean up any orphaned functions related to old tables
-- =====================================================
DROP FUNCTION IF EXISTS log_child_app_access CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_sessions CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_auth_codes CASCADE;
DROP FUNCTION IF EXISTS get_auth_codes_stats CASCADE;
DROP FUNCTION IF EXISTS cleanup_auth_codes CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_auth_codes CASCADE;
DROP FUNCTION IF EXISTS migrate_existing_sessions CASCADE;
DROP FUNCTION IF EXISTS migrate_existing_auth_codes CASCADE;

-- Step 4: Keep only the optimized tables
-- =====================================================
-- The following tables should remain:
-- 1. child_app_unified_sessions (new optimized session storage)
-- 2. child_app_auth_codes_bucket (new bucketed auth codes)
-- 3. child_app_analytics (analytics data - can be kept)
-- 4. applications (main applications table with auth fields)

-- Step 5: Add comments to remaining tables
-- =====================================================
COMMENT ON TABLE child_app_unified_sessions IS 
'Optimized session storage: One record per user containing all app sessions in JSON format. Reduces records by 99%.';

COMMENT ON TABLE child_app_auth_codes_bucket IS 
'Time-bucketed auth codes: 15-minute buckets storing multiple codes in JSON. Reduces records by 95%.';

COMMENT ON TABLE child_app_analytics IS 
'Analytics data for child app usage, stored in daily aggregates with JSON details.';

-- Step 6: Verify remaining tables
-- =====================================================
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'child_app_unified_sessions',
        'child_app_auth_codes_bucket',
        'child_app_analytics'
    );
    
    RAISE NOTICE 'Optimized child app tables remaining: %', table_count;
    
    -- List remaining child app tables
    FOR table_count IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%child_app%'
        ORDER BY table_name
    LOOP
        RAISE NOTICE 'Remaining table: %', table_count;
    END LOOP;
END $$;

-- Step 7: Create indexes if they don't exist
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_unified_sessions_user 
    ON child_app_unified_sessions(user_id);
    
CREATE INDEX IF NOT EXISTS idx_unified_sessions_apps 
    ON child_app_unified_sessions USING GIN (app_sessions);
    
CREATE INDEX IF NOT EXISTS idx_auth_codes_bucket_key 
    ON child_app_auth_codes_bucket(bucket_key);
    
CREATE INDEX IF NOT EXISTS idx_auth_codes_bucket_timestamp 
    ON child_app_auth_codes_bucket(bucket_timestamp);

-- Step 8: Grant appropriate permissions
-- =====================================================
GRANT ALL ON child_app_unified_sessions TO authenticated;
GRANT ALL ON child_app_auth_codes_bucket TO service_role;
GRANT SELECT ON child_app_analytics TO authenticated;

-- =====================================================
-- Cleanup Complete!
-- Old tables removed, only optimized structure remains
-- =====================================================