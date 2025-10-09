-- =====================================================
-- Migration: Fix Billing Module Access Type Issue
-- Date: 2025-10-09
-- Issue: Users with 'accounts' role have access_type='billing_only'
--        but RLS policies check for 'billing'
-- =====================================================

-- =====================================================
-- PART 1: Update Access Type for Billing Users
-- =====================================================

-- Update all users with 'billing_only' to 'billing'
-- This aligns with the RLS policy expectations
UPDATE user_institution_access
SET
    access_type = 'billing',
    updated_at = NOW()
WHERE access_type = 'billing_only'
AND is_active = true;

-- Log the changes
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % user institution access records from billing_only to billing', updated_count;
END $$;

-- =====================================================
-- PART 2: Fix Students Table RLS Policy (Security Enhancement)
-- =====================================================

-- Drop the overly permissive students_select_institution policy
DROP POLICY IF EXISTS "students_select_institution" ON students;

-- Create a new, more secure policy that checks access_type
CREATE POLICY "students_select_institution" ON students
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'read', 'billing', 'full', 'super_admin')
            AND is_active = true
        )
    );

COMMENT ON POLICY "students_select_institution" ON students IS
'Updated: 2025-10-09 - Added access_type check for better security.
Previous version only checked is_active, which was too permissive.
Now requires specific access types to view students.';

-- =====================================================
-- PART 3: Add Additional Security for Sections/Programs (Optional but Recommended)
-- =====================================================

-- These tables are also used by billing module to filter students
-- Ensure billing users can see sections and programs

DROP POLICY IF EXISTS "sections_select_institution" ON sections;
CREATE POLICY "sections_select_institution" ON sections
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'read', 'billing', 'full', 'super_admin')
            AND is_active = true
        )
    );

DROP POLICY IF EXISTS "programs_select_institution" ON programs;
CREATE POLICY "programs_select_institution" ON programs
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'read', 'billing', 'full', 'super_admin')
            AND is_active = true
        )
    );

-- =====================================================
-- PART 4: Verification Query
-- =====================================================

-- Verify the changes
DO $$
DECLARE
    billing_users_count INTEGER;
    billing_only_users_count INTEGER;
BEGIN
    -- Count users with 'billing' access
    SELECT COUNT(*) INTO billing_users_count
    FROM user_institution_access
    WHERE access_type = 'billing' AND is_active = true;

    -- Count any remaining 'billing_only' users (should be 0)
    SELECT COUNT(*) INTO billing_only_users_count
    FROM user_institution_access
    WHERE access_type = 'billing_only' AND is_active = true;

    RAISE NOTICE '=== Migration Verification ===';
    RAISE NOTICE 'Users with billing access: %', billing_users_count;
    RAISE NOTICE 'Users with billing_only access (should be 0): %', billing_only_users_count;

    IF billing_only_users_count > 0 THEN
        RAISE WARNING 'Still have % users with billing_only access!', billing_only_users_count;
    ELSE
        RAISE NOTICE '✓ Migration successful - all billing_only users converted to billing';
    END IF;
END $$;

-- =====================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =====================================================

-- To rollback this migration, run:
/*
UPDATE user_institution_access
SET access_type = 'billing_only'
WHERE access_type = 'billing'
AND is_active = true;

-- Restore old students policy
DROP POLICY IF EXISTS "students_select_institution" ON students;
CREATE POLICY "students_select_institution" ON students
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );
*/

-- =====================================================
-- End of Migration
-- =====================================================
