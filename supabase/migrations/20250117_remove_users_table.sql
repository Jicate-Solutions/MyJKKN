-- ================================================================================
-- MIGRATION: Remove Redundant Users Table
-- Date: 2025-01-17
-- Description: Removes the users table as it's redundant with profiles table
-- ================================================================================

BEGIN;

-- Drop the users table if it exists
-- This table only has 5 duplicate records that already exist in profiles
-- No foreign keys reference this table
DROP TABLE IF EXISTS public.users CASCADE;

-- Log this migration
INSERT INTO migration_log (migration_name, applied_by, metadata)
VALUES (
    '20250117_remove_users_table',
    auth.uid(),
    jsonb_build_object(
        'description', 'Removed redundant users table - profiles table is the main user management table',
        'records_affected', 5,
        'reason', 'All user management is handled through profiles table which integrates with auth.users'
    )
) ON CONFLICT (migration_name) DO NOTHING;

COMMIT;

-- ================================================================================
-- ROLLBACK SCRIPT (if needed)
-- ================================================================================
/*
BEGIN;

-- Recreate the users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,  
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Update migration log
UPDATE migration_log 
SET rollback_at = NOW(), 
    rollback_by = auth.uid(),
    status = 'rolled_back'
WHERE migration_name = '20250117_remove_users_table';

COMMIT;
*/