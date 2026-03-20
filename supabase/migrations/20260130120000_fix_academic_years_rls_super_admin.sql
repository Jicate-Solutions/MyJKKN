-- ============================================================================
-- Migration: Fix Academic Years RLS Policies for Super Admin Access
-- Date: 2026-01-30
-- Description: Allow super admins to create/update/delete academic years for any institution
-- Issue: Super admins without institution_id were blocked by RLS policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "academic_years_insert_by_role" ON academic_years;
DROP POLICY IF EXISTS "academic_years_update_by_role" ON academic_years;
DROP POLICY IF EXISTS "academic_years_delete_by_role" ON academic_years;

-- Drop the broken trigger (references non-existent function)
DROP TRIGGER IF EXISTS trigger_auto_populate_academic_year_institution ON academic_years;

-- Recreate INSERT policy with super admin bypass
CREATE POLICY "academic_years_insert_by_role" ON academic_years
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR (cr.permissions->>'academic.years.create')::boolean = true
            )
            AND (
                -- Super admins can create for any institution
                p.role = 'super_admin'
                OR
                -- Other users must create for their own institution
                institution_id = get_current_user_institution_id()
            )
        )
    );

-- Recreate UPDATE policy with super admin bypass
CREATE POLICY "academic_years_update_by_role" ON academic_years
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR (cr.permissions->>'academic.years.edit')::boolean = true
            )
            AND (
                -- Super admins can update any institution's data
                p.role = 'super_admin'
                OR
                -- Other users can only update their own institution's data
                institution_id = get_current_user_institution_id()
            )
        )
    );

-- Recreate DELETE policy with super admin bypass
CREATE POLICY "academic_years_delete_by_role" ON academic_years
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR (cr.permissions->>'academic.years.delete')::boolean = true
            )
            AND (
                -- Super admins can delete any institution's data
                p.role = 'super_admin'
                OR
                -- Other users can only delete their own institution's data
                institution_id = get_current_user_institution_id()
            )
        )
    );

-- Add comment for documentation
COMMENT ON POLICY "academic_years_insert_by_role" ON academic_years IS
    'Allows super admins to create academic years for any institution. Other users can only create for their own institution.';

COMMENT ON POLICY "academic_years_update_by_role" ON academic_years IS
    'Allows super admins to update academic years for any institution. Other users can only update their own institution data.';

COMMENT ON POLICY "academic_years_delete_by_role" ON academic_years IS
    'Allows super admins to delete academic years for any institution. Other users can only delete their own institution data.';
