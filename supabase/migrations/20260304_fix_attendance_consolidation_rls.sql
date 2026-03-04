-- =====================================================
-- FIX: ATTENDANCE CONSOLIDATION REPORTS RLS POLICIES
-- =====================================================
-- Purpose: Fix two RLS policy bugs:
--   1. Super admins could not see reports created by other super admins
--      (SELECT policy only checked user_institution_access, not role)
--   2. Admission role users could not create reports
--      (INSERT policy excluded 'admission' role)
-- Fixed: 2026-03-04
-- =====================================================

-- -------------------------------------------------------
-- FIX 1: Super admins can view ALL consolidation reports
-- The existing SELECT policy only shows reports for
-- institutions in user_institution_access. Super admins
-- need to see all reports across all institutions.
-- -------------------------------------------------------
CREATE POLICY "Super admins can view all consolidation reports"
    ON public.attendance_consolidation_reports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

-- -------------------------------------------------------
-- FIX 2: Add 'admission' role to the INSERT policy
-- Drop and recreate the INSERT policy to include 'admission'
-- -------------------------------------------------------
DROP POLICY IF EXISTS "HOD and Admins can create consolidation reports"
    ON public.attendance_consolidation_reports;

CREATE POLICY "HOD and Admins can create consolidation reports"
    ON public.attendance_consolidation_reports
    FOR INSERT
    WITH CHECK (
        institution_id IN (
            SELECT uia.institution_id
            FROM public.user_institution_access uia
            JOIN public.profiles p ON p.id = uia.user_id
            WHERE uia.user_id = auth.uid()
            AND uia.is_active = true
            AND p.role IN ('super_admin', 'admin', 'hod', 'principal', 'admission')
        )
    );
