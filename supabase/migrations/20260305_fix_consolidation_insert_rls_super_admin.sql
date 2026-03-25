-- =====================================================
-- FIX: ATTENDANCE CONSOLIDATION REPORTS INSERT RLS
-- =====================================================
-- Problem: Super admins have 0 rows in user_institution_access.
--          The INSERT policy checks institution_id through that
--          table for ALL roles including super_admin, so super
--          admins always fail the RLS check with error 42501.
--
-- Root cause: The 20260304 fix added 'admission' role to INSERT
--             but did NOT add a super_admin bypass (unlike the
--             SELECT policy which was properly fixed with a
--             standalone bypass policy).
--
-- Fix: Drop and recreate the INSERT policy so super_admins
--      bypass user_institution_access entirely.
--
-- Fixed: 2026-03-05
-- =====================================================

DROP POLICY IF EXISTS "HOD and Admins can create consolidation reports"
    ON public.attendance_consolidation_reports;

CREATE POLICY "HOD and Admins can create consolidation reports"
    ON public.attendance_consolidation_reports
    FOR INSERT
    WITH CHECK (
        -- Super admins can create reports for any institution
        -- (they have no user_institution_access rows by design)
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
        OR
        -- All other allowed roles must have active institution access
        institution_id IN (
            SELECT uia.institution_id
            FROM public.user_institution_access uia
            JOIN public.profiles p ON p.id = uia.user_id
            WHERE uia.user_id = auth.uid()
            AND uia.is_active = true
            AND p.role IN ('admin', 'hod', 'principal', 'admission')
        )
    );
