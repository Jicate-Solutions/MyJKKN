-- Migration: Fix Staff RLS Performance Issues for HOD Users
-- Created: 2025-10-16
-- Issue: Complex RLS policies with repeated subqueries cause statement timeout (57014)
-- Root Cause: "Enhanced" policies query profiles table for EVERY row causing hundreds of subqueries
-- Solution: Replace with simple, index-optimized policies using user_institution_access

-- ================================================================================
-- STEP 1: Drop the problematic "Enhanced" policies
-- ================================================================================

DROP POLICY IF EXISTS "Enhanced staff view access with institution filtering" ON staff;
DROP POLICY IF EXISTS "Enhanced staff create access with institution validation" ON staff;
DROP POLICY IF EXISTS "Enhanced staff update access with institution validation" ON staff;
DROP POLICY IF EXISTS "Enhanced staff delete access with institution validation" ON staff;
DROP POLICY IF EXISTS "super_admin_staff_create_bypass" ON staff;
DROP POLICY IF EXISTS "service_role_staff_bypass" ON staff;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "staff_select_institution" ON staff;
DROP POLICY IF EXISTS "staff_insert_admin" ON staff;
DROP POLICY IF EXISTS "staff_update_admin" ON staff;
DROP POLICY IF EXISTS "staff_delete_admin" ON staff;

-- ================================================================================
-- STEP 2: Create optimized policies using user_institution_access
-- ================================================================================

-- SELECT Policy: Allow users to view staff from institutions they have access to
-- This uses the indexed user_institution_access table for optimal performance
CREATE POLICY "staff_select_by_institution_access" ON staff
    FOR SELECT USING (
        -- Super admins can see all staff
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        -- Users can see staff from institutions they have access to
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND is_active = true
        )
        OR
        -- Faculty can view their own staff record
        id = (
            SELECT id FROM staff
            WHERE email = auth.email()
            OR institution_email = auth.email()
            LIMIT 1
        )
    );

-- INSERT Policy: Allow users with write access to create staff
CREATE POLICY "staff_insert_by_access_type" ON staff
    FOR INSERT WITH CHECK (
        -- Super admins can create staff anywhere
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        -- Users with admin/write access can create staff in their institutions
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

-- UPDATE Policy: Allow users with write access to update staff
CREATE POLICY "staff_update_by_access_type" ON staff
    FOR UPDATE USING (
        -- Super admins can update any staff
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        -- Users with admin/write access can update staff in their institutions
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
        OR
        -- Faculty can update their own staff record
        id = (
            SELECT id FROM staff
            WHERE email = auth.email()
            OR institution_email = auth.email()
            LIMIT 1
        )
    );

-- DELETE Policy: Allow users with admin access to delete staff
CREATE POLICY "staff_delete_by_admin_access" ON staff
    FOR DELETE USING (
        -- Super admins can delete any staff
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        -- Users with admin access can delete staff in their institutions
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- Service Role Bypass: Allow service role to bypass all policies
CREATE POLICY "staff_service_role_full_access" ON staff
    FOR ALL USING (
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    );

-- ================================================================================
-- STEP 3: Verify indexes exist for optimal performance
-- ================================================================================

-- These indexes should already exist, but let's ensure they're there
CREATE INDEX IF NOT EXISTS idx_staff_institution_id ON staff(institution_id);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(email);
CREATE INDEX IF NOT EXISTS idx_staff_institution_email ON staff(institution_email);
CREATE INDEX IF NOT EXISTS idx_user_institution_access_user_id ON user_institution_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_institution_access_institution_id ON user_institution_access(institution_id);
CREATE INDEX IF NOT EXISTS idx_user_institution_access_composite ON user_institution_access(user_id, institution_id, is_active);

-- ================================================================================
-- STEP 4: Add comments for documentation
-- ================================================================================

COMMENT ON POLICY "staff_select_by_institution_access" ON staff IS
'Optimized SELECT policy using indexed user_institution_access table. No subqueries to profiles per row.';

COMMENT ON POLICY "staff_insert_by_access_type" ON staff IS
'Allows staff creation for users with write access to the institution.';

COMMENT ON POLICY "staff_update_by_access_type" ON staff IS
'Allows staff updates for users with write access, or for faculty updating their own record.';

COMMENT ON POLICY "staff_delete_by_admin_access" ON staff IS
'Restricts staff deletion to admin users only.';

-- ================================================================================
-- VERIFICATION
-- ================================================================================

-- Check that all policies are created correctly
SELECT
    schemaname,
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename = 'staff'
ORDER BY policyname;
