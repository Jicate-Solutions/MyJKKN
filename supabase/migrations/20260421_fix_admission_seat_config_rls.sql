-- Migration: Fix Admission Seat Configuration RLS visibility
-- Date: 2026-04-21
-- Reason:
--   Admission CRM → Settings → Seat Configuration page reads programs
--   joined with degrees and departments, and lists institutions in a
--   filter dropdown. The live SELECT policies on those tables require
--   organizations.*.view permissions AND own-institution match, which:
--     (a) excludes custom admission roles that only hold
--         admission.settings.seats.view / admission.settings.seats.manage
--     (b) excludes scope='all' admission/counselor roles that should
--         legitimately see cross-institution data for seat planning
--
--   This migration aligns the live database with the already-authored
--   updates in supabase/setup/03_policies.sql by broadening the SELECT
--   clause to also accept:
--     - role_has_institution_access(institution_id)  -- scope='all' alone
--     - admission.settings.seats.view / .manage      -- seat-config users
--
--   INSERT / UPDATE / DELETE on these tables remain unchanged — write
--   access is still gated by organizations.*.create/edit/delete.

-- ============================================================================
-- PROGRAMS
-- ============================================================================
DROP POLICY IF EXISTS "programs_select_permission" ON programs;
DROP POLICY IF EXISTS "programs_select_by_role"    ON programs;

CREATE POLICY "programs_select_by_role" ON programs
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR role_has_institution_access(institution_id)
        OR user_has_permission('organizations.programs.view')
        OR user_has_permission('admission.settings.seats.view')
        OR user_has_permission('admission.settings.seats.manage')
    );

-- ============================================================================
-- DEGREES
-- ============================================================================
DROP POLICY IF EXISTS "degrees_select_permission" ON degrees;
DROP POLICY IF EXISTS "degrees_select_by_role"    ON degrees;

CREATE POLICY "degrees_select_by_role" ON degrees
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR role_has_institution_access(institution_id)
        OR user_has_permission('organizations.degrees.view')
        OR user_has_permission('admission.settings.seats.view')
        OR user_has_permission('admission.settings.seats.manage')
    );

-- ============================================================================
-- DEPARTMENTS
-- ============================================================================
DROP POLICY IF EXISTS "departments_select_permission" ON departments;
DROP POLICY IF EXISTS "departments_select_by_role"    ON departments;

CREATE POLICY "departments_select_by_role" ON departments
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR role_has_institution_access(institution_id)
        OR user_has_permission('organizations.departments.view')
        OR user_has_permission('admission.settings.seats.view')
        OR user_has_permission('admission.settings.seats.manage')
    );

-- ============================================================================
-- INSTITUTIONS
-- ============================================================================
DROP POLICY IF EXISTS "institutions_select_permission" ON institutions;
DROP POLICY IF EXISTS "institutions_select_by_role"    ON institutions;

CREATE POLICY "institutions_select_by_role" ON institutions
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR role_has_institution_access(id)
        OR user_has_permission('organizations.institutions.view')
        OR user_has_permission('admission.settings.seats.view')
        OR user_has_permission('admission.settings.seats.manage')
    );
