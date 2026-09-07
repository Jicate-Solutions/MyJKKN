-- ================================================================================
-- MYJKKN ROW LEVEL SECURITY POLICIES
-- Generated: 2025-01-17
-- Description: Complete RLS policies for all tables
-- ================================================================================

-- ================================================================================
-- SECTION 1: PROFILE & USER TABLES
-- ================================================================================

-- PROFILES TABLE (Optimized policies)
-- Updated: 2025-12-15 - Fixed infinite recursion using security definer functions
-- Uses get_current_user_role(), can_user_manage_staff(), get_current_user_institution_id()
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies
CREATE POLICY "profiles_service_role_bypass" ON profiles
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "profiles_service_role_jwt_bypass" ON profiles
    FOR ALL USING ((SELECT auth.jwt()->>'role') = 'service_role');

-- SELECT policy - any authenticated user can view profiles
CREATE POLICY "profiles_select_policy" ON profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT policy - prevents infinite recursion by using security definer functions
CREATE POLICY "profiles_insert_policy" ON profiles
    FOR INSERT WITH CHECK (
        -- Users can insert their own profile (during signup)
        id = auth.uid()
        OR
        -- Users with staff management permission can insert profiles
        (
            can_user_manage_staff() = true
            AND
            -- Only for profiles in their institution (except super_admin)
            (
                get_current_user_role() = 'super_admin'
                OR
                institution_id = get_current_user_institution_id()
            )
        )
    );

-- Updated: 2025-10-15 - Allow trigger to insert pre-registered profiles
-- This policy enables sync_staff_to_profiles() trigger to create profiles
CREATE POLICY "profiles_insert_preregistered" ON profiles
    FOR INSERT WITH CHECK (is_pre_registered = true);

-- UPDATE policy - Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "profiles_update_policy" ON profiles
    FOR UPDATE USING (
        -- Users can update their own profile
        id = auth.uid()
        OR is_super_admin() OR is_admin()
        OR (
            institution_id = get_current_user_institution_id()
            AND user_has_permission('staff.edit')
        )
    );

-- DELETE policy - Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "profiles_delete_policy" ON profiles
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (
            institution_id = get_current_user_institution_id()
            AND user_has_permission('staff.delete')
            AND id != auth.uid()  -- Cannot delete own profile
        )
    );

-- USERS TABLE (1 policy)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_all_authenticated" ON users
    FOR ALL USING (auth.uid() IS NOT NULL);

-- ================================================================================
-- SECTION 2: INSTITUTION & ACCESS TABLES
-- ================================================================================

-- INSTITUTIONS TABLE (5 policies)
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "institutions_select_all" ON institutions
    FOR SELECT USING (true);

-- ============================================================================
-- DYNAMIC PERMISSION-BASED POLICIES (Migrated 2026-04-13)
-- All policies below use user_has_permission() for dynamic role-based access.
-- Role Management UI is now the single source of truth for access control.
-- ============================================================================

-- Updated: 2026-04-21 - Broadened so admission seat-config users (who only
-- hold admission.settings.seats.view/.manage) and scope='all' roles can see
-- institutions in the Seat Configuration dropdown without needing the full
-- organizations.institutions.view permission.
DROP POLICY IF EXISTS "institutions_select_admission_role" ON institutions;
DROP POLICY IF EXISTS "institutions_select_permission"     ON institutions;
CREATE POLICY "institutions_select_by_role" ON institutions
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR role_has_institution_access(id)
        OR user_has_permission('organizations.institutions.view')
        OR user_has_permission('admission.settings.seats.view')
        OR user_has_permission('admission.settings.seats.manage')
    );

CREATE POLICY "institutions_insert_super_admin" ON institutions
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "institutions_update_admin" ON institutions
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.institutions.edit'))
    );

CREATE POLICY "institutions_delete_super_admin" ON institutions
    FOR DELETE USING (is_super_admin());

-- USER_INSTITUTION_ACCESS TABLE
ALTER TABLE user_institution_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_institution_access_select_own" ON user_institution_access
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_institution_access_select_admin" ON user_institution_access
    FOR SELECT USING (
        is_super_admin() OR
        EXISTS (
            SELECT 1 FROM user_institution_access uia
            WHERE uia.user_id = auth.uid()
            AND uia.institution_id = user_institution_access.institution_id
            AND uia.access_type = 'admin'
        )
    );

CREATE POLICY "user_institution_access_insert_admin" ON user_institution_access
    FOR INSERT WITH CHECK (
        is_super_admin() OR
        EXISTS (
            SELECT 1 FROM user_institution_access
            WHERE user_id = auth.uid()
            AND institution_id = NEW.institution_id
            AND access_type = 'admin'
        )
    );

CREATE POLICY "user_institution_access_update_admin" ON user_institution_access
    FOR UPDATE USING (
        is_super_admin() OR
        EXISTS (
            SELECT 1 FROM user_institution_access
            WHERE user_id = auth.uid()
            AND institution_id = user_institution_access.institution_id
            AND access_type = 'admin'
        )
    );

CREATE POLICY "user_institution_access_delete_admin" ON user_institution_access
    FOR DELETE USING (is_super_admin());

-- ================================================================================
-- SECTION 3: ACADEMIC MODULE TABLES
-- ================================================================================

-- ACADEMIC_YEARS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions to prevent intermittent loading issues
-- Updated: 2026-03-05 - Added admission role policy (cross-institution users have NULL institution_id)
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "academic_years_select_admission_role" ON academic_years
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
        OR user_has_permission('academic.years.view')
    );

CREATE POLICY "academic_years_select_optimized" ON academic_years
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "academic_years_insert_by_role" ON academic_years
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.years.create'))
    );

CREATE POLICY "academic_years_update_by_role" ON academic_years
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.years.edit'))
    );

CREATE POLICY "academic_years_delete_by_role" ON academic_years
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.years.delete'))
    );

-- Added: 2026-07-03 - /learners/my-bills groups bills by academic year; a
-- student may read the year rows their own bills reference (name lookup only).
CREATE POLICY "Students can view academic years on their own bills" ON academic_years
    FOR SELECT TO authenticated USING (
        id IN (
            SELECT b.academic_year_id
            FROM billing_student_bills b
            WHERE b.academic_year_id IS NOT NULL
              AND b.student_id IN (
                SELECT lp.id
                FROM learners_profiles lp
                JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
                WHERE p.id = auth.uid() AND p.role = 'student'
            )
        )
    );

-- DEGREES TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
-- Updated: 2026-03-05 - Added admission role policy
ALTER TABLE degrees ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
-- Updated: 2026-04-18 - Switched to role_has_institution_access() so
--                       scope='all' admission/counselor roles can see
--                       degrees across institutions (seat config join).
DROP POLICY IF EXISTS "degrees_select_admission_role" ON degrees;
DROP POLICY IF EXISTS "degrees_select_optimized" ON degrees;

CREATE POLICY "degrees_select_by_role" ON degrees
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR role_has_institution_access(institution_id)
        OR user_has_permission('organizations.degrees.view')
        OR user_has_permission('admission.settings.seats.view')
        OR user_has_permission('admission.settings.seats.manage')
    );

-- Additive read for campus-living settings admins (Chief Warden), scoped to the
-- colleges a hostel block serves. The "Add Room Eligibility Rule" modal offers a
-- cross-institution Institution list (hostel_block_institutions), so the policy
-- above -- own-institution scope or an organizations.*.view key -- left the
-- Degree/Department/Program/Semester dropdowns silently empty for wardens.
-- Granting organizations.*.view instead was rejected: those keys drive sidebar
-- entries in lib/sidebarMenuLink.ts. Mirrors the four policies added in
-- 20260804092425_campus_living_chief_warden_academic_cascade_rls.sql; the
-- department/program/semester twins live beside their own policies below.
DROP POLICY IF EXISTS "degrees_select_campus_living_settings" ON degrees;
CREATE POLICY "degrees_select_campus_living_settings" ON degrees
    FOR SELECT TO authenticated USING (
        (SELECT user_has_permission('campus_living.settings.view'))
        AND institution_id IN (SELECT institution_id FROM hostel_block_institutions)
    );

DROP POLICY IF EXISTS "degrees_insert_by_role" ON degrees;
CREATE POLICY "degrees_insert_by_role" ON degrees
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.degrees.create'))
    );

DROP POLICY IF EXISTS "degrees_update_by_role" ON degrees;
CREATE POLICY "degrees_update_by_role" ON degrees
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.degrees.edit'))
    );

DROP POLICY IF EXISTS "degrees_delete_by_role" ON degrees;
CREATE POLICY "degrees_delete_by_role" ON degrees
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.degrees.delete'))
    );

-- DEPARTMENTS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
-- Updated: 2026-03-05 - Added admission role policy
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
-- Updated: 2026-04-18 - Switched to role_has_institution_access() so
--                       scope='all' admission/counselor roles can see
--                       departments across institutions (seat config join).
DROP POLICY IF EXISTS "departments_select_admission_role" ON departments;
DROP POLICY IF EXISTS "departments_select_optimized" ON departments;

CREATE POLICY "departments_select_by_role" ON departments
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR role_has_institution_access(institution_id)
        OR user_has_permission('organizations.departments.view')
        OR user_has_permission('admission.settings.seats.view')
        OR user_has_permission('admission.settings.seats.manage')
    );

-- Additive campus-living read — see degrees_select_campus_living_settings above
-- for the full rationale.
DROP POLICY IF EXISTS "departments_select_campus_living_settings" ON departments;
CREATE POLICY "departments_select_campus_living_settings" ON departments
    FOR SELECT TO authenticated USING (
        (SELECT user_has_permission('campus_living.settings.view'))
        AND institution_id IN (SELECT institution_id FROM hostel_block_institutions)
    );

DROP POLICY IF EXISTS "departments_insert_by_role" ON departments;
CREATE POLICY "departments_insert_by_role" ON departments
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.departments.create'))
    );

DROP POLICY IF EXISTS "departments_update_by_role" ON departments;
CREATE POLICY "departments_update_by_role" ON departments
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.departments.edit'))
    );

DROP POLICY IF EXISTS "departments_delete_by_role" ON departments;
CREATE POLICY "departments_delete_by_role" ON departments
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.departments.delete'))
    );

-- PROGRAMS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
-- Updated: 2026-03-05 - Added admission role policy
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
-- Updated: 2026-04-18 - Replaced hardcoded institution_id equality with
--                       role_has_institution_access() so scope='all' roles
--                       (admission, counselor) can see programs across
--                       institutions for seat config / lead assignment.
--                       Also accept admission seat-config permissions so the
--                       Seat Configuration page resolves programs.
DROP POLICY IF EXISTS "programs_select_admission_role" ON programs;
DROP POLICY IF EXISTS "programs_select_optimized" ON programs;

CREATE POLICY "programs_select_by_role" ON programs
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR role_has_institution_access(institution_id)
        OR user_has_permission('organizations.programs.view')
        OR user_has_permission('admission.settings.seats.view')
        OR user_has_permission('admission.settings.seats.manage')
    );

-- Additive campus-living read — see degrees_select_campus_living_settings above
-- for the full rationale.
DROP POLICY IF EXISTS "programs_select_campus_living_settings" ON programs;
CREATE POLICY "programs_select_campus_living_settings" ON programs
    FOR SELECT TO authenticated USING (
        (SELECT user_has_permission('campus_living.settings.view'))
        AND institution_id IN (SELECT institution_id FROM hostel_block_institutions)
    );

DROP POLICY IF EXISTS "programs_insert_by_role" ON programs;
CREATE POLICY "programs_insert_by_role" ON programs
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.programs.create'))
    );

DROP POLICY IF EXISTS "programs_update_by_role" ON programs;
CREATE POLICY "programs_update_by_role" ON programs
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.programs.edit'))
    );

DROP POLICY IF EXISTS "programs_delete_by_role" ON programs;
CREATE POLICY "programs_delete_by_role" ON programs
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('organizations.programs.delete'))
    );

-- SEMESTERS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "semesters_select_optimized" ON semesters
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "semesters_select_admission_role" ON semesters
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
        OR user_has_permission('organizations.semesters.view')
    );

-- Additive campus-living read — see degrees_select_campus_living_settings above
-- for the full rationale.
DROP POLICY IF EXISTS "semesters_select_campus_living_settings" ON semesters;
CREATE POLICY "semesters_select_campus_living_settings" ON semesters
    FOR SELECT TO authenticated USING (
        (SELECT user_has_permission('campus_living.settings.view'))
        AND institution_id IN (SELECT institution_id FROM hostel_block_institutions)
    );

CREATE POLICY "semesters_insert_by_role" ON semesters
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.semesters.create'))
    );

CREATE POLICY "semesters_update_by_role" ON semesters
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.semesters.edit'))
    );

CREATE POLICY "semesters_delete_by_role" ON semesters
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.semesters.delete'))
    );

-- SECTIONS TABLE (4 policies)
-- Updated: 2025-12-15 - Optimized SELECT policy using security definer functions
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "sections_select_optimized" ON sections
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "sections_select_admission_role" ON sections
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
        OR user_has_permission('organizations.sections.view')
    );

CREATE POLICY "sections_insert_admin" ON sections
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.sections.create'))
    );

CREATE POLICY "sections_update_admin" ON sections
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.sections.edit'))
    );

CREATE POLICY "sections_delete_admin" ON sections
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.sections.delete'))
    );

-- COURSES TABLE (4 policies)
-- Updated: 2025-12-15 - Optimized SELECT policy using security definer functions
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "courses_select_optimized" ON courses
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "courses_insert_admin" ON courses
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.courses.create'))
    );

CREATE POLICY "courses_update_admin" ON courses
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.courses.edit'))
    );

CREATE POLICY "courses_delete_admin" ON courses
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.courses.delete'))
    );

-- COURSE_MAPPINGS TABLE (4 policies)
ALTER TABLE course_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_mappings_select_institution" ON course_mappings
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
    );

-- Updated: 2025-12-27 - Added support for custom role permissions
CREATE POLICY "course_mappings_insert_admin" ON course_mappings
    FOR INSERT WITH CHECK (
        -- Check institution access from profiles table
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND
        -- Custom role permission check
        user_has_permission('organizations.course.mappings.create')
    );

-- Updated: 2025-12-27 - Added support for custom role permissions
CREATE POLICY "course_mappings_update_admin" ON course_mappings
    FOR UPDATE USING (
        -- Check institution access from profiles table
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND
        -- Custom role permission check
        user_has_permission('organizations.course.mappings.edit')
    );

CREATE POLICY "course_mappings_delete_admin" ON course_mappings
    FOR DELETE USING (
        -- Check institution access from profiles table
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND
        -- Custom role permission check
        user_has_permission('organizations.course.mappings.delete')
    );

-- REGULATIONS TABLE (4 policies)
-- Created: 2025-12-12 - Academic regulations management
-- Updated: 2025-01-30 - Fixed to use profiles.institution_id instead of user_institution_access
ALTER TABLE regulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulations_select_institution" ON regulations
    FOR SELECT USING (
        -- Super admin and admin can see all regulations
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
        OR
        -- Other users can see regulations in their institution
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
    );

CREATE POLICY "regulations_insert_admin" ON regulations
    FOR INSERT WITH CHECK (
        -- Super admin and admin can create in any institution
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('super_admin', 'admin')
            )
            OR
            -- Other users can create in their institution with permission
            (
                institution_id IN (
                    SELECT institution_id FROM profiles
                    WHERE id = auth.uid() AND institution_id IS NOT NULL
                )
                AND user_has_permission('academic.regulations.create')
            )
        )
    );

CREATE POLICY "regulations_update_admin" ON regulations
    FOR UPDATE USING (
        -- Super admin and admin can update any regulation
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
        OR
        -- Other users can update in their institution with permission
        (
            institution_id IN (
                SELECT institution_id FROM profiles
                WHERE id = auth.uid() AND institution_id IS NOT NULL
            )
            AND user_has_permission('academic.regulations.edit')
        )
    );

CREATE POLICY "regulations_delete_admin" ON regulations
    FOR DELETE USING (
        -- Super admin and admin can delete any regulation
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
        OR
        -- Other users can delete in their institution with permission
        (
            institution_id IN (
                SELECT institution_id FROM profiles
                WHERE id = auth.uid() AND institution_id IS NOT NULL
            )
            AND user_has_permission('academic.regulations.delete')
        )
    );

-- BATCHES TABLE (4 policies)
-- Created: 2025-12-12 - Academic batch/cohort management
-- Updated: 2025-01-30 - Fixed to use profiles.institution_id instead of user_institution_access
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batches_select_institution" ON batches
    FOR SELECT USING (
        -- Super admin and admin can see all batches
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
        OR
        -- Other users can see batches in their institution
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
    );

CREATE POLICY "batches_insert_admin" ON batches
    FOR INSERT WITH CHECK (
        -- Super admin and admin can create in any institution
        (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('super_admin', 'admin')
            )
            OR
            -- Other users can create in their institution with permission
            (
                institution_id IN (
                    SELECT institution_id FROM profiles
                    WHERE id = auth.uid() AND institution_id IS NOT NULL
                )
                AND user_has_permission('academic.batches.create')
            )
        )
    );

CREATE POLICY "batches_update_admin" ON batches
    FOR UPDATE USING (
        -- Super admin and admin can update any batch
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
        OR
        -- Other users can update in their institution with permission
        (
            institution_id IN (
                SELECT institution_id FROM profiles
                WHERE id = auth.uid() AND institution_id IS NOT NULL
            )
            AND user_has_permission('academic.batches.edit')
        )
    );

CREATE POLICY "batches_delete_admin" ON batches
    FOR DELETE USING (
        -- Super admin and admin can delete any batch
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
        OR
        -- Other users can delete in their institution with permission
        (
            institution_id IN (
                SELECT institution_id FROM profiles
                WHERE id = auth.uid() AND institution_id IS NOT NULL
            )
            AND user_has_permission('academic.batches.delete')
        )
    );

-- ================================================================================
-- SECTION 4: STUDENT MODULE TABLES
-- ================================================================================

-- STUDENTS TABLE (2 policies)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_select_institution" ON students
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "students_all_admin" ON students
    FOR ALL USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

-- LEARNERS_PROFILES TABLE
-- Updated: 2026-04-16 - Unified policies to accept learners.admissions.*, learners.profiles.*, and legacy learners.*
--                       permission keys. Replaced get_current_user_institution_id() equality with
--                       role_has_institution_access() so scope='all' roles (admission_staff, counselor)
--                       can update cross-institution. Fixed bug where admission_staff had
--                       learners.admissions.edit but RLS only checked learners.profiles.edit.
-- Updated: 2026-03-10 - Added to setup file, fixed DELETE policy to include HOD role
ALTER TABLE learners_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: super/admin, any learners.* view permission + institution scope, or self-access by email
CREATE POLICY "learners_profiles_select_policy" ON learners_profiles
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND (
                user_has_permission('learners.admissions.view')
                OR user_has_permission('learners.profiles.view')
                OR user_has_permission('learners.view')
            )
        )
        OR student_email = (SELECT email FROM profiles WHERE id = auth.uid())
        OR college_email = (SELECT email FROM profiles WHERE id = auth.uid())
    );

-- INSERT: super/admin or user with create permission + institution scope
CREATE POLICY "learners_profiles_insert_policy" ON learners_profiles
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND (
                user_has_permission('learners.admissions.create')
                OR user_has_permission('learners.profiles.create')
                OR user_has_permission('learners.create')
            )
        )
    );

-- UPDATE: super/admin, any learners.* edit permission + institution scope, or self-update by email
CREATE POLICY "learners_profiles_update_policy" ON learners_profiles
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND (
                user_has_permission('learners.admissions.edit')
                OR user_has_permission('learners.profiles.edit')
                OR user_has_permission('learners.edit')
            )
        )
        OR student_email = (SELECT email FROM profiles WHERE id = auth.uid())
        OR college_email = (SELECT email FROM profiles WHERE id = auth.uid())
    );

-- DELETE: super/admin or user with delete permission + institution scope
CREATE POLICY "learners_profiles_delete_policy" ON learners_profiles
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND (
                user_has_permission('learners.admissions.delete')
                OR user_has_permission('learners.profiles.delete')
                OR user_has_permission('learners.delete')
            )
        )
    );

-- Student self-access: View own profile via profiles.learner_id linkage
CREATE POLICY "students_view_own_learner_profile" ON learners_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.learner_id = learners_profiles.id
            AND p.role = 'student'
        )
    );

-- Student self-access: Update own profile via profiles.learner_id linkage
CREATE POLICY "students_update_own_learner_profile" ON learners_profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.learner_id = learners_profiles.id
            AND p.role = 'student'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.learner_id = learners_profiles.id
            AND p.role = 'student'
        )
    );

-- INTAKE_HISTORY TABLE (Added: 2025-01-31)
-- Purpose: Capacity analytics and 3-year stability index tracking
-- Updated: 2026-04-18 - Migrated to dynamic permission-based policies so
--                       super admins, admission role (scope='all'), and
--                       users with admission.settings.seats.* permissions
--                       can read/write intake_history. Old policies locked
--                       the seat-config page out even for super admins who
--                       didn't have a user_institution_access row.
ALTER TABLE intake_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intake_history_select_policy" ON intake_history;
DROP POLICY IF EXISTS "intake_history_insert_policy" ON intake_history;
DROP POLICY IF EXISTS "intake_history_update_policy" ON intake_history;
DROP POLICY IF EXISTS "intake_history_delete_policy" ON intake_history;

CREATE POLICY "intake_history_select_by_role" ON intake_history
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND (
                user_has_permission('admission.settings.seats.view')
                OR user_has_permission('admission.settings.seats.manage')
                OR user_has_permission('organizations.programs.view')
            )
        )
    );

CREATE POLICY "intake_history_insert_by_role" ON intake_history
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND user_has_permission('admission.settings.seats.manage')
        )
    );

CREATE POLICY "intake_history_update_by_role" ON intake_history
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND user_has_permission('admission.settings.seats.manage')
        )
    );

CREATE POLICY "intake_history_delete_by_role" ON intake_history
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND user_has_permission('admission.settings.seats.manage')
        )
    );

-- ================================================================================
-- SECTION 5: STAFF MODULE TABLES
-- ================================================================================

-- STAFF TABLE (5 policies)
-- Updated: 2025-10-16 - Optimized RLS policies to fix HOD query timeout issues
-- Previous policies caused statement timeout (error 57014) due to repeated subqueries
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Allow users to view staff from institutions they have access to
-- Optimized to use indexed user_institution_access table
-- Fixed: Removed self-referential subquery to prevent infinite recursion (Error 42P17)
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
        -- Faculty can view their own staff record (direct email match)
        email = auth.email()
        OR
        institution_email = auth.email()
    );

-- INSERT Policy: Allow users with admin, write, or full access to create staff
-- Updated: 2025-10-16 - Added 'full' access type for HOD users
CREATE POLICY "staff_insert_by_access_type" ON staff
    FOR INSERT WITH CHECK (
        -- Super admins can create staff anywhere
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        -- Users with admin/write/full access can create staff in their institutions
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'full')
            AND is_active = true
        )
    );

-- UPDATE Policy: Allow users with admin, write, or full access to update staff
-- Updated: 2025-10-16 - Added 'full' access type for HOD users
-- Fixed: Removed self-referential subquery to prevent infinite recursion (Error 42P17)
CREATE POLICY "staff_update_by_access_type" ON staff
    FOR UPDATE USING (
        -- Super admins can update any staff
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        -- Users with admin/write/full access can update staff in their institutions
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'full')
            AND is_active = true
        )
        OR
        -- Faculty can update their own staff record (direct email match)
        email = auth.email()
        OR
        institution_email = auth.email()
    );

-- DELETE Policy: Allow users with admin or full access to delete staff
-- Updated: 2025-10-16 - Added 'full' access type for HOD users
CREATE POLICY "staff_delete_by_admin_access" ON staff
    FOR DELETE USING (
        -- Super admins can delete any staff
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        -- Users with admin or full access can delete staff in their institutions
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'full')
            AND is_active = true
        )
    );

-- Service Role Bypass: Allow service role to bypass all policies
CREATE POLICY "staff_service_role_full_access" ON staff
    FOR ALL USING (
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    );

-- STAFF_PLANS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to role-based permissions with optimized queries
-- Uses profiles.role and custom_roles.permissions for access control
ALTER TABLE staff_plans ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "staff_plans_select_optimized" ON staff_plans
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "staff_plans_insert_by_role" ON staff_plans
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.staff.planning.edit'))
    );

CREATE POLICY "staff_plans_update_by_role" ON staff_plans
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.staff.planning.edit'))
    );

CREATE POLICY "staff_plans_delete_by_role" ON staff_plans
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.staff.planning.delete'))
    );

-- STAFF_PLAN_COURSES TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to role-based permissions with security definer function
-- Uses get_user_staff_plan_access() function for better performance
ALTER TABLE staff_plan_courses ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "staff_plan_courses_select_optimized" ON staff_plan_courses
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR staff_plan_id IN (SELECT staff_plan_id FROM get_user_staff_plan_access())
    );

CREATE POLICY "staff_plan_courses_insert_by_role" ON staff_plan_courses
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (user_has_permission('academic.staff.planning.edit') AND staff_plan_id IN (SELECT staff_plan_id FROM get_user_staff_plan_access()))
    );

CREATE POLICY "staff_plan_courses_update_by_role" ON staff_plan_courses
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('academic.staff.planning.edit') AND staff_plan_id IN (SELECT staff_plan_id FROM get_user_staff_plan_access()))
    );

CREATE POLICY "staff_plan_courses_delete_by_role" ON staff_plan_courses
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('academic.staff.planning.delete') AND staff_plan_id IN (SELECT staff_plan_id FROM get_user_staff_plan_access()))
    );

-- =============================================
-- CLASS_INCHARGES TABLE POLICIES
-- Added: 2026-03-08 - Class incharge assignments
-- =============================================

-- SELECT: Super admins see all; others see records from their institutions
CREATE POLICY "class_incharges_select_by_institution" ON public.class_incharges
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND is_active = true
        )
    );

-- INSERT: Super admins or users with admin/write/full access
CREATE POLICY "class_incharges_insert_by_access_type" ON public.class_incharges
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'full')
            AND is_active = true
        )
    );

-- UPDATE: Super admins or users with admin/write/full access
CREATE POLICY "class_incharges_update_by_access_type" ON public.class_incharges
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'full')
            AND is_active = true
        )
    );

-- DELETE: Super admins or users with admin/full access only
CREATE POLICY "class_incharges_delete_by_admin_access" ON public.class_incharges
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND is_super_admin = true
        )
        OR
        institution_id IN (
            SELECT institution_id
            FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'full')
            AND is_active = true
        )
    );

-- ================================================================================
-- SECTION 6: ADMISSION MODULE TABLES
-- ================================================================================

-- ADMISSIONS TABLE (8 policies)
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admissions_select_institution" ON admissions
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "admissions_insert_admin" ON admissions
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "admissions_update_admin" ON admissions
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "admissions_delete_admin" ON admissions
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- Public admission policies
CREATE POLICY "admissions_select_applicant" ON admissions
    FOR SELECT USING (
        student_email = (SELECT email FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "admissions_update_status_admin" ON admissions
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    )
    WITH CHECK (
        OLD.status != NEW.status AND 
        NEW.status IN ('pending', 'approved', 'rejected', 'enrolled')
    );

-- ================================================================================
-- SECTION 7: ATTENDANCE MODULE TABLES
-- ================================================================================

-- PERIODS TABLE (6 policies)
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "periods_select_institution" ON periods
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
    );

CREATE POLICY "periods_insert_admin" ON periods
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academics.periods.create')
    );

CREATE POLICY "periods_update_admin" ON periods
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academics.periods.edit')
    );

CREATE POLICY "periods_delete_admin" ON periods
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academics.periods.delete')
    );

CREATE POLICY "periods_select_active" ON periods
    FOR SELECT USING (is_active = true);

CREATE POLICY "periods_select_time_range" ON periods
    FOR SELECT USING (
        start_time >= '08:00'::time AND end_time <= '18:00'::time
    );

-- STUDENT_ATTENDANCE TABLE (6 policies)
-- Updated: 2025-12-15 - Changed to role-based permissions (not user_institution_access)
-- Uses profiles.role and custom_roles.permissions for access control
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_attendance_select_institution" ON student_attendance
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
    );

-- INSERT policy using role-based permissions
-- Allows: super_admin, admin (full access), and roles with academic.attendance.mark permission
CREATE POLICY "student_attendance_insert_by_role" ON student_attendance
    FOR INSERT WITH CHECK (
        -- Check user has proper role
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                -- Super admin and admin always have access
                p.role IN ('super_admin', 'admin')
                OR
                -- Check if user's role has academic.attendance.mark permission
                (cr.permissions->>'academic.attendance.mark')::boolean = true
            )
        )
        -- Also verify institution matches
        AND institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

-- UPDATE policy using role-based permissions
CREATE POLICY "student_attendance_update_by_role" ON student_attendance
    FOR UPDATE USING (
        -- Check user has proper role
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                -- Super admin and admin always have access
                p.role IN ('super_admin', 'admin')
                OR
                -- Check if user's role has academic.attendance.mark permission
                (cr.permissions->>'academic.attendance.mark')::boolean = true
            )
        )
        -- Also verify institution matches
        AND institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

-- UPDATE policy mirroring the INSERT grant: anyone allowed to MARK attendance can
-- UPDATE the consolidated row. Required because student_attendance keys one row per
-- (institution, timetable, section, date) holding all periods in attendance_data JSONB:
-- the 1st period of a section-day is an INSERT, every later period is an UPDATE. Without
-- this, a marker on a custom role (e.g. staff_counselor) could mark the 1st period but
-- got a silent 0-row UPDATE ("Save result null") on the 2nd+ period. Keyed on
-- user_has_permission (robust resolver), not an inline custom_roles role_name join.
CREATE POLICY "student_attendance_update_marker" ON student_attendance
    FOR UPDATE TO authenticated
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academic.attendance.mark')
    )
    WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academic.attendance.mark')
    );

CREATE POLICY "student_attendance_delete_admin" ON student_attendance
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

CREATE POLICY "student_attendance_select_marked_by" ON student_attendance
    FOR SELECT USING (marked_by = auth.uid());

CREATE POLICY "student_attendance_update_marked_by" ON student_attendance
    FOR UPDATE USING (marked_by = auth.uid())
    WITH CHECK (marked_by = auth.uid());

-- Student self-service: view own attendance records
-- Added: 2025-12-29 - Student portal attendance view
-- Updated: 2026-04-16 - Replaced `JOIN learners_profiles` with a correlated
--   subquery. The JOIN caused a cascade RLS failure after the learners_profiles
--   policies were rewritten the same day (commit 57d981e5c); students with
--   valid section assignments and attendance data saw empty results. The
--   subquery form references learners_profiles only via id/section, so the
--   student's own-row policy (students_view_own_learner_profile) satisfies
--   the RLS check. [BUG-003042]
CREATE POLICY "student_attendance_select_own_student" ON student_attendance
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'student'
            AND p.learner_id IN (
                SELECT id FROM learners_profiles
                WHERE section_id = student_attendance.section_id
                AND lifecycle_status IN ('active', 'graduated')
            )
        )
    );

-- Updated: 2026-07-03 - Added the attendance-dashboard SELECT policy definition here
--   (it previously lived only in a prod migration, not in this setup file) AND fixed a
--   cross-tenant leak: the live policy had a standalone is_admin() OR-branch. is_admin()
--   is a GLOBAL role-name check (role IN 'admin'/'administrator'/'super_admin', no
--   institution scoping), so a scope='own'/'all' admin with is_super_admin=false could
--   read EVERY institution's attendance. Removed is_admin(); access is now
--   super-admin OR (dashboard.view permission AND institution scope).
--   See migration 20260731000000_fix_student_attendance_rls_is_admin_leak.sql for the
--   full leak analysis, 4-way impersonation verification, and the ⚠️ prerequisite
--   (grant 'academic.attendance.dashboard.view' to the 'administrator' role first, or
--   NULL-institution group admins lose all dashboard access). Same class of leak that
--   PR #1737 closed for the RPC path.
CREATE POLICY "student_attendance_select_dashboard_institution_access" ON student_attendance
    FOR SELECT USING (
        is_super_admin()
        OR (
            user_has_permission('academic.attendance.dashboard.view')
            AND role_has_institution_access(institution_id)
        )
    );

-- ================================================================================
-- SECTION 8: TIMETABLE MODULE TABLES
-- ================================================================================

-- TIMETABLES TABLE (5 policies)
-- Updated: 2025-12-15 - Optimized SELECT policy using security definer functions
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
-- Updated: 2026-04-18 - Corrected permission keys from `academics.*` to `academic.*`
-- (the extra 's' did not match any role's granted permissions; HOD edits/deletes
-- were silently rejected by RLS). Keys now match lib/constants/permissions.ts.
CREATE POLICY "timetables_select_optimized" ON timetables
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "timetables_insert_admin" ON timetables
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.timetables.create'))
    );

CREATE POLICY "timetables_update_admin" ON timetables
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.timetables.edit'))
    );

CREATE POLICY "timetables_delete_admin" ON timetables
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academic.timetables.delete'))
    );

CREATE POLICY "timetables_select_active" ON timetables
    FOR SELECT USING (is_active = true);

-- ================================================================================
-- SECTION 9: BILLING MODULE TABLES
-- ================================================================================

-- BILLING_STUDENT_BILLS TABLE (8 policies)
ALTER TABLE billing_student_bills ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-18 - Use role_has_institution_access for cross-institution support
-- (admission_staff with scope='all' was blocked by institution_id = get_current_user_institution_id())
-- Updated: 2026-07-03 - Consolidated the two overlapping SELECT policies
-- (bills_select_institution + billing_bills_select_permission) into one whose
-- user-constant predicates are hoisted out of the per-row loop (scalar InitPlan
-- + hashed IN-subquery). Per-row role_has_institution_access()/
-- user_has_permission() calls over ~10k rows cost ~4s and blew the 8s
-- statement timeout (57014) for all-institution non-admin users on
-- /billing/schedule. Visible-row set unchanged.
-- Updated: 2026-08-01 - the SELF branch now also hides categories flagged
-- visible_to_learners = false. Staff/admin branches are untouched, so Accounts
-- still sees every fee. `IN (SELECT ...)` (not `= ANY(fn())`) so the var-free
-- sub-select is evaluated once per query, not once per row.
CREATE POLICY "bills_select_scoped" ON billing_student_bills
    FOR SELECT USING (
        (SELECT is_super_admin() OR is_admin())
        OR institution_id IN (
            SELECT unnest(_user_accessible_institutions())
            WHERE user_has_permission('billing.bills.view')
               OR user_has_permission('billing.schedule.view')
        )
        OR (
            student_id IN (
                SELECT lp.id
                FROM learners_profiles lp
                JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
                WHERE p.id = auth.uid()
            )
            AND (
                item_category_id IS NULL
                OR item_category_id IN (
                    SELECT id FROM billing_categories WHERE visible_to_learners
                )
            )
        )
    );

-- Reconciled: 2026-08-01 - lives in the DB since the my-bills build (2026-06-22)
-- but was never mirrored here. Second permissive SELECT policy exposing bills to
-- a learner; permissive policies are OR'd, so it carries the same
-- visible_to_learners clause as the self branch above or hidden rows leak here.
CREATE POLICY "Students can view their own bills" ON billing_student_bills
    FOR SELECT TO authenticated USING (
        student_id IN (
            SELECT lp.id
            FROM learners_profiles lp
            JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
            WHERE p.id = auth.uid() AND p.role = 'student'
        )
        AND (
            item_category_id IS NULL
            OR item_category_id IN (
                SELECT id FROM billing_categories WHERE visible_to_learners
            )
        )
    );

CREATE POLICY "bills_insert_admin" ON billing_student_bills
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.bills.create'))
    );

CREATE POLICY "bills_update_admin" ON billing_student_bills
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.bills.edit'))
    );

DROP POLICY IF EXISTS bills_delete_admin ON public.billing_student_bills;
CREATE POLICY bills_delete_admin
  ON public.billing_student_bills FOR DELETE
  USING (
    is_super_admin()
    OR (user_has_permission('billing.bills.delete') AND role_has_institution_access(institution_id))
  );

CREATE POLICY "bills_select_student" ON billing_student_bills
    FOR SELECT USING (
        student_id IN (
            SELECT id FROM students
            WHERE email = (SELECT email FROM profiles WHERE id = auth.uid())
        )
    );

-- Updated 2026-08-01 (migration 20260801120000): the billing.schedule.* family
-- of policies. This INSERT policy previously gated on the permission key ALONE
-- while its UPDATE/DELETE siblings ANDed in role_has_institution_access — so an
-- institution-scoped role could create a bill against any institution and then
-- be unable to edit it. Now symmetric.
-- The (SELECT fn()) wrappers are deliberate: those calls reference no column,
-- so the subquery forces once-per-statement evaluation. role_has_institution_access
-- DOES reference a column and must stay unwrapped (per-row).
DROP POLICY IF EXISTS billing_bills_insert_permission ON public.billing_student_bills;
CREATE POLICY billing_bills_insert_permission
  ON public.billing_student_bills FOR INSERT
  WITH CHECK (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (
      (SELECT user_has_permission('billing.schedule.create'::text))
      AND role_has_institution_access(institution_id)
    )
  );

-- BILLING_RECEIPTS TABLE (8 policies)
ALTER TABLE billing_receipts ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "receipts_select_institution" ON billing_receipts
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.receipts.view'))
    );

CREATE POLICY "receipts_insert_admin" ON billing_receipts
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.receipts.create'))
    );

CREATE POLICY "receipts_update_admin" ON billing_receipts
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.receipts.edit'))
    );

CREATE POLICY "receipts_delete_admin" ON billing_receipts
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.receipts.delete'))
    );

CREATE POLICY "receipts_select_student" ON billing_receipts
    FOR SELECT USING (
        student_id IN (
            SELECT id FROM students
            WHERE email = (SELECT email FROM profiles WHERE id = auth.uid())
        )
    );

-- Updated 2026-08-01 (migration 20260801120000): same asymmetry fix as
-- billing_bills_insert_permission above. Note this uses
-- role_has_institution_access(institution_id) rather than the older
-- `institution_id = get_current_user_institution_id()` form used by the
-- receipts_*_admin policies — the function additionally honours
-- custom_roles.institution_scope='all', CAS sibling institutions, and
-- user_institution_access grants, so scope='all' finance roles keep working
-- even when their profiles.institution_id is NULL.
DROP POLICY IF EXISTS billing_receipts_insert_permission ON public.billing_receipts;
CREATE POLICY billing_receipts_insert_permission
  ON public.billing_receipts FOR INSERT
  WITH CHECK (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (
      (SELECT user_has_permission('billing.receipts.create'::text))
      AND role_has_institution_access(institution_id)
    )
  );

CREATE POLICY "receipts_select_accountant" ON billing_receipts
    FOR SELECT USING (accountant_id = auth.uid());

-- BILLING_INVOICES TABLE (8 policies)
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "invoices_select_institution" ON billing_invoices
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.invoices.view'))
    );

CREATE POLICY "invoices_insert_admin" ON billing_invoices
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.invoices.create'))
    );

CREATE POLICY "invoices_update_admin" ON billing_invoices
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.invoices.edit'))
    );

CREATE POLICY "invoices_delete_admin" ON billing_invoices
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.invoices.delete'))
    );

CREATE POLICY "invoices_select_student" ON billing_invoices
    FOR SELECT USING (
        student_id IN (
            SELECT id FROM students
            WHERE email = (SELECT email FROM profiles WHERE id = auth.uid())
        )
    );

-- BILLING_RECEIPT_ITEMS TABLE (1 policy)
ALTER TABLE billing_receipt_items ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "receipt_items_all_billing" ON billing_receipt_items
    FOR ALL USING (
        is_super_admin() OR is_admin()
        OR EXISTS (
            SELECT 1 FROM billing_receipts br
            WHERE br.id = billing_receipt_items.receipt_id
            AND br.institution_id = get_current_user_institution_id()
            AND user_has_permission('billing.receipts.view')
        )
    );

-- Added: 2026-07-03 - /learners/my-bills reads receipt->bill links to group
-- paid receipts by academic year and render the receipt detail/PDF.
CREATE POLICY "Students can view their own receipt items" ON billing_receipt_items
    FOR SELECT TO authenticated USING (
        receipt_id IN (
            SELECT r.id FROM billing_receipts r
            WHERE r.student_id IN (
                SELECT lp.id
                FROM learners_profiles lp
                JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
                WHERE p.id = auth.uid() AND p.role = 'student'
            )
        )
    );

-- BILLING_INVOICE_ITEMS TABLE (1 policy)
ALTER TABLE billing_invoice_items ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "invoice_items_all_billing" ON billing_invoice_items
    FOR ALL USING (
        is_super_admin() OR is_admin()
        OR EXISTS (
            SELECT 1 FROM billing_invoices bi
            WHERE bi.id = billing_invoice_items.invoice_id
            AND bi.institution_id = get_current_user_institution_id()
            AND user_has_permission('billing.invoices.view')
        )
    );

-- BILLING_DISCOUNTS TABLE (1 policy)
ALTER TABLE billing_discounts ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "discounts_all_billing" ON billing_discounts
    FOR ALL USING (
        is_super_admin() OR is_admin()
        OR EXISTS (
            SELECT 1 FROM billing_student_bills bsb
            WHERE bsb.id = billing_discounts.bill_id
            AND bsb.institution_id = get_current_user_institution_id()
            AND user_has_permission('billing.discounts.view')
        )
    );

-- BILLING_REFUNDS TABLE (1 policy)
ALTER TABLE billing_refunds ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "refunds_all_billing" ON billing_refunds
    FOR ALL USING (
        is_super_admin() OR is_admin()
        OR EXISTS (
            SELECT 1 FROM billing_receipts br
            WHERE br.id = billing_refunds.receipt_id
            AND br.institution_id = get_current_user_institution_id()
            AND user_has_permission('billing.refunds.view')
        )
    );

-- Added: 2026-07-03 - /learners/my-bills flags refunded receipts honestly.
CREATE POLICY "Students can view their own refunds" ON billing_refunds
    FOR SELECT TO authenticated USING (
        receipt_id IN (
            SELECT r.id FROM billing_receipts r
            WHERE r.student_id IN (
                SELECT lp.id
                FROM learners_profiles lp
                JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
                WHERE p.id = auth.uid() AND p.role = 'student'
            )
        )
    );

-- BILLING CATEGORIES (4 policies)
-- Updated: 2026-04-15 - Consolidated 3-tier (parent/sub/item) hierarchy into flat billing_categories.
ALTER TABLE billing_categories ENABLE ROW LEVEL SECURITY;

-- SELECT is authenticated-read (2026-07-09): categories are a lookup table
-- (name/kind/default amount) that student self-service pages (My Bills fee
-- heads, Pay Online gating) must resolve; gating reads behind
-- billing.categories.view silently nulled every student-visible category.
CREATE POLICY "billing_categories_select" ON billing_categories
    FOR SELECT USING (
        (SELECT auth.uid()) IS NOT NULL
    );

CREATE POLICY "billing_categories_insert" ON billing_categories
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (user_has_permission('billing.categories.create')
            AND role_has_institution_access(institution_id))
    );

CREATE POLICY "billing_categories_update" ON billing_categories
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('billing.categories.edit')
            AND role_has_institution_access(institution_id))
    );

CREATE POLICY "billing_categories_delete" ON billing_categories
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('billing.categories.delete')
            AND role_has_institution_access(institution_id))
    );

-- BILLING REFUND WORKFLOW (2026-07-11) — SELECT only; ALL writes via SECURITY DEFINER RPCs
ALTER TABLE billing_refund_flow_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refund_request_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refund_request_actions ENABLE ROW LEVEL SECURITY;

-- Configs: readable by all authenticated (capability resolution); writable with configure perm.
CREATE POLICY refund_flow_configs_select ON billing_refund_flow_configs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY refund_flow_configs_write ON billing_refund_flow_configs
    FOR ALL TO authenticated
    USING (is_super_admin() OR user_has_permission('billing.refunds.configure'))
    WITH CHECK (is_super_admin() OR user_has_permission('billing.refunds.configure'));

-- Requests: staff with view perm + institution access; snapshot participants; the learner.
CREATE POLICY refund_requests_select ON billing_refund_requests
    FOR SELECT TO authenticated USING (
        is_super_admin()
        OR (user_has_permission('billing.refunds.view')
            AND role_has_institution_access(billing_refund_requests.institution_id))
        OR billing_refund_requests.initiated_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(billing_refund_requests.flow_snapshot->'stages') s
            WHERE s->'assignee_users' ? auth.uid()::text
               OR EXISTS (SELECT 1 FROM user_roles ur
                          WHERE ur.user_id = auth.uid() AND s->'assignee_roles' ? ur.role_id::text))
        OR (billing_refund_requests.flow_snapshot->'disburser'->'assignee_users' ? auth.uid()::text)
        OR EXISTS (SELECT 1 FROM user_roles ur
                   WHERE ur.user_id = auth.uid()
                     AND billing_refund_requests.flow_snapshot->'disburser'->'assignee_roles' ? ur.role_id::text)
        OR EXISTS (  -- learner self-view (mirrors existing billing_refunds student policy)
            SELECT 1 FROM learners_profiles lp
            JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
            WHERE lp.id = billing_refund_requests.student_id
              AND p.id = auth.uid() AND p.role = 'student')
    );

-- Child tables inherit visibility through the parent (subquery runs under caller RLS).
CREATE POLICY refund_request_bills_select ON billing_refund_request_bills
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM billing_refund_requests r WHERE r.id = billing_refund_request_bills.request_id));
CREATE POLICY refund_request_actions_select ON billing_refund_request_actions
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM billing_refund_requests r WHERE r.id = billing_refund_request_actions.request_id));

-- ================================================================================
-- SECTION 10: BUG REPORT MODULE TABLES
-- ================================================================================

-- BUG_REPORTS TABLE (4 policies)
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bug_reports_select_all" ON bug_reports
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "bug_reports_insert_authenticated" ON bug_reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);

CREATE POLICY "bug_reports_update_reporter" ON bug_reports
    FOR UPDATE USING (
        reporter_user_id = auth.uid() OR
        is_super_admin()
    );

CREATE POLICY "bug_reports_delete_admin" ON bug_reports
    FOR DELETE USING (is_super_admin());

-- BUG_REPORT_MESSAGES TABLE (3 policies)
ALTER TABLE bug_report_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_participant" ON bug_report_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM bug_report_participants
            WHERE bug_report_id = bug_report_messages.bug_report_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "messages_insert_participant" ON bug_report_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM bug_report_participants
            WHERE bug_report_id = NEW.bug_report_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "messages_update_sender" ON bug_report_messages
    FOR UPDATE USING (sender_user_id = auth.uid());

-- BUG_REPORT_PARTICIPANTS TABLE (2 policies)
ALTER TABLE bug_report_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants_select_all" ON bug_report_participants
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "participants_insert_admin" ON bug_report_participants
    FOR INSERT WITH CHECK (
        is_super_admin() OR
        EXISTS (
            SELECT 1 FROM bug_reports
            WHERE id = NEW.bug_report_id
            AND reporter_user_id = auth.uid()
        )
    );

-- Bug Report Email Logs (1 policy)
-- Added: 2026-03-23
ALTER TABLE bug_report_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_logs_select_admin" ON bug_report_email_logs
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'administrator')
    );

-- ================================================================================
-- SECTION 11: RESOURCE MANAGEMENT MODULE TABLES
-- ================================================================================

-- RESOURCES TABLE (2 policies)
-- Updated: 2025-01-30 - Fixed to use profiles.institution_id instead of user_institution_access
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resources_select_institution" ON resources
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
    );

CREATE POLICY "resources_all_admin" ON resources
    FOR ALL USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('resources.manage')
    );

-- RESOURCE_RESERVATIONS TABLE (4 policies)
-- Updated: 2025-01-30 - Fixed to use profiles.institution_id instead of user_institution_access
ALTER TABLE resource_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations_select_institution" ON resource_reservations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = resource_reservations.resource_id
            AND r.institution_id IN (
                SELECT institution_id FROM profiles
                WHERE id = auth.uid() AND institution_id IS NOT NULL
            )
        )
    );

CREATE POLICY "reservations_insert_authenticated" ON resource_reservations
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = resource_reservations.resource_id
            AND r.institution_id IN (
                SELECT institution_id FROM profiles
                WHERE id = auth.uid() AND institution_id IS NOT NULL
            )
        )
    );

CREATE POLICY "reservations_update_own" ON resource_reservations
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "reservations_delete_own" ON resource_reservations
    FOR DELETE USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = resource_reservations.resource_id
            AND r.institution_id IN (
                SELECT institution_id FROM profiles
                WHERE id = auth.uid() AND institution_id IS NOT NULL
            )
            AND user_has_permission('resources.manage')
        )
    );

-- NOTE (2026-06-23): the live DB has since diverged from the four policies
-- above (later migrations renamed/added resource_reservations_select_by_*,
-- _by_approver, the per-resource home-institution SELECT, etc.). This block is
-- kept as historical reference; the authoritative state is the migrations.
--
-- Migration 20260623120000 replaced the unscoped staff SELECT policy
-- ("Staff with permission can view all reservations", which let
-- super_admin/admin/accounts see EVERY institution's reservations) with the
-- institution-scoped policy below. role_has_institution_access() keeps
-- super_admin + scope='all' staff global while limiting institution-scoped
-- staff to their accessible institutions.
DROP POLICY IF EXISTS "Staff with permission can view all reservations"
  ON resource_reservations;

CREATE POLICY "resource_reservations_select_staff_scoped" ON resource_reservations
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = (SELECT auth.uid())
              AND p.role = ANY (ARRAY['super_admin', 'admin', 'accounts'])
        )
        AND EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = resource_reservations.resource_id
              AND role_has_institution_access(r.institution_id)
        )
    );

-- RESOURCE_APPROVALS TABLE (2 policies)
ALTER TABLE resource_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approvals_select_involved" ON resource_approvals
    FOR SELECT USING (
        approver_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM resource_reservations rr
            WHERE rr.id = resource_approvals.reservation_id
            AND rr.user_id = auth.uid()
        )
    );

CREATE POLICY "approvals_update_approver" ON resource_approvals
    FOR UPDATE USING (approver_user_id = auth.uid())
    WITH CHECK (approver_user_id = auth.uid());

-- RESOURCE_USAGE_LOGS TABLE (2 policies)
-- Updated: 2025-01-30 - Fixed to use profiles.institution_id instead of user_institution_access
ALTER TABLE resource_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_logs_select_institution" ON resource_usage_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = resource_usage_logs.resource_id
            AND r.institution_id IN (
                SELECT institution_id FROM profiles
                WHERE id = auth.uid() AND institution_id IS NOT NULL
            )
        )
    );

CREATE POLICY "usage_logs_insert_system" ON resource_usage_logs
    FOR INSERT WITH CHECK (true);

-- RESOURCE_MAINTENANCE_LOGS TABLE
-- Updated: 2025-10-06 - Added RLS policies for maintenance tables
ALTER TABLE resource_maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_logs_select_all" ON resource_maintenance_logs
    FOR SELECT USING (true);

CREATE POLICY "maintenance_logs_insert_authenticated" ON resource_maintenance_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "maintenance_logs_update_creator_or_assigned" ON resource_maintenance_logs
    FOR UPDATE USING (
        created_by = auth.uid() OR
        assigned_to_user_id = auth.uid() OR
        is_super_admin()
    );

CREATE POLICY "maintenance_logs_delete_creator" ON resource_maintenance_logs
    FOR DELETE USING (created_by = auth.uid() OR is_super_admin());

-- RESOURCE_MAINTENANCE_SCHEDULES TABLE
ALTER TABLE resource_maintenance_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_schedules_select_all" ON resource_maintenance_schedules
    FOR SELECT USING (true);

CREATE POLICY "maintenance_schedules_insert_authenticated" ON resource_maintenance_schedules
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "maintenance_schedules_update_authenticated" ON resource_maintenance_schedules
    FOR UPDATE USING (auth.uid() IS NOT NULL OR is_super_admin());

CREATE POLICY "maintenance_schedules_delete_authenticated" ON resource_maintenance_schedules
    FOR DELETE USING (auth.uid() IS NOT NULL OR is_super_admin());

-- RESOURCE CATEGORY TABLES (5 policies for parent, 4 for others)
ALTER TABLE resource_parent_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parent_cat_select_all" ON resource_parent_categories
    FOR SELECT USING (true);

CREATE POLICY "parent_cat_insert_admin" ON resource_parent_categories
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "parent_cat_update_admin" ON resource_parent_categories
    FOR UPDATE USING (is_super_admin());

CREATE POLICY "parent_cat_delete_admin" ON resource_parent_categories
    FOR DELETE USING (is_super_admin());

CREATE POLICY "parent_cat_select_active" ON resource_parent_categories
    FOR SELECT USING (status = 'active');

ALTER TABLE resource_sub_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_cat_select_all" ON resource_sub_categories
    FOR SELECT USING (true);

CREATE POLICY "sub_cat_insert_admin" ON resource_sub_categories
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "sub_cat_update_admin" ON resource_sub_categories
    FOR UPDATE USING (is_super_admin());

CREATE POLICY "sub_cat_delete_admin" ON resource_sub_categories
    FOR DELETE USING (is_super_admin());

ALTER TABLE resource_attribute_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attr_def_select_all" ON resource_attribute_definitions
    FOR SELECT USING (true);

CREATE POLICY "attr_def_insert_admin" ON resource_attribute_definitions
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "attr_def_update_admin" ON resource_attribute_definitions
    FOR UPDATE USING (is_super_admin());

CREATE POLICY "attr_def_delete_admin" ON resource_attribute_definitions
    FOR DELETE USING (is_super_admin());

-- ================================================================================
-- SECTION 12: NOTIFICATION MODULE TABLES
-- ================================================================================

-- NOTIFICATIONS TABLE (2 policies)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_all" ON notifications
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "notifications_insert_admin" ON notifications
    FOR INSERT WITH CHECK (
        is_super_admin() OR
        user_has_permission('create_notifications')
    );

-- USER_NOTIFICATIONS TABLE (3 policies)
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_notifications_select_own" ON user_notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_notifications_update_own" ON user_notifications
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_notifications_insert_system" ON user_notifications
    FOR INSERT WITH CHECK (
        is_super_admin() OR
        user_has_permission('send_notifications')
    );

-- PUSH_SUBSCRIPTIONS TABLE (1 policy)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_own" ON push_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- ================================================================================
-- SECTION 13: APPLICATION & CATEGORY TABLES
-- ================================================================================

-- APPLICATIONS TABLE (4 policies)
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applications_select_active" ON applications
    FOR SELECT USING (is_active = true);

CREATE POLICY "applications_insert_admin" ON applications
    FOR INSERT WITH CHECK (
        is_super_admin() OR
        user_has_permission('manage_applications')
    );

CREATE POLICY "applications_update_admin" ON applications
    FOR UPDATE USING (
        is_super_admin() OR
        user_has_permission('manage_applications')
    );

CREATE POLICY "applications_delete_admin" ON applications
    FOR DELETE USING (is_super_admin());

-- CATEGORIES TABLE (4 policies)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_all" ON categories
    FOR SELECT USING (true);

CREATE POLICY "categories_insert_admin" ON categories
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "categories_update_admin" ON categories
    FOR UPDATE USING (is_super_admin());

CREATE POLICY "categories_delete_admin" ON categories
    FOR DELETE USING (is_super_admin());

-- SUBCATEGORIES TABLE (4 policies)
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subcategories_select_all" ON subcategories
    FOR SELECT USING (true);

CREATE POLICY "subcategories_insert_admin" ON subcategories
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "subcategories_update_admin" ON subcategories
    FOR UPDATE USING (is_super_admin());

CREATE POLICY "subcategories_delete_admin" ON subcategories
    FOR DELETE USING (is_super_admin());

-- ================================================================================
-- SECTION 14: EMPLOYMENT & DASHBOARD TABLES
-- ================================================================================

-- EMPLOYMENT_CATEGORIES TABLE (8 policies)
ALTER TABLE employment_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employment_cat_select_all" ON employment_categories
    FOR SELECT USING (true);

CREATE POLICY "employment_cat_insert_admin" ON employment_categories
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "employment_cat_update_admin" ON employment_categories
    FOR UPDATE USING (is_super_admin());

CREATE POLICY "employment_cat_delete_admin" ON employment_categories
    FOR DELETE USING (is_super_admin());

-- Additional employment category policies
CREATE POLICY "employment_cat_select_active" ON employment_categories
    FOR SELECT USING (is_active = true);

CREATE POLICY "employment_cat_update_status" ON employment_categories
    FOR UPDATE USING (is_super_admin())
    WITH CHECK (OLD.is_active != NEW.is_active);

-- ================================================================================
-- SECTION 14: API & ACTIVITY LOGGING TABLES (Previously SECTION 15)
-- ================================================================================

-- API_KEYS TABLE (5 policies)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select_own" ON api_keys
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "api_keys_insert_own" ON api_keys
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "api_keys_update_own" ON api_keys
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "api_keys_delete_own" ON api_keys
    FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "api_keys_select_valid" ON api_keys
    FOR SELECT USING (
        is_active = true AND 
        (expires_at IS NULL OR expires_at > NOW())
    );

-- USER_ACTIVITY_LOGS TABLE (2 policies)
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select_own" ON user_activity_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "activity_logs_select_admin" ON user_activity_logs
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('system.logs.view')
    );

-- Allow authenticated users to insert their own activity logs
CREATE POLICY "activity_logs_insert_own" ON user_activity_logs
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- ================================================================================
-- SECTION 16: CUSTOM ROLES TABLE
-- ================================================================================

-- CUSTOM_ROLES TABLE (3 policies)
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_roles_select_all" ON custom_roles
    FOR SELECT USING (true);

CREATE POLICY "custom_roles_insert_admin" ON custom_roles
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "custom_roles_update_admin" ON custom_roles
    FOR UPDATE USING (is_super_admin())
    WITH CHECK (NOT is_system_role);

-- ================================================================================
-- End of Policies File
-- Total Policies: 250+
-- Tables with RLS: 53
-- ================================================================================
-- =====================================================
-- CHILD APP AUTHENTICATION POLICIES
-- Updated: 2025-01-17 - Added child app authentication RLS policies
-- =====================================================

-- Enable RLS on child app tables
ALTER TABLE public.registered_child_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_app_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_child_app_permissions ENABLE ROW LEVEL SECURITY;

-- Policies for registered_child_apps (only admins can manage)
CREATE POLICY "Admins can view all child apps" ON public.registered_child_apps
    FOR SELECT USING (true);

CREATE POLICY "Only super admins can create child apps" ON public.registered_child_apps
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND is_super_admin = true
        )
    );

CREATE POLICY "Only super admins can update child apps" ON public.registered_child_apps
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND is_super_admin = true
        )
    );

CREATE POLICY "Only super admins can delete child apps" ON public.registered_child_apps
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND is_super_admin = true
        )
    );

-- Policies for child_app_sessions (users can view their own)
CREATE POLICY "Users can view their own sessions" ON public.child_app_sessions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can create sessions" ON public.child_app_sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update sessions" ON public.child_app_sessions
    FOR UPDATE USING (true);

-- Policies for access logs (admins only)
CREATE POLICY "Admins can view access logs" ON public.child_app_access_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "System can create access logs" ON public.child_app_access_logs
    FOR INSERT WITH CHECK (true);

-- Policies for child_app_permissions
CREATE POLICY "Admins can view permissions" ON public.child_app_permissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Super admins can manage permissions" ON public.child_app_permissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND is_super_admin = true
        )
    );

-- Policies for user_child_app_permissions
CREATE POLICY "Users can view their own permissions" ON public.user_child_app_permissions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage user permissions" ON public.user_child_app_permissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- =================================
-- USER APP FAVORITES POLICIES
-- Updated: 2025-01-17 - Added favorite apps functionality
-- =================================

-- Users can manage their own favorites
CREATE POLICY "Users can view their own favorites" ON public.user_app_favorites
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can add their own favorites" ON public.user_app_favorites
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their own favorites" ON public.user_app_favorites
    FOR DELETE USING (user_id = auth.uid());

-- Admins can view all favorites for analytics
CREATE POLICY "Admins can view all favorites" ON public.user_app_favorites
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- ================================================================================
-- LIFECYCLE ANALYTICS RLS POLICIES
-- Updated: 2026-02-06
-- ================================================================================

-- usage_events: Insert via SECURITY DEFINER functions (service role)
-- Select: scoped by role
CREATE POLICY "Super admin can view all usage_events" ON public.usage_events
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Institution admin can view own institution usage_events" ON public.usage_events
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Service role can insert usage_events" ON public.usage_events
    FOR INSERT WITH CHECK (true);

-- module_usage_daily: Same access pattern
CREATE POLICY "Super admin can view all module_usage_daily" ON public.module_usage_daily
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Institution admin can view own module_usage_daily" ON public.module_usage_daily
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Service role can insert module_usage_daily" ON public.module_usage_daily
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update module_usage_daily" ON public.module_usage_daily
    FOR UPDATE USING (true);

-- institution_health_scores: Super admin only for cross-institution, institution admin for own
CREATE POLICY "Super admin can view all health_scores" ON public.institution_health_scores
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Institution admin can view own health_scores" ON public.institution_health_scores
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage health_scores" ON public.institution_health_scores
    FOR ALL USING (true);

-- feature_usage_summary: Same as module_usage_daily
CREATE POLICY "Super admin can view all feature_usage_summary" ON public.feature_usage_summary
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Institution admin can view own feature_usage_summary" ON public.feature_usage_summary
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage feature_usage_summary" ON public.feature_usage_summary
    FOR ALL USING (true);

-- usage_events_archive: Super admin only
CREATE POLICY "Super admin can view usage_events_archive" ON public.usage_events_archive
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Service role can manage usage_events_archive" ON public.usage_events_archive
    FOR ALL USING (true);

-- ================================================================================
-- SERVICE REQUEST MODULE RLS POLICIES
-- Updated: 2026-02-09
-- ================================================================================

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
-- Service Types: All authenticated users can view active types
CREATE POLICY "Authenticated users can view active service types"
    ON service_types FOR SELECT
    USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Super admin can manage service types"
    ON service_types FOR ALL
    USING (is_super_admin() OR is_admin() OR user_has_permission('service_requests.manage_types'))
    WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('service_requests.manage_types'));

CREATE POLICY "Authenticated users can view service type fields"
    ON service_type_fields FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admin can manage service type fields"
    ON service_type_fields FOR ALL
    USING (is_super_admin() OR is_admin() OR user_has_permission('service_requests.manage_types'))
    WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('service_requests.manage_types'));

CREATE POLICY "Authenticated users can view approval steps"
    ON service_request_approval_steps FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admin can manage approval steps"
    ON service_request_approval_steps FOR ALL
    USING (is_super_admin() OR is_admin() OR user_has_permission('service_requests.manage_types'))
    WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('service_requests.manage_types'));

CREATE POLICY "Users can view own service requests"
    ON service_requests FOR SELECT
    USING (requester_id = auth.uid());

CREATE POLICY "Admins can view all service requests"
    ON service_requests FOR SELECT
    USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('service_requests.view_all')
    );

-- Updated 2026-04-22 — multi-approver support. Users qualify either by
-- role match (legacy) or by being explicitly listed in approver_user_ids.
CREATE POLICY "Approvers can view pending requests"
    ON service_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_request_approval_steps sras
            WHERE sras.service_type_id = service_requests.service_type_id
            AND sras.step_order = service_requests.current_approval_step
            AND (
                sras.approver_role = get_my_role()
                OR auth.uid() = ANY(sras.approver_user_ids)
            )
        )
    );

-- Cross-institution named approvers (migration 20260624120000). Additive
-- PERMISSIVE policies: a user explicitly listed in approver_user_ids can SEE
-- and ACT on the request regardless of institution. Role-based approval stays
-- institution-scoped via the policies above. Predicate is defined in
-- 02_functions.sql (user_is_request_named_approver).
CREATE POLICY "service_requests_named_approver_select"
    ON service_requests FOR SELECT
    USING (public.user_is_request_named_approver(id));

CREATE POLICY "service_requests_named_approver_update"
    ON service_requests FOR UPDATE
    USING (public.user_is_request_named_approver(id))
    WITH CHECK (public.user_is_request_named_approver(id));

CREATE POLICY "sr_approvals_named_approver_select"
    ON service_request_approvals FOR SELECT
    USING (public.user_is_request_named_approver(service_request_id));

CREATE POLICY "sr_timeline_named_approver_select"
    ON service_request_timeline FOR SELECT
    USING (public.user_is_request_named_approver(service_request_id));

CREATE POLICY "Users can create service requests"
    ON service_requests FOR INSERT
    WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update own service requests"
    ON service_requests FOR UPDATE
    USING (requester_id = auth.uid() AND status IN ('draft', 'returned', 'submitted'))
    WITH CHECK (requester_id = auth.uid() AND status IN ('draft', 'returned', 'submitted', 'cancelled'));

CREATE POLICY "Approvers can update request status"
    ON service_requests FOR UPDATE
    USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('service_requests.approve')
    );

-- Super-admin-only hard delete. service_requests has no other DELETE policy, so
-- this additive is_super_admin() path is the sole grant; cascades clean up
-- approvals/timeline/attachments. (mig 20260624160000)
CREATE POLICY "service_requests_delete_super_admin"
    ON service_requests FOR DELETE
    TO authenticated
    USING (is_super_admin());

CREATE POLICY "Users can view approvals for their requests"
    ON service_request_approvals FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            approver_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM service_requests sr
                WHERE sr.id = service_request_approvals.service_request_id
                AND (sr.requester_id = auth.uid()
                    OR is_super_admin() OR is_admin())
            )
        )
    );

CREATE POLICY "System can create approval records"
    ON service_request_approvals FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Approvers can update their approvals"
    ON service_request_approvals FOR UPDATE
    USING (approver_id = auth.uid() OR is_super_admin() OR is_admin() OR user_has_permission('service_requests.approve'));

CREATE POLICY "Users can view timeline for own requests"
    ON service_request_timeline FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_requests sr
            WHERE sr.id = service_request_timeline.service_request_id
            AND (
                sr.requester_id = auth.uid()
                OR is_super_admin() OR is_admin()
                OR user_has_permission('service_requests.approve')
            )
        )
        AND (
            is_internal = false
            OR is_super_admin() OR is_admin()
            OR user_has_permission('service_requests.approve')
        )
    );

CREATE POLICY "Authenticated users can add timeline entries"
    ON service_request_timeline FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view attachments for accessible requests"
    ON service_request_attachments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_requests sr
            WHERE sr.id = service_request_attachments.service_request_id
            AND (sr.requester_id = auth.uid()
                OR is_super_admin() OR is_admin()
                OR user_has_permission('service_requests.approve'))
        )
    );

CREATE POLICY "Users can upload attachments to own requests"
    ON service_request_attachments FOR INSERT
    WITH CHECK (uploaded_by = auth.uid());

-- ================================================================================
-- SECTION: ADMISSION MODULE — Missing RLS Policies
-- Updated: 2026-02-27 — Add missing RLS policies for 6 tables that had RLS
--                        enabled but zero policies (all queries returned 0 rows)
-- Updated: 2026-03-04 — Added admission custom role bypass (role_key='admission')
-- Pattern: auth_institution_id() helper + super_admin bypass (matches 004_rls_policies.sql)
-- ================================================================================

-- Ensure helper function exists (also defined in 02_functions.sql)
-- Updated: 2026-04-13 - Changed to SECURITY DEFINER to match 02_functions.sql
CREATE OR REPLACE FUNCTION auth_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT institution_id FROM profiles WHERE id = auth.uid() LIMIT 1
$$;

-- ============================================================================
-- 1. ADMISSION LEAD SCORES
-- institution_id: direct column
-- ============================================================================
CREATE POLICY "lead_scores_select" ON admission_lead_scores FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "lead_scores_insert" ON admission_lead_scores FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "lead_scores_update" ON admission_lead_scores FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "lead_scores_delete" ON admission_lead_scores FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- ============================================================================
-- 2. ADMISSION TASKS
-- institution_id: direct column
-- ============================================================================
CREATE POLICY "admission_tasks_select" ON admission_tasks FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "admission_tasks_insert" ON admission_tasks FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "admission_tasks_update" ON admission_tasks FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "admission_tasks_delete" ON admission_tasks FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- ============================================================================
-- 3. ADMISSION CALL LOGS
-- institution_id: direct column
-- ============================================================================
CREATE POLICY "call_logs_select" ON admission_call_logs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "call_logs_insert" ON admission_call_logs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "call_logs_update" ON admission_call_logs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "call_logs_delete" ON admission_call_logs FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- ============================================================================
-- 4. ADMISSION AI INSIGHTS
-- institution_id: direct column
-- ============================================================================
CREATE POLICY "ai_insights_select" ON admission_ai_insights FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "ai_insights_insert" ON admission_ai_insights FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "ai_insights_update" ON admission_ai_insights FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "ai_insights_delete" ON admission_ai_insights FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- ============================================================================
-- 5. ADMISSION DAILY BRIEFINGS
-- institution_id: direct column
-- Special: also allows user_id = auth.uid() for personal briefing access
-- ============================================================================
CREATE POLICY "briefings_select" ON admission_daily_briefings FOR SELECT USING (
  user_id = auth.uid()
  OR institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "briefings_insert" ON admission_daily_briefings FOR INSERT
  WITH CHECK (
    institution_id = auth_institution_id()
    AND (user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'admission'
      ))
  );
CREATE POLICY "briefings_update" ON admission_daily_briefings FOR UPDATE USING (
  user_id = auth.uid()
);
CREATE POLICY "briefings_delete" ON admission_daily_briefings FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- ============================================================================
-- 6. ADMISSION WORKFLOW CONFIGS
-- institution_id: direct column
-- ============================================================================
CREATE POLICY "workflow_configs_select" ON admission_workflow_configs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "workflow_configs_insert" ON admission_workflow_configs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "workflow_configs_update" ON admission_workflow_configs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "workflow_configs_delete" ON admission_workflow_configs FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- ============================================================================
-- ADMISSION_YEARS TABLE (Dynamic permission-based policies)
-- Added: 2026-04-21 — per-program admission year tracking under Admission Settings
-- ============================================================================
ALTER TABLE admission_years ENABLE ROW LEVEL SECURITY;

-- 2026-08-31: `learners.profiles.view` added as a second accepted key. This is
-- a 79-row lookup naming the cohort on learners_profiles.admission_year_id, and
-- 17 of the 24 roles that can read a learner could not read that learner's
-- cohort name — leaving the admission-year filters on /learners/profiles and on
-- the Analytics Profile Completion drill-down silently empty for them.
-- Institution scope is unchanged.
DROP POLICY IF EXISTS "admission_years_select" ON admission_years;
CREATE POLICY "admission_years_select" ON admission_years
    FOR SELECT USING (
        (SELECT is_super_admin()) OR (SELECT is_admin())
        OR ((
                (SELECT user_has_permission('admission.settings.years.view'))
                OR (SELECT user_has_permission('learners.profiles.view'))
            )
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS "admission_years_insert" ON admission_years;
CREATE POLICY "admission_years_insert" ON admission_years
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (user_has_permission('admission.settings.years.create')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS "admission_years_update" ON admission_years;
CREATE POLICY "admission_years_update" ON admission_years
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('admission.settings.years.edit')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS "admission_years_delete" ON admission_years;
CREATE POLICY "admission_years_delete" ON admission_years
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('admission.settings.years.delete')
            AND role_has_institution_access(institution_id))
    );

-- ============================================================================
-- STORAGE: admission-template-media (WhatsApp template attachments)
-- Updated: 2026-03-02 — added super_admin bypass so admins selecting any
-- institution folder can upload/manage media regardless of their own institution_id
-- ============================================================================
CREATE POLICY "Public can read template media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'admission-template-media');

CREATE POLICY "Authenticated users can upload template media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'admission-template-media'
  AND (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR (storage.foldername(name))[1] = (SELECT institution_id::text FROM profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "Authenticated users can delete template media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'admission-template-media'
  AND (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR (storage.foldername(name))[1] = (SELECT institution_id::text FROM profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "Authenticated users can update template media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'admission-template-media'
  AND (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR (storage.foldername(name))[1] = (SELECT institution_id::text FROM profiles WHERE id = auth.uid())
  )
);

-- ================================================================================
-- SECTION: EDUCATION CONSULTANTS — Global Entity RLS Policies
-- Updated: 2026-03-02 — Consultants are global entities; SELECT is open to all
--                        authenticated users (no institution junction required).
--                        INSERT/UPDATE/DELETE remain institution-scoped or super_admin.
-- ================================================================================

ALTER TABLE education_consultants ENABLE ROW LEVEL SECURITY;

-- consultants are global entities visible to all authenticated users (no institution junction required)
CREATE POLICY "consultants_global_select"
  ON education_consultants FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "edu_consultants_insert"
  ON education_consultants FOR INSERT
  WITH CHECK (auth_institution_id() IS NOT NULL OR is_super_admin());

DROP POLICY IF EXISTS "edu_consultants_update" ON education_consultants;
CREATE POLICY "edu_consultants_update"
  ON education_consultants FOR UPDATE
  USING (auth_institution_id() IS NOT NULL OR is_super_admin())
  WITH CHECK (auth_institution_id() IS NOT NULL OR is_super_admin());

DROP POLICY IF EXISTS "edu_consultants_delete" ON education_consultants;
CREATE POLICY "edu_consultants_delete"
  ON education_consultants FOR DELETE
  USING (auth_institution_id() IS NOT NULL OR is_super_admin());

-- =====================================================
-- STARTUP STUDIO MODULE - RLS POLICIES
-- Created: 2026-03-05
-- =====================================================

-- institutions: allow faculty/hod/principal to read ALL institution rows
-- Added: 2026-03-07 — needed so institution:institutions(id,name) join works
-- in registrations table for cross-institution data display
DROP POLICY IF EXISTS "institutions_select_faculty_hod_principal" ON institutions;
CREATE POLICY "institutions_select_faculty_hod_principal" ON institutions
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('faculty', 'hod', 'principal')
        )
    );

-- startup_events: visible to all authenticated users
CREATE POLICY "startup_events_select_all" ON startup_events
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "startup_events_insert_admin" ON startup_events
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "startup_events_update_admin" ON startup_events
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_registrations: owner or admin/staff/faculty/hod/principal can read ALL institutions
-- Updated: 2026-03-06 — removed event_team_members subquery to break mutual RLS recursion
-- (event_registrations_select ↔ event_team_members_select caused infinite 42P17 cycle)
-- Updated: 2026-03-07 — faculty/hod/principal see all institutions (cross-institution visibility)
-- Invited members access registration data via SECURITY DEFINER function get_my_pending_invitations()
-- Updated: 2026-07-06 (migration 20260706150000) — ALSO honor the SF100/event admin
--   PERMISSION, not just the legacy profiles.role list. SF100 coordinators have
--   profiles.role='student' with admin rights from a custom role, so the legacy-only
--   check blanked every team name on the SF100 admin page. Gated on the admin-level
--   sf100.team.view / registrations.manage (NOT .view — the 'student' role carries
--   .view). CASE guard so user_has_permission is never evaluated for anon (a scalar
--   sub-select would InitPlan-evaluate it and throw permission-denied for anon).
CREATE POLICY "event_registrations_select" ON event_registrations
    FOR SELECT TO authenticated USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND (
                p.is_super_admin = true
                OR p.role IN ('admin', 'administrator', 'staff', 'faculty', 'hod', 'principal')
              )
        )
        OR (CASE WHEN auth.uid() IS NULL THEN false
                 ELSE (public.user_has_permission('startup_studio.sf100.team.view')
                       OR public.user_has_permission('startup_studio.registrations.manage'))
            END)
    );

-- Updated: 2026-03-09 — allow any authenticated user to read all registrations for events
-- where voting has been opened. This enables the vote page to show all teams, not just the
-- viewer's own team. PERMISSIVE policy — OR'd with the existing policy above.
CREATE POLICY "event_registrations_voting_select" ON event_registrations
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM startup_events
            WHERE startup_events.id = event_registrations.event_id
              AND startup_events.voting_opened_at IS NOT NULL
        )
    );

CREATE POLICY "event_registrations_insert" ON event_registrations
    FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "event_registrations_update" ON event_registrations
    FOR UPDATE TO authenticated USING (
        owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- Updated: 2026-03-08 - Team owner (student leader) can also delete their own registration
-- Super admins retain full delete access; regular admins use status updates instead
CREATE POLICY "event_registrations_delete" ON event_registrations
    FOR DELETE TO authenticated USING (
        (owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

-- event_team_members: mirrors event_registrations_select — all institutions for faculty/hod/principal
-- Updated: 2026-03-07 — faculty/hod/principal see all institutions' team members
CREATE POLICY "event_team_members_select" ON event_team_members
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM event_registrations er
            WHERE er.id = event_team_members.registration_id
              AND (
                er.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                      AND (
                        p.is_super_admin = true
                        OR p.role IN ('admin', 'administrator', 'staff', 'faculty', 'hod', 'principal')
                      )
                )
              )
        )
    );

-- Updated: 2026-03-06 — separate policy so invited members can read their own row (no subquery avoids recursion)
CREATE POLICY "event_team_members_member_self_select" ON event_team_members
    FOR SELECT TO authenticated USING (
        profile_id = auth.uid()
    );

-- Updated: 2026-03-06 — allows invitees to accept/decline (update status/responded_at on own row)
-- Without this policy, respondToInvitation silently affected 0 rows (RLS blocked UPDATE, no error returned)
CREATE POLICY "event_team_members_member_self_update" ON event_team_members
    FOR UPDATE TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "event_team_members_insert" ON event_team_members
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_team_members.registration_id AND owner_id = auth.uid())
    );

CREATE POLICY "event_team_members_delete" ON event_team_members
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_team_members.registration_id AND owner_id = auth.uid())
    );

-- event_venue_assignments: all read, admin manage
CREATE POLICY "event_venue_assignments_select" ON event_venue_assignments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_venue_assignments_insert_admin" ON event_venue_assignments
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_venue_assignments_update_admin" ON event_venue_assignments
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_venue_assignments_delete_admin" ON event_venue_assignments
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_team_venue_allocations: all read, admin manage
CREATE POLICY "event_team_venue_allocations_select" ON event_team_venue_allocations
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_team_venue_allocations_insert_admin" ON event_team_venue_allocations
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_team_venue_allocations_update_admin" ON event_team_venue_allocations
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_team_venue_allocations_delete_admin" ON event_team_venue_allocations
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_staff_assignments: all read, admin manage
CREATE POLICY "event_staff_assignments_select" ON event_staff_assignments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_staff_assignments_insert_admin" ON event_staff_assignments
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_staff_assignments_update_admin" ON event_staff_assignments
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_staff_assignments_delete_admin" ON event_staff_assignments
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_demo_slots: all read, admin manage
CREATE POLICY "event_demo_slots_select" ON event_demo_slots
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_demo_slots_insert_admin" ON event_demo_slots
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_demo_slots_update_admin" ON event_demo_slots
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_demo_slots_delete_admin" ON event_demo_slots
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_submissions: owner CRUD, admin + staff read
CREATE POLICY "event_submissions_select" ON event_submissions
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_submissions.registration_id AND owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator', 'staff')))
    );

-- Updated: 2026-03-09 — allow any authenticated user to read submissions for events where
-- voting is open. Required so the vote page can show all teams' app_name / submission data.
-- PERMISSIVE policy — OR'd with the policies above.
CREATE POLICY "event_submissions_voting_select" ON event_submissions
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1
            FROM event_registrations er
            JOIN startup_events se ON se.id = er.event_id
            WHERE er.id = event_submissions.registration_id
              AND se.voting_opened_at IS NOT NULL
        )
    );

CREATE POLICY "event_submissions_insert" ON event_submissions
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_submissions.registration_id AND owner_id = auth.uid())
    );

CREATE POLICY "event_submissions_update" ON event_submissions
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_submissions.registration_id AND owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_checklists + items: all read, admin manage
CREATE POLICY "event_checklists_select" ON event_checklists
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_checklists_insert_admin" ON event_checklists
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_checklists_update_admin" ON event_checklists
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_checklists_delete_admin" ON event_checklists
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_checklist_items_select" ON event_checklist_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_checklist_items_insert_admin" ON event_checklist_items
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_checklist_items_update_admin" ON event_checklist_items
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_checklist_items_delete_admin" ON event_checklist_items
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_checklist_completions: own completions + admin/faculty can complete on behalf of teams
CREATE POLICY "event_checklist_completions_select" ON event_checklist_completions
    FOR SELECT TO authenticated USING (true);

-- Updated: 2026-03-23 - Allow admin/faculty/hod to complete checklist items (not just own user)
CREATE POLICY "event_checklist_completions_insert" ON event_checklist_completions
    FOR INSERT TO authenticated WITH CHECK (
        completed_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (is_super_admin = true OR role IN ('admin', 'administrator', 'faculty', 'hod', 'principal'))
        )
    );

-- Updated: 2026-03-23 - Allow admin/faculty/hod to delete completions (for unchecking team checklist items)
CREATE POLICY "event_checklist_completions_delete_own" ON event_checklist_completions
    FOR DELETE TO authenticated USING (
        completed_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (is_super_admin = true OR role IN ('admin', 'administrator', 'faculty', 'hod', 'principal'))
        )
    );

-- Updated: 2026-03-06 - Grant execute on facilitator attendance stats RPC
GRANT EXECUTE ON FUNCTION get_facilitator_attendance_stats(UUID, DATE, DATE, UUID, UUID)
  TO authenticated;

-- ── event_team_attendance (startup studio attendance) — Added 2026-03-07 ──────

-- All authenticated users can read
CREATE POLICY "event_team_attendance_select" ON event_team_attendance
    FOR SELECT TO authenticated USING (true);

-- Updated: 2026-03-08 - Faculty roles (faculty, hod, principal, staff, lecturer)
-- can also insert attendance for any venue, not just assigned staff
CREATE POLICY "event_team_attendance_insert" ON event_team_attendance
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                is_super_admin = true
                OR role IN ('admin', 'administrator')
                OR role IN ('faculty', 'hod', 'principal', 'staff', 'lecturer')
            )
        )
        OR EXISTS (
            SELECT 1 FROM event_staff_assignments esa
            JOIN staff s ON esa.staff_id = s.id
            JOIN profiles p ON p.email = s.email
            WHERE p.id = auth.uid()
            AND esa.venue_assignment_id = event_team_attendance.venue_assignment_id
            AND esa.event_id = event_team_attendance.event_id
        )
    );

-- Updated: 2026-03-08 - Faculty roles can also update attendance
CREATE POLICY "event_team_attendance_update" ON event_team_attendance
    FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                is_super_admin = true
                OR role IN ('admin', 'administrator')
                OR role IN ('faculty', 'hod', 'principal', 'staff', 'lecturer')
            )
        )
        OR EXISTS (
            SELECT 1 FROM event_staff_assignments esa
            JOIN staff s ON esa.staff_id = s.id
            JOIN profiles p ON p.email = s.email
            WHERE p.id = auth.uid()
            AND esa.venue_assignment_id = event_team_attendance.venue_assignment_id
            AND esa.event_id = event_team_attendance.event_id
        )
    );

-- Only super admins can delete
CREATE POLICY "event_team_attendance_delete" ON event_team_attendance
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

-- ══════════════════════════════════════════════════════════════
-- RLS: appathon_role_cards & appathon_peer_tags (Added: 2026-03-08)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE appathon_role_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE appathon_peer_tags  ENABLE ROW LEVEL SECURITY;

-- Role Cards: SELECT (own card OR same team OR admin/faculty)
CREATE POLICY "role_cards_select" ON appathon_role_cards FOR SELECT USING (
  auth.uid() = profile_id
  OR EXISTS (
    SELECT 1 FROM event_team_members etm
    WHERE etm.profile_id = auth.uid()
      AND etm.status = 'accepted'
      AND etm.registration_id = appathon_role_cards.team_id
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'principal', 'hod', 'faculty')
  )
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
);

-- Role Cards: INSERT (defence-in-depth alongside SECURITY DEFINER RPC)
CREATE POLICY "role_cards_insert" ON appathon_role_cards FOR INSERT WITH CHECK (
  auth.uid() = profile_id
);

-- Peer Tags: SELECT (own tags OR same team via role card OR admin)
CREATE POLICY "peer_tags_select" ON appathon_peer_tags FOR SELECT USING (
  auth.uid() = tagger_profile_id
  OR EXISTS (
    SELECT 1 FROM appathon_role_cards rc
    JOIN event_team_members etm ON etm.registration_id = rc.team_id
    WHERE rc.id = appathon_peer_tags.role_card_id
      AND etm.profile_id = auth.uid()
      AND etm.status = 'accepted'
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'principal', 'hod', 'faculty')
  )
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
);

-- Peer Tags: INSERT (only via RPC — role card must be owned by caller)
CREATE POLICY "peer_tags_insert" ON appathon_peer_tags FOR INSERT WITH CHECK (
  auth.uid() = tagger_profile_id
  AND EXISTS (
    SELECT 1 FROM appathon_role_cards rc
    WHERE rc.id = appathon_peer_tags.role_card_id
      AND rc.profile_id = auth.uid()
  )
);

-- ─── RLS: appathon_verifications ──────────────────────────────────────────
-- Added: 2026-03-08
ALTER TABLE appathon_verifications ENABLE ROW LEVEL SECURITY;

-- Evaluators see their own; admins see all
-- Updated: 2026-03-08 - Added is_super_admin check for consistency with peer_tags_select pattern
CREATE POLICY "appathon_verifications_select"
    ON appathon_verifications FOR SELECT
    USING (
        evaluator_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'super_admin', 'administrator')
        )
        OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
    );

-- Evaluators can create their own verifications
-- Must be assigned to the venue as judge/panel_chair/evaluator for demo_day
-- Super admins / admins bypass the staff-assignment check
-- Updated: 2026-03-08 - Added admin bypass consistent with UPDATE policy
CREATE POLICY "appathon_verifications_insert"
    ON appathon_verifications FOR INSERT
    WITH CHECK (
        evaluator_id = auth.uid()
        AND (
            EXISTS (
                SELECT 1
                FROM event_staff_assignments esa
                JOIN staff s ON s.id = esa.staff_id
                WHERE esa.venue_assignment_id = appathon_verifications.venue_id
                AND s.profile_id = auth.uid()
                AND esa.role IN ('judge', 'panel_chair', 'evaluator')
                AND esa.day_type = 'demo_day'
            )
            OR EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND p.role IN ('admin', 'super_admin', 'administrator')
            )
            OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
        )
    );

-- Evaluators update their own; admins update any
-- Updated: 2026-03-08 - Added is_super_admin check for consistency with peer_tags_select pattern
CREATE POLICY "appathon_verifications_update"
    ON appathon_verifications FOR UPDATE
    USING (
        evaluator_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'super_admin', 'administrator')
        )
        OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
    );

-- ─── Audience Votes RLS (Demo Day Live Voting) ────────────────────────────
-- Updated: 2026-03-08 - Added RLS policies for audience_votes table
-- Any authenticated user can read votes (for leaderboard display).
-- Users can only insert/update their own vote row.
ALTER TABLE audience_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audience_votes_select"
  ON audience_votes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Voting window (voting_opened_at / voting_closed_at) is enforced at the
-- application layer in AudienceVoteService.castVote(). The policy only
-- enforces identity — users may only insert their own vote.
CREATE POLICY "audience_votes_insert"
  ON audience_votes FOR INSERT
  WITH CHECK (auth.uid() = voter_profile_id);

CREATE POLICY "audience_votes_update"
  ON audience_votes FOR UPDATE
  USING (auth.uid() = voter_profile_id)
  WITH CHECK (auth.uid() = voter_profile_id);

-- ============================================================
-- RLS: POST DEMO DAY PIPELINE TABLES
-- Added: 2026-03-09
-- ============================================================

ALTER TABLE track_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE progression_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;

-- ---- track_declarations policies ----

CREATE POLICY "track_declarations_select_own_team"
  ON track_declarations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = track_declarations.team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = track_declarations.team_id
        AND er.owner_id = auth.uid()
    )
  );

CREATE POLICY "track_declarations_select_admin"
  ON track_declarations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'faculty', 'hod', 'principal')
    )
  );

CREATE POLICY "track_declarations_insert_leader"
  ON track_declarations FOR INSERT
  WITH CHECK (
    declared_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = team_id
        AND er.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM startup_events se
      WHERE se.id = event_id
        AND se.is_results_published = true
    )
  );

CREATE POLICY "track_declarations_update_leader"
  ON track_declarations FOR UPDATE
  USING (
    declared_by = auth.uid()
  )
  WITH CHECK (
    declared_by = auth.uid()
  );

CREATE POLICY "track_declarations_update_admin"
  ON track_declarations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'faculty', 'hod', 'principal')
    )
  );

-- DELETE: Admin only (no user-initiated deletes)
CREATE POLICY "track_declarations_delete_admin"
  ON track_declarations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ---- progression_levels policies ----

CREATE POLICY "progression_levels_select_own"
  ON progression_levels FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "progression_levels_select_admin"
  ON progression_levels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'faculty', 'hod', 'principal')
    )
  );

CREATE POLICY "progression_levels_insert_admin"
  ON progression_levels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "progression_levels_update_admin"
  ON progression_levels FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ---- case_studies policies ----

CREATE POLICY "case_studies_select_own_team"
  ON case_studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = case_studies.team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = case_studies.team_id
        AND er.owner_id = auth.uid()
    )
  );

CREATE POLICY "case_studies_select_public_after_publish"
  ON case_studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM startup_events se
      WHERE se.id = case_studies.event_id
        AND se.is_results_published = true
    )
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "case_studies_select_admin"
  ON case_studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'faculty', 'hod', 'principal')
    )
  );

CREATE POLICY "case_studies_insert_team_member"
  ON case_studies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = team_id
        AND er.owner_id = auth.uid()
    )
  );

CREATE POLICY "case_studies_update_team_member"
  ON case_studies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = case_studies.team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = case_studies.team_id
        AND er.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = case_studies.team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = case_studies.team_id
        AND er.owner_id = auth.uid()
    )
  );

CREATE POLICY "case_studies_update_admin"
  ON case_studies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- DELETE: Admin only (no user-initiated deletes)
CREATE POLICY "case_studies_delete_admin"
  ON case_studies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- NOTE: progression_levels has no DELETE policy intentionally — levels are permanent records.
-- Admin cleanup must be done via service role key directly in Supabase dashboard.

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPO MODULE RLS POLICIES
-- Updated: 2026-03-14 - Expos are global (not institution-scoped), all authenticated users have full access
-- ═══════════════════════════════════════════════════════════════════════════

-- Updated: 2026-03-26 — Added super_admin + admission role bypass to all expo policies
CREATE POLICY "expo_masters_select" ON expo_masters FOR SELECT USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_masters_insert" ON expo_masters FOR INSERT WITH CHECK (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_masters_update" ON expo_masters FOR UPDATE USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_masters_delete" ON expo_masters FOR DELETE USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

CREATE POLICY "expo_events_select" ON expo_events FOR SELECT USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_events_insert" ON expo_events FOR INSERT WITH CHECK (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_events_update" ON expo_events FOR UPDATE USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_events_delete" ON expo_events FOR DELETE USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

CREATE POLICY "expo_team_select" ON expo_event_team_members FOR SELECT USING (
  expo_event_id IN (SELECT id FROM expo_events WHERE institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_team_insert" ON expo_event_team_members FOR INSERT WITH CHECK (
  expo_event_id IN (SELECT id FROM expo_events WHERE institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_team_update" ON expo_event_team_members FOR UPDATE USING (
  expo_event_id IN (SELECT id FROM expo_events WHERE institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_team_delete" ON expo_event_team_members FOR DELETE USING (
  expo_event_id IN (SELECT id FROM expo_events WHERE institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

CREATE POLICY "expo_reports_select" ON expo_daily_reports FOR SELECT USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_reports_insert" ON expo_daily_reports FOR INSERT WITH CHECK (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_reports_update" ON expo_daily_reports FOR UPDATE USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "expo_reports_delete" ON expo_daily_reports FOR DELETE USING (
  institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

-- =============================================================================
-- Expo WhatsApp Message Queue — RLS
-- Added: 2026-03-31
-- Pattern: accessible via expo_event team membership + super_admin/admission bypass
-- Service role used for insert/update (server-side only); clients can SELECT for stats
-- =============================================================================

ALTER TABLE expo_wa_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expo_wa_queue_select" ON expo_wa_message_queue FOR SELECT USING (
  expo_event_id = ANY(get_my_expo_event_ids())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

-- =============================================================================
-- BYOW WhatsApp Personal Connections — RLS
-- Added: 2026-03-16
-- Pattern: department_id match via profiles + super_admin bypass + admission custom role
-- Updated: 2026-03-18 - Changed from institution_id to department_id based access
-- =============================================================================

ALTER TABLE wa_personal_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_personal_conn_select" ON wa_personal_connections FOR SELECT USING (
  department_id = (SELECT department_id FROM profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_conn_insert" ON wa_personal_connections FOR INSERT WITH CHECK (
  department_id = (SELECT department_id FROM profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_conn_update" ON wa_personal_connections FOR UPDATE USING (
  department_id = (SELECT department_id FROM profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_conn_delete" ON wa_personal_connections FOR DELETE USING (
  department_id = (SELECT department_id FROM profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

ALTER TABLE wa_personal_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_personal_msg_select" ON wa_personal_message_logs FOR SELECT USING (
  department_id = (SELECT department_id FROM profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_msg_insert" ON wa_personal_message_logs FOR INSERT WITH CHECK (
  department_id = (SELECT department_id FROM profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_msg_update" ON wa_personal_message_logs FOR UPDATE USING (
  department_id = (SELECT department_id FROM profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- =============================================================================
-- Personal WhatsApp Message Templates — RLS
-- Added: 2026-04-02
-- Pattern: institution_id match + super_admin bypass + admission custom role
-- =============================================================================

CREATE POLICY "wa_personal_templates_select" ON wa_personal_message_templates FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_templates_insert" ON wa_personal_message_templates FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_templates_update" ON wa_personal_message_templates FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_templates_delete" ON wa_personal_message_templates FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- =============================================================================
-- WhatsApp Auto-Trigger Rules — RLS
-- Added: 2026-04-02
-- =============================================================================

CREATE POLICY "wa_auto_trigger_rules_select" ON wa_auto_trigger_rules FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_auto_trigger_rules_insert" ON wa_auto_trigger_rules FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_auto_trigger_rules_update" ON wa_auto_trigger_rules FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_auto_trigger_rules_delete" ON wa_auto_trigger_rules FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- =============================================================================
-- Personal WhatsApp Message Queue — RLS
-- Added: 2026-04-02
-- =============================================================================

CREATE POLICY "wa_personal_queue_select" ON wa_personal_message_queue FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_queue_insert" ON wa_personal_message_queue FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);
CREATE POLICY "wa_personal_queue_update" ON wa_personal_message_queue FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- =============================================================================
-- Marketing Leads Database Policies
-- Added: 2026-03-17
-- =============================================================================

CREATE POLICY "marketing_leads_db_select" ON marketing_leads_database FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

CREATE POLICY "marketing_leads_db_insert" ON marketing_leads_database FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

CREATE POLICY "marketing_leads_db_update" ON marketing_leads_database FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

CREATE POLICY "marketing_leads_db_delete" ON marketing_leads_database FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = auth.uid()
    AND cr.role_key = 'admission'
  )
);

-- =============================================================================
-- SARVAM GALATTA REGISTRATIONS POLICIES
-- Added: 2026-03-19
-- =============================================================================

CREATE POLICY "sgr_select_own" ON sarvam_galatta_registrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = registration_id AND er.owner_id = auth.uid()
    )
  );

CREATE POLICY "sgr_insert_own" ON sarvam_galatta_registrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = registration_id AND er.owner_id = auth.uid()
    )
  );

CREATE POLICY "sgr_update_own" ON sarvam_galatta_registrations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = registration_id AND er.owner_id = auth.uid()
    )
  );

CREATE POLICY "sgr_all_super_admin" ON sarvam_galatta_registrations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true
    )
  );

-- ============================================================
-- attendance_audit_log RLS policies
-- Added: 2026-03-20
-- SELECT: super_admin only (audit history is admin-only visibility)
-- INSERT: super_admin and hod only (matches edit permission table)
-- No UPDATE or DELETE — log is immutable
-- ============================================================
ALTER TABLE public.attendance_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_super_admin"
    ON public.attendance_audit_log
    FOR SELECT
    USING (get_current_user_role() = 'super_admin');

CREATE POLICY "audit_log_insert_by_role"
    ON public.attendance_audit_log
    FOR INSERT
    WITH CHECK (get_current_user_role() IN ('super_admin', 'hod'));

-- Updated: 2026-03-20 — RLS for institution_off_days (pending attendance filtering)

-- Enable RLS
ALTER TABLE public.institution_off_days ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users may read off days for their own institution
-- (faculty need this to exclude off days from their pending periods view)
CREATE POLICY "institution_off_days_select"
  ON institution_off_days FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT/UPDATE/DELETE: Institution admins and super_admin only
CREATE POLICY "institution_off_days_write"
  ON institution_off_days FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access
      WHERE user_id = auth.uid()
        AND institution_id = institution_off_days.institution_id
        AND access_type = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_institution_access
      WHERE user_id = auth.uid()
        AND institution_id = institution_off_days.institution_id
        AND access_type = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ================================================================================
-- SECTION: VAC (Value-Added Courses) + CASE Graduation Tracker RLS
-- Added: 2026-04-02
-- ================================================================================

-- Enable RLS on all VAC/CASE tables
ALTER TABLE vac_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_learner_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE vac_course_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_track_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_track_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_learner_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_graduation_requirements ENABLE ROW LEVEL SECURITY;

-- ── vac_courses ──────────────────────────────────────────────────────────────

-- SELECT: Institution-scoped read for authenticated users
CREATE POLICY "vac_courses_select" ON vac_courses
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT/UPDATE: Institution admins
CREATE POLICY "vac_courses_insert" ON vac_courses
  FOR INSERT WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "vac_courses_update" ON vac_courses
  FOR UPDATE USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- DELETE: Super admin only
CREATE POLICY "vac_courses_delete" ON vac_courses
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── vac_lessons ──────────────────────────────────────────────────────────────

-- SELECT: Via course institution access
CREATE POLICY "vac_lessons_select" ON vac_lessons
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vac_courses vc
      WHERE vc.id = vac_lessons.course_id
      AND (
        vc.institution_id IN (
          SELECT institution_id FROM user_institution_access
          WHERE user_id = auth.uid() AND is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
      )
    )
  );

-- INSERT/UPDATE/DELETE: Admin via course institution
CREATE POLICY "vac_lessons_write" ON vac_lessons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM vac_courses vc
      WHERE vc.id = vac_lessons.course_id
      AND vc.institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vac_courses vc
      WHERE vc.id = vac_lessons.course_id
      AND vc.institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── vac_enrollments ──────────────────────────────────────────────────────────

-- SELECT: Own data + admin
CREATE POLICY "vac_enrollments_select" ON vac_enrollments
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM vac_courses vc
      WHERE vc.id = vac_enrollments.course_id
      AND vc.institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT: Authenticated users (enroll themselves)
CREATE POLICY "vac_enrollments_insert" ON vac_enrollments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- UPDATE: Own data + admin
CREATE POLICY "vac_enrollments_update" ON vac_enrollments
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM vac_courses vc
      WHERE vc.id = vac_enrollments.course_id
      AND vc.institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- DELETE: Admin only
CREATE POLICY "vac_enrollments_delete" ON vac_enrollments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── vac_learner_progress ─────────────────────────────────────────────────────

-- SELECT: Own data + admin
CREATE POLICY "vac_learner_progress_select" ON vac_learner_progress
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM vac_courses vc
      WHERE vc.id = vac_learner_progress.course_id
      AND vc.institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT/UPDATE: Own data
CREATE POLICY "vac_learner_progress_write" ON vac_learner_progress
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── vac_course_programmes ────────────────────────────────────────────────────

-- SELECT: Authenticated read (needed for recommendations)
CREATE POLICY "vac_course_programmes_select" ON vac_course_programmes
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- WRITE: Admin only
CREATE POLICY "vac_course_programmes_write" ON vac_course_programmes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM vac_courses vc
      WHERE vc.id = vac_course_programmes.course_id
      AND vc.institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vac_courses vc
      WHERE vc.id = vac_course_programmes.course_id
      AND vc.institution_id IN (
        SELECT institution_id FROM user_institution_access
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── case_tracks ──────────────────────────────────────────────────────────────

-- SELECT: All authenticated (public catalog)
CREATE POLICY "case_tracks_select" ON case_tracks
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- WRITE: Super admin only (6 tracks are fixed)
CREATE POLICY "case_tracks_write" ON case_tracks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── case_track_courses ───────────────────────────────────────────────────────

-- SELECT: Institution-scoped
CREATE POLICY "case_track_courses_select" ON case_track_courses
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR institution_id IS NULL
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- WRITE: Admin
CREATE POLICY "case_track_courses_write" ON case_track_courses
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── case_track_enrollments ───────────────────────────────────────────────────

-- SELECT: Own data + admin
CREATE POLICY "case_track_enrollments_select" ON case_track_enrollments
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'faculty')
    )
  );

-- INSERT: Own enrollment
CREATE POLICY "case_track_enrollments_insert" ON case_track_enrollments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- UPDATE: Own data + admin
CREATE POLICY "case_track_enrollments_update" ON case_track_enrollments
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'faculty')
    )
  );

-- DELETE: Super admin only
CREATE POLICY "case_track_enrollments_delete" ON case_track_enrollments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── case_batches ─────────────────────────────────────────────────────────────

-- SELECT: Institution-scoped
CREATE POLICY "case_batches_select" ON case_batches
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- WRITE: Admin
CREATE POLICY "case_batches_write" ON case_batches
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── case_learner_progress ────────────────────────────────────────────────────

-- SELECT: Own data + admin
CREATE POLICY "case_learner_progress_select" ON case_learner_progress
  FOR SELECT USING (
    user_id = auth.uid()
    OR institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT/UPDATE: Own data + admin
CREATE POLICY "case_learner_progress_write" ON case_learner_progress
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── case_alerts ──────────────────────────────────────────────────────────────

-- SELECT: Own alerts + coordinator
CREATE POLICY "case_alerts_select" ON case_alerts
  FOR SELECT USING (
    user_id = auth.uid()
    OR coordinator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- INSERT: System/admin only (generated by cron)
CREATE POLICY "case_alerts_insert" ON case_alerts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- UPDATE: Mark as read (own alerts only)
CREATE POLICY "case_alerts_update" ON case_alerts
  FOR UPDATE USING (
    user_id = auth.uid()
    OR coordinator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── case_graduation_requirements ─────────────────────────────────────────────

-- SELECT: Institution-scoped
CREATE POLICY "case_graduation_requirements_select" ON case_graduation_requirements
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- WRITE: Super admin only
CREATE POLICY "case_graduation_requirements_write" ON case_graduation_requirements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================================
-- EVENTS MODULE — RLS Policies
-- Created: 2026-04-07
-- Note: events_registrations uses "events_" prefix (Startup Studio owns "event_registrations")
-- ============================================================================

-- ── events ───────────────────────────────────────────────────────────────────

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Public can read active/public events (not draft or cancelled)
CREATE POLICY "events_public_read" ON public.events
  FOR SELECT USING (is_public = true AND status NOT IN ('draft','cancelled'));

-- Authenticated users can read their institution's events
CREATE POLICY "events_auth_read" ON public.events
  FOR SELECT TO authenticated USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Create for your institution, but you may not plant an event under someone
-- else's name: fn_guard_event_privileged_fields freezes created_by, but it is a
-- BEFORE UPDATE trigger and never sees an INSERT. Who may create is unchanged.
CREATE POLICY "events_auth_insert" ON public.events
  FOR INSERT TO authenticated WITH CHECK (
    (
      (SELECT public.is_super_admin())
      OR (SELECT public.get_current_user_role()) = ANY (ARRAY['super_admin', 'admin', 'administrator'])
      OR institution_id IN (
        SELECT p.institution_id FROM public.profiles p
         WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
      )
    )
    AND (
      created_by IS NULL
      OR created_by = (SELECT auth.uid())
      OR (SELECT public.is_super_admin())
    )
  );

-- Creator-owned edit (2026-08-06). Was "any user whose profile institution
-- matches", i.e. everyone in the institution could edit every event. Event
-- in-charges keep their own write path via events_incharge_update below —
-- permissive policies OR together, so this does not touch them.
-- The created_by IS NULL arm is the grandfather clause for the 37 rows that
-- predate ownership; it repeats the OLD institution predicate verbatim rather
-- than calling role_has_institution_access(), which is wider (it returns true
-- for any institution_scope='all' role holder).
-- No WITH CHECK: Postgres reuses USING as the check for UPDATE when it is
-- omitted, so a row cannot be edited into someone else's ownership.
CREATE POLICY "events_auth_update" ON public.events
  FOR UPDATE TO authenticated USING (
    (SELECT public.is_super_admin())
    OR events.created_by = (SELECT auth.uid())
    OR (
      events.created_by IS NULL
      AND events.institution_id IN (
        SELECT p.institution_id FROM public.profiles p
         WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
      )
    )
  );

-- Delete is gated on the events.delete permission key + institution access.
-- Was "any user whose profile institution matches", which handed DELETE to all
-- 5,703 non-super-admin users in an institution that owns events — learners
-- included — on a row that cascades through 43 child tables (registrations,
-- payment transactions, tournament matches). Replaced 2026-08-06; see
-- supabase/migrations/20260806_events_delete_permission_gate.sql.
-- user_has_permission() already carries the super-admin bypass.
CREATE POLICY "events_auth_delete" ON public.events
  FOR DELETE TO authenticated USING (
    (SELECT public.user_has_permission('events.delete'))
    AND public.role_has_institution_access(events.institution_id)
  );

-- ── event_categories ─────────────────────────────────────────────────────────

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

-- Public can read categories for public events
CREATE POLICY "event_categories_public_read" ON public.event_categories
  FOR SELECT USING (
    event_id IN (SELECT id FROM public.events WHERE is_public = true AND status NOT IN ('draft','cancelled'))
  );

-- Authenticated users can manage categories for their institution's events
CREATE POLICY "event_categories_auth_all" ON public.event_categories
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ── event_external_participants ───────────────────────────────────────────────

ALTER TABLE public.event_external_participants ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (external registration)
CREATE POLICY "ext_participants_public_insert" ON public.event_external_participants
  FOR INSERT WITH CHECK (true);

-- Public read needed for phone lookup during registration flow
CREATE POLICY "ext_participants_public_read" ON public.event_external_participants
  FOR SELECT USING (true);

-- ── events_registrations ─────────────────────────────────────────────────────

ALTER TABLE public.events_registrations ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (external app can register participants)
CREATE POLICY "events_reg_public_insert" ON public.events_registrations
  FOR INSERT WITH CHECK (true);

-- Admins / event coordinators can read all registrations
CREATE POLICY "events_reg_admin_read" ON public.events_registrations
  FOR SELECT TO authenticated USING (
    is_super_admin() OR get_current_user_role() = ANY(ARRAY['super_admin','admin','administrator','event_coordinator'])
  );

-- Admins / event coordinators can update all registrations
CREATE POLICY "events_reg_admin_update" ON public.events_registrations
  FOR UPDATE TO authenticated USING (
    is_super_admin() OR get_current_user_role() = ANY(ARRAY['super_admin','admin','administrator','event_coordinator'])
  );

-- Updated: 2026-04-12 - Any authenticated user can update registrations for public active events
-- This enables event-day ops (check-in, t-shirt, certificate) by committee members of any role
CREATE POLICY "events_reg_public_event_update" ON public.events_registrations
  FOR UPDATE TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events
      WHERE is_public = true AND status NOT IN ('draft', 'cancelled')
    )
  );

-- Updated: 2026-04-12 - Committee members (any role, including students) can update registrations
-- for events where they are a committee lead or member. This ensures ops access even for non-public events.
CREATE POLICY "events_reg_committee_member_update" ON public.events_registrations
  FOR UPDATE TO authenticated USING (
    event_id IN (
      SELECT mc.event_id FROM public.marathon_committees mc
      WHERE mc.lead_id = auth.uid()
         OR auth.uid() = ANY(mc.member_ids)
         OR mc.lead_name IN (
              SELECT p.full_name FROM public.profiles p
              WHERE p.id = auth.uid() AND p.full_name IS NOT NULL
            )
         OR EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid()
                AND p.full_name IS NOT NULL
                AND p.full_name = ANY(mc.member_names)
            )
    )
  );

-- Updated: 2026-04-12 - Committee members (any role, including students) can read ALL registrations
-- for events where they are a committee lead or member. Needed for ops: scan any BIB, search participants.
CREATE POLICY "events_reg_committee_member_read" ON public.events_registrations
  FOR SELECT TO authenticated USING (
    event_id IN (
      SELECT mc.event_id FROM public.marathon_committees mc
      WHERE mc.lead_id = auth.uid()
         OR auth.uid() = ANY(mc.member_ids)
         OR mc.lead_name IN (
              SELECT p.full_name FROM public.profiles p
              WHERE p.id = auth.uid() AND p.full_name IS NOT NULL
            )
         OR EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid()
                AND p.full_name IS NOT NULL
                AND p.full_name = ANY(mc.member_names)
            )
    )
  );

-- Authenticated users can read registrations where the registration's institution matches theirs
CREATE POLICY "events_reg_institution_read" ON public.events_registrations
  FOR SELECT TO authenticated USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles
      WHERE id = auth.uid() AND institution_id IS NOT NULL
    )
  );

-- Anyone can read registrations for public, active events
CREATE POLICY "events_reg_public_event_read" ON public.events_registrations
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM public.events
      WHERE is_public = true AND status NOT IN ('draft','cancelled')
    )
  );

-- Users can always read their own registration(s) regardless of event institution
CREATE POLICY "events_reg_self_read" ON public.events_registrations
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── event_payment_transactions ────────────────────────────────────────────────

ALTER TABLE public.event_payment_transactions ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (payment gateway initiates transactions)
CREATE POLICY "event_payments_public_insert" ON public.event_payment_transactions
  FOR INSERT WITH CHECK (true);

-- Public read needed for status checks by external app and payers
CREATE POLICY "event_payments_public_read" ON public.event_payment_transactions
  FOR SELECT USING (true);

-- Public update needed for gateway webhooks to update status
CREATE POLICY "event_payments_public_update" ON public.event_payment_transactions
  FOR UPDATE USING (true);

-- Authenticated users can read all payment transactions for their institution
CREATE POLICY "event_payments_auth_read" ON public.event_payment_transactions
  FOR SELECT TO authenticated USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ── marathon_sponsors ─────────────────────────────────────────────────────────

ALTER TABLE public.marathon_sponsors ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage sponsors for their institution's events
CREATE POLICY "marathon_sponsors_auth_all" ON public.marathon_sponsors
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Public can read committed sponsors for public events
CREATE POLICY "marathon_sponsors_public_read" ON public.marathon_sponsors
  FOR SELECT USING (
    pipeline_stage = 'committed' AND
    event_id IN (SELECT id FROM public.events WHERE is_public = true)
  );

-- ── marathon_sponsor_deliverables ─────────────────────────────────────────────

ALTER TABLE public.marathon_sponsor_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marathon_deliverables_auth_all" ON public.marathon_sponsor_deliverables
  FOR ALL TO authenticated USING (true);

-- ── marathon_sponsor_activity_log ─────────────────────────────────────────────

ALTER TABLE public.marathon_sponsor_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marathon_activity_auth_all" ON public.marathon_sponsor_activity_log
  FOR ALL TO authenticated USING (true);

-- ── marathon_committees ───────────────────────────────────────────────────────

ALTER TABLE public.marathon_committees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marathon_committees_auth_all" ON public.marathon_committees
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ── marathon_tasks ────────────────────────────────────────────────────────────

ALTER TABLE public.marathon_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marathon_tasks_auth_all" ON public.marathon_tasks
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ── marathon_budget_items ─────────────────────────────────────────────────────

ALTER TABLE public.marathon_budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marathon_budget_auth_all" ON public.marathon_budget_items
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ── marathon_checkpoints ──────────────────────────────────────────────────────

ALTER TABLE public.marathon_checkpoints ENABLE ROW LEVEL SECURITY;

-- Public can read checkpoints (needed for QR scanning and runner app)
CREATE POLICY "marathon_checkpoints_public_read" ON public.marathon_checkpoints
  FOR SELECT USING (true);

CREATE POLICY "marathon_checkpoints_auth_all" ON public.marathon_checkpoints
  FOR ALL TO authenticated USING (true);

-- ── marathon_checkpoint_scans ─────────────────────────────────────────────────

ALTER TABLE public.marathon_checkpoint_scans ENABLE ROW LEVEL SECURITY;

-- Anyone can insert scans (volunteer scanner app, self-scan)
CREATE POLICY "marathon_scans_public_insert" ON public.marathon_checkpoint_scans
  FOR INSERT WITH CHECK (true);

-- Public can read scans (results and tracking)
CREATE POLICY "marathon_scans_public_read" ON public.marathon_checkpoint_scans
  FOR SELECT USING (true);

CREATE POLICY "marathon_scans_auth_all" ON public.marathon_checkpoint_scans
  FOR ALL TO authenticated USING (true);

-- ── marathon_results ──────────────────────────────────────────────────────────

ALTER TABLE public.marathon_results ENABLE ROW LEVEL SECURITY;

-- Public can read results (leaderboard, certificate lookup)
CREATE POLICY "marathon_results_public_read" ON public.marathon_results
  FOR SELECT USING (true);

CREATE POLICY "marathon_results_auth_all" ON public.marathon_results
  FOR ALL TO authenticated USING (true);

-- ── marathon_incidents ────────────────────────────────────────────────────────

ALTER TABLE public.marathon_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marathon_incidents_auth_all" ON public.marathon_incidents
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ── marathon_volunteer_checkins ───────────────────────────────────────────────

ALTER TABLE public.marathon_volunteer_checkins ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (volunteer check-in kiosk)
CREATE POLICY "marathon_volunteers_public_insert" ON public.marathon_volunteer_checkins
  FOR INSERT WITH CHECK (true);

CREATE POLICY "marathon_volunteers_auth_all" ON public.marathon_volunteer_checkins
  FOR ALL TO authenticated USING (true);

-- ── marathon_race_tracks ──────────────────────────────────────────────────────

ALTER TABLE public.marathon_race_tracks ENABLE ROW LEVEL SECURITY;

-- Fully public — runners push GPS data without auth
CREATE POLICY "marathon_tracks_public_insert" ON public.marathon_race_tracks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "marathon_tracks_public_read" ON public.marathon_race_tracks
  FOR SELECT USING (true);

CREATE POLICY "marathon_tracks_public_update" ON public.marathon_race_tracks
  FOR UPDATE USING (true);

-- ── marathon_race_track_points ────────────────────────────────────────────────

ALTER TABLE public.marathon_race_track_points ENABLE ROW LEVEL SECURITY;

-- Fully public — GPS breadcrumbs appended without auth
CREATE POLICY "marathon_points_public_insert" ON public.marathon_race_track_points
  FOR INSERT WITH CHECK (true);

CREATE POLICY "marathon_points_public_read" ON public.marathon_race_track_points
  FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ADMISSION FORM BUILDER POLICIES
-- Added: 2026-04-08 — Dynamic public admission forms
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE admission_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_templates ENABLE ROW LEVEL SECURITY;

-- Templates: anyone authenticated can read (system templates are shared)
CREATE POLICY "admission_form_templates_select" ON admission_form_templates
  FOR SELECT USING (is_system = true OR auth.uid() IS NOT NULL);

-- Forms: institution-scoped CRUD via profiles.institution_id
CREATE POLICY "admission_forms_select" ON admission_forms
  FOR SELECT USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "admission_forms_insert" ON admission_forms
  FOR INSERT WITH CHECK (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "admission_forms_update" ON admission_forms
  FOR UPDATE USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "admission_forms_delete" ON admission_forms
  FOR DELETE USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Sections & Fields: cascade from form access
CREATE POLICY "admission_form_sections_all" ON admission_form_sections
  FOR ALL USING (form_id IN (SELECT id FROM admission_forms));

CREATE POLICY "admission_form_fields_all" ON admission_form_fields
  FOR ALL USING (form_id IN (SELECT id FROM admission_forms));

-- Submissions: institution-scoped read. Public inserts happen via service role.
CREATE POLICY "admission_form_submissions_select" ON admission_form_submissions
  FOR SELECT USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Events: admin read, public insert (anonymous analytics tracking)
CREATE POLICY "admission_form_events_select" ON admission_form_events
  FOR SELECT USING (form_id IN (SELECT id FROM admission_forms));

CREATE POLICY "admission_form_events_insert" ON admission_form_events
  FOR INSERT WITH CHECK (true);


-- =====================================================
-- Dashboard v2 — RLS Policies
-- Added: 2026-04-15 - Day 1 migration
-- Spec: specs/myjkkn-dashboard-v2-spec.md §6.7
-- Pattern: is_super_admin() OR is_admin() OR (user_has_permission('key') AND role_has_institution_access(institution_id))
-- =====================================================

-- rescue_broadcasts
CREATE POLICY rescue_broadcasts_select ON rescue_broadcasts FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('dashboard.broadcast.claim') AND role_has_institution_access(institution_id))
);
CREATE POLICY rescue_broadcasts_insert ON rescue_broadcasts FOR INSERT WITH CHECK (
  is_super_admin() OR user_has_permission('dashboard.broadcast.initiate')
);
CREATE POLICY rescue_broadcasts_update ON rescue_broadcasts FOR UPDATE USING (
  is_super_admin() OR user_has_permission('dashboard.broadcast.claim')
) WITH CHECK (
  is_super_admin() OR user_has_permission('dashboard.broadcast.claim')
);

-- counselor_sla_strikes (own strikes visible to self, managers see team strikes)
CREATE POLICY strikes_select ON counselor_sla_strikes FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR counselor_id = auth.uid()
  OR (user_has_permission('dashboard.leaderboard.view') AND role_has_institution_access(institution_id))
);
CREATE POLICY strikes_admin_modify ON counselor_sla_strikes FOR ALL USING (
  is_super_admin()
) WITH CHECK (
  is_super_admin()
);

-- dashboard_config (readable by all authenticated, writable by super_admin/admin)
CREATE POLICY dashboard_config_select ON dashboard_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY dashboard_config_modify ON dashboard_config FOR ALL USING (
  is_super_admin() OR is_admin()
) WITH CHECK (
  is_super_admin() OR is_admin()
);

-- END Dashboard v2 policies
-- =============================================================================
-- Updated: 2026-04-15 - Tier C staff-module RLS alignment
-- Replaces hardcoded role-name checks with the standard contract:
--   is_super_admin() OR is_admin()
--     OR (user_has_permission('module.action') AND role_has_institution_access(institution_id))
-- Pre-flight verified zero real-user impact (only at-risk users were super_admin
-- or @test.local fixtures). See migration:
--   staff_module_rls_align_to_permission_contract
-- =============================================================================

-- ---- staff -------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_select_by_institution_access" ON staff;
DROP POLICY IF EXISTS "staff_select_event_coordinator"     ON staff;
DROP POLICY IF EXISTS "staff_insert_by_access_type"        ON staff;
DROP POLICY IF EXISTS "staff_update_by_access_type"        ON staff;
DROP POLICY IF EXISTS "staff_delete_by_admin_access"       ON staff;

CREATE POLICY "staff_select_permission" ON staff FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('staff.view')
      AND role_has_module_access('staff', institution_id, institution_email))
  OR institution_email = (SELECT auth.email())  -- self-view by institution_email
);
-- INSERT keeps institution-only check: 'own_records' doesn't apply to creation
-- (the row doesn't exist yet, so there's no owner_email to compare against).
CREATE POLICY "staff_insert_permission" ON staff FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('staff.create') AND role_has_institution_access(institution_id))
);
CREATE POLICY "staff_update_permission" ON staff FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('staff.edit')
      AND role_has_module_access('staff', institution_id, institution_email))
  OR institution_email = (SELECT auth.email())  -- self-update by institution_email
);
CREATE POLICY "staff_delete_permission" ON staff FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('staff.delete')
      AND role_has_module_access('staff', institution_id, institution_email))
);

-- ---- employment_categories ---------------------------------------------------
DROP POLICY IF EXISTS "Enhanced employment categories view access"   ON employment_categories;
DROP POLICY IF EXISTS "Enhanced employment categories create access" ON employment_categories;
DROP POLICY IF EXISTS "Enhanced employment categories update access" ON employment_categories;
DROP POLICY IF EXISTS "Enhanced employment categories delete access" ON employment_categories;

CREATE POLICY "employment_categories_select" ON employment_categories FOR SELECT USING (
  auth.uid() IS NOT NULL
);
CREATE POLICY "employment_categories_insert" ON employment_categories FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('staff.categories.create')
);
CREATE POLICY "employment_categories_update" ON employment_categories FOR UPDATE USING (
  is_super_admin() OR is_admin() OR user_has_permission('staff.categories.edit')
);
CREATE POLICY "employment_categories_delete" ON employment_categories FOR DELETE USING (
  is_super_admin() OR is_admin() OR user_has_permission('staff.categories.delete')
);

-- ---- custom_roles ------------------------------------------------------------
DROP POLICY IF EXISTS "Enable admin operations for super_admin"        ON custom_roles;
DROP POLICY IF EXISTS "Allow authenticated users to read custom roles" ON custom_roles;
DROP POLICY IF EXISTS "Enable read access for authenticated users"     ON custom_roles;

CREATE POLICY "custom_roles_select" ON custom_roles FOR SELECT USING (
  auth.uid() IS NOT NULL
);
CREATE POLICY "custom_roles_insert" ON custom_roles FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('roles.create')
);
CREATE POLICY "custom_roles_update" ON custom_roles FOR UPDATE USING (
  is_super_admin() OR is_admin() OR user_has_permission('roles.edit')
);
CREATE POLICY "custom_roles_delete" ON custom_roles FOR DELETE USING (
  is_super_admin() OR is_admin() OR user_has_permission('roles.delete')
);

-- ---- staff_plans -------------------------------------------------------------
-- staff_plans_select_permission already follows the contract; only INSERT/UPDATE/
-- DELETE legacy hardcoded-role policies are dropped and replaced.
DROP POLICY IF EXISTS "Admins can manage staff_plans in their institutions" ON staff_plans;
DROP POLICY IF EXISTS "Admin users can insert staff plans"                  ON staff_plans;
DROP POLICY IF EXISTS "Faculty users can insert institution staff plans"    ON staff_plans;
DROP POLICY IF EXISTS "HOD users can insert institution staff plans"        ON staff_plans;
DROP POLICY IF EXISTS "Admin users can update staff plans"                  ON staff_plans;
DROP POLICY IF EXISTS "Faculty and HOD can update staff_plans"              ON staff_plans;
DROP POLICY IF EXISTS "Admin users can delete staff plans"                  ON staff_plans;
DROP POLICY IF EXISTS "Faculty and HOD can delete staff_plans"              ON staff_plans;

CREATE POLICY "staff_plans_insert_permission" ON staff_plans FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.staff.planning.edit') AND role_has_institution_access(institution_id))
);
CREATE POLICY "staff_plans_update_permission" ON staff_plans FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.staff.planning.edit') AND role_has_institution_access(institution_id))
);
CREATE POLICY "staff_plans_delete_permission" ON staff_plans FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.staff.planning.delete') AND role_has_institution_access(institution_id))
);

-- ---- user_roles --------------------------------------------------------------
-- Updated: 2026-04-15 - Replace hardcoded profiles.role IN ('super_admin','admin')
-- checks with the standard contract using roles.{create,edit,delete} permission keys.
-- Self-view stays open (a user can always read their own user_roles rows).
DROP POLICY IF EXISTS "Admins can insert user roles"   ON user_roles;
DROP POLICY IF EXISTS "Admins can update user roles"   ON user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles"   ON user_roles;
DROP POLICY IF EXISTS "Admins can view all user roles" ON user_roles;
DROP POLICY IF EXISTS "user_roles_select_admin"        ON user_roles;

CREATE POLICY "user_roles_select_admin" ON user_roles FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('roles.edit')
);
CREATE POLICY "user_roles_insert_permission" ON user_roles FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('roles.create')
);
CREATE POLICY "user_roles_update_permission" ON user_roles FOR UPDATE USING (
  is_super_admin() OR is_admin() OR user_has_permission('roles.edit')
);
CREATE POLICY "user_roles_delete_permission" ON user_roles FOR DELETE USING (
  is_super_admin() OR is_admin() OR user_has_permission('roles.delete')
);
-- "Users can view own roles" + user_roles_select_own pre-existing self-view policies

-- =====================================================================
-- 2026-04-15 — HR Recruitment Phase 1A: RLS Policies
-- Spec: specs/hr-recruitment-module-spec.md
-- Standard pattern: is_super_admin() OR is_admin() OR (permission + institution scope)
-- =====================================================================

-- ---- hr_recruitment_candidates ----------------------------------------
-- Standard HR recruitment viewer visibility (submitter chain + approvers + Director)

ALTER TABLE public.hr_recruitment_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_recruitment_candidates_select_permission"
  ON public.hr_recruitment_candidates FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.recruitment.view')
        AND role_has_institution_access(institution_id))
    OR submitted_by = auth.uid()
  );

CREATE POLICY "hr_recruitment_candidates_insert_permission"
  ON public.hr_recruitment_candidates FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.create')
  );

CREATE POLICY "hr_recruitment_candidates_update_permission"
  ON public.hr_recruitment_candidates FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.recruitment.edit')
        AND role_has_institution_access(institution_id))
  );

-- Narrowed 2026-08-05 (20260810170000_hr_recruitment_purge_rejected_applicant.sql):
-- deleting a candidate destroys a person's whole record, so it is super-admin only.
-- It previously also allowed is_admin() and every holder of 'hr.recruitment.delete'
-- (hr_head / ceo / coo / hr_admin), which would have let those roles bypass
-- fn_purge_rejected_recruitment_applicant and delete without the audit trail or the
-- Google Drive resume cleanup. Nothing in the app deleted candidates before that date.
CREATE POLICY "hr_recruitment_candidates_delete_permission"
  ON public.hr_recruitment_candidates FOR DELETE USING (
    (SELECT is_super_admin())
  );

-- ---- hr_recruitment_purge_log -----------------------------------------
-- PII-free tombstone of super-admin purges. Read-only to super admins; ALL writes
-- go through the SECURITY DEFINER functions, so no write policy exists by design.

ALTER TABLE public.hr_recruitment_purge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_recruitment_purge_log_select_super_admin"
  ON public.hr_recruitment_purge_log FOR SELECT USING (
    (SELECT is_super_admin())
  );

REVOKE ALL ON public.hr_recruitment_purge_log FROM anon;
GRANT SELECT ON public.hr_recruitment_purge_log TO authenticated;

-- NOTE: hr_job_applications deliberately has NO DELETE policy. Deletes happen only
-- inside fn_purge_rejected_recruitment_applicant (SECURITY DEFINER, self-authorizing
-- on is_super_admin()). Adding a delete policy here would widen the surface —
-- with none, PostgREST denies by default.

-- ---- hr_recruitment_candidate_packages --------------------------------
-- STRICTER RLS per Learning #8:
-- Only submitter of the parent candidate + their direct approver chain + Accounts + Director
-- We enforce this via permission 'hr.recruitment.packages.view'
-- which is granted ONLY to: hr_admin, accounts, super_admin.
-- The submitter can see their own candidate's packages via submitted_by join.

ALTER TABLE public.hr_recruitment_candidate_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_recruitment_packages_select_permission"
  ON public.hr_recruitment_candidate_packages FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.packages.view')
    OR proposed_by = auth.uid()
    OR approved_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.hr_recruitment_candidates c
      WHERE c.id = candidate_id
        AND c.submitted_by = auth.uid()
    )
  );

CREATE POLICY "hr_recruitment_packages_insert_permission"
  ON public.hr_recruitment_candidate_packages FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.packages.propose')
  );

CREATE POLICY "hr_recruitment_packages_update_permission"
  ON public.hr_recruitment_candidate_packages FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.packages.approve')
    OR proposed_by = auth.uid()
  );

CREATE POLICY "hr_recruitment_packages_delete_permission"
  ON public.hr_recruitment_candidate_packages FOR DELETE USING (
    is_super_admin() OR is_admin()
  );
-- are intentionally preserved so users can always read their own assignments.

-- =====================================================================
-- 2026-04-16 — HR Recruitment Phase 3: RLS Policies
-- Spec: specs/hr-recruitment-module-spec.md (Cvviz-sunset scope)
-- Standard pattern: is_super_admin() OR is_admin() OR (permission + institution scope)
-- Scorecards use STRICTER RLS (Learning #8) — only submitter + approval chain + super_admin.
-- =====================================================================

-- ---- hr_recruitment_jobs ----------------------------------------------

ALTER TABLE public.hr_recruitment_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: permission + institution scope OR the job is public (careers page visibility)
CREATE POLICY "hr_recruitment_jobs_select_permission"
  ON public.hr_recruitment_jobs FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.recruitment.jobs.view')
        AND role_has_institution_access(institution_id))
    OR (is_public = true AND status = 'open')
  );

CREATE POLICY "hr_recruitment_jobs_insert_permission"
  ON public.hr_recruitment_jobs FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.jobs.create')
  );

CREATE POLICY "hr_recruitment_jobs_update_permission"
  ON public.hr_recruitment_jobs FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.recruitment.jobs.edit')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "hr_recruitment_jobs_delete_permission"
  ON public.hr_recruitment_jobs FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.jobs.delete')
  );

-- ---- hr_recruitment_interviews ---------------------------------------
-- Panel members + scheduler + admin must be able to view interviews they
-- are on. Institution scope is inherited through the parent candidate.

ALTER TABLE public.hr_recruitment_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_recruitment_interviews_select_permission"
  ON public.hr_recruitment_interviews FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.interviews.view')
    OR auth.uid() = ANY (panel_member_ids)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.hr_recruitment_candidates c
      WHERE c.id = candidate_id
        AND (c.submitted_by = auth.uid()
             OR role_has_institution_access(c.institution_id))
    )
  );

CREATE POLICY "hr_recruitment_interviews_insert_permission"
  ON public.hr_recruitment_interviews FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.interviews.schedule')
  );

-- UPDATE covers reschedule AND cancel AND outcome_summary updates.
-- The service enforces finer-grained rules (reschedule vs. cancel) -- RLS just
-- guards the surface.
CREATE POLICY "hr_recruitment_interviews_update_permission"
  ON public.hr_recruitment_interviews FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.interviews.reschedule')
    OR user_has_permission('hr.recruitment.interviews.cancel')
    OR created_by = auth.uid()
    OR auth.uid() = ANY (panel_member_ids)
  );

-- No DELETE: interviews are cancelled (status='cancelled'), not deleted,
-- to preserve the audit trail. Super admin retains implicit DELETE.
CREATE POLICY "hr_recruitment_interviews_delete_super_admin"
  ON public.hr_recruitment_interviews FOR DELETE USING (
    is_super_admin()
  );

-- ---- hr_recruitment_scorecards (STRICTER RLS per Learning #8) ----------
-- Only the submitting interviewer, members of the candidate's approval chain,
-- and super_admin can READ scorecard content.
-- Permission 'hr.recruitment.scorecards.view' is granted ONLY to:
--   hr_admin, director, super_admin (the decision-makers).
-- Interviewers ALWAYS see their OWN scorecards (interviewer_id = auth.uid()).

ALTER TABLE public.hr_recruitment_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_recruitment_scorecards_select_stricter"
  ON public.hr_recruitment_scorecards FOR SELECT USING (
    is_super_admin()
    OR interviewer_id = auth.uid()
    OR user_has_permission('hr.recruitment.scorecards.view')
    OR EXISTS (
      SELECT 1
      FROM public.hr_recruitment_interviews i
      JOIN public.hr_recruitment_candidates c ON c.id = i.candidate_id
      WHERE i.id = interview_id
        AND (
          -- approval chain members for the parent candidate
          c.final_approver_id = auth.uid()
          OR c.submitted_by = auth.uid()
          OR c.approval_chain @> jsonb_build_array(
               jsonb_build_object('approver_user_id', auth.uid()::text)
             )
        )
    )
  );

-- INSERT: only the interviewer themselves can submit their scorecard.
-- Permission 'hr.recruitment.scorecards.submit' guards the surface;
-- an additional WITH CHECK enforces interviewer_id = auth.uid() so
-- you cannot submit on someone else's behalf.
CREATE POLICY "hr_recruitment_scorecards_insert_permission"
  ON public.hr_recruitment_scorecards FOR INSERT WITH CHECK (
    (is_super_admin() OR is_admin()
     OR user_has_permission('hr.recruitment.scorecards.submit'))
    AND interviewer_id = auth.uid()
  );

-- UPDATE: scorecards are submit-once (R4.4 principle). Only super_admin can
-- correct typos. Interviewers cannot edit after submission -- if they need to
-- change, they must request super_admin intervention.
CREATE POLICY "hr_recruitment_scorecards_update_super_admin"
  ON public.hr_recruitment_scorecards FOR UPDATE USING (
    is_super_admin()
  );

-- DELETE: super_admin only; scorecards are part of audit trail.
CREATE POLICY "hr_recruitment_scorecards_delete_super_admin"
  ON public.hr_recruitment_scorecards FOR DELETE USING (
    is_super_admin()
  );

-- END HR Recruitment Phase 3 policies


-- ============================================================================
-- Updated: 2026-04-21 — Persona Design PR-1 of 4: RLS on scope-extension tables
--
-- RLS policies for the 3 junction tables added in 01_tables.sql.
-- Standard contract: super_admin/admin manage all, users see their own grants.
-- ============================================================================

ALTER TABLE public.user_block_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_learner_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contract_access ENABLE ROW LEVEL SECURITY;

-- user_block_access
DROP POLICY IF EXISTS "user_block_access_select" ON public.user_block_access;
CREATE POLICY "user_block_access_select" ON public.user_block_access
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
  OR user_has_permission('users.block_access.view')
);

DROP POLICY IF EXISTS "user_block_access_insert" ON public.user_block_access;
CREATE POLICY "user_block_access_insert" ON public.user_block_access
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.block_access.manage')
);

DROP POLICY IF EXISTS "user_block_access_update" ON public.user_block_access;
CREATE POLICY "user_block_access_update" ON public.user_block_access
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.block_access.manage')
);

DROP POLICY IF EXISTS "user_block_access_delete" ON public.user_block_access;
CREATE POLICY "user_block_access_delete" ON public.user_block_access
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.block_access.manage')
);

-- user_learner_relationship
DROP POLICY IF EXISTS "user_learner_relationship_select" ON public.user_learner_relationship;
CREATE POLICY "user_learner_relationship_select" ON public.user_learner_relationship
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
  OR user_has_permission('users.relationship.view')
);

DROP POLICY IF EXISTS "user_learner_relationship_insert" ON public.user_learner_relationship;
CREATE POLICY "user_learner_relationship_insert" ON public.user_learner_relationship
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.relationship.manage')
);

DROP POLICY IF EXISTS "user_learner_relationship_update" ON public.user_learner_relationship;
CREATE POLICY "user_learner_relationship_update" ON public.user_learner_relationship
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.relationship.manage')
);

DROP POLICY IF EXISTS "user_learner_relationship_delete" ON public.user_learner_relationship;
CREATE POLICY "user_learner_relationship_delete" ON public.user_learner_relationship
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.relationship.manage')
);

-- user_contract_access
DROP POLICY IF EXISTS "user_contract_access_select" ON public.user_contract_access;
CREATE POLICY "user_contract_access_select" ON public.user_contract_access
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
  OR user_has_permission('users.contract_access.view')
);

DROP POLICY IF EXISTS "user_contract_access_insert" ON public.user_contract_access;
CREATE POLICY "user_contract_access_insert" ON public.user_contract_access
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.contract_access.manage')
);

DROP POLICY IF EXISTS "user_contract_access_update" ON public.user_contract_access;
CREATE POLICY "user_contract_access_update" ON public.user_contract_access
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.contract_access.manage')
);

DROP POLICY IF EXISTS "user_contract_access_delete" ON public.user_contract_access;
CREATE POLICY "user_contract_access_delete" ON public.user_contract_access
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('users.contract_access.manage')
);

-- END Persona Design PR-1 RLS policies

-- =====================================================================
-- Updated: 2026-04-21 - BUG-003146 expo_event_stalls RLS policies
-- Modern pattern: is_super_admin()/is_admin() bypass + user_has_permission
-- + role_has_institution_access (matches CLAUDE.md canonical pattern).
-- =====================================================================

ALTER TABLE expo_event_stalls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expo_event_stalls_select" ON expo_event_stalls;
CREATE POLICY "expo_event_stalls_select" ON expo_event_stalls
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_event_stalls_insert" ON expo_event_stalls;
CREATE POLICY "expo_event_stalls_insert" ON expo_event_stalls
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.create')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_event_stalls_update" ON expo_event_stalls;
CREATE POLICY "expo_event_stalls_update" ON expo_event_stalls
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.edit')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_event_stalls_delete" ON expo_event_stalls;
CREATE POLICY "expo_event_stalls_delete" ON expo_event_stalls
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.delete')
      AND role_has_institution_access(institution_id))
);

-- END BUG-003146 expo_event_stalls RLS policies

-- =====================================================================
-- Updated: 2026-04-25 - decisions-spec.md v1.0 Sprint 0
-- INTENTIONAL DEVIATION from MyJKKN standard RLS pattern.
-- Per spec §4 + Round 5 lock, director_decisions is private_to_director
-- by construction. NO is_super_admin/is_admin bypass.
-- The Director IS the super_admin (b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1)
-- so auth.uid() = director_user_id covers the only legitimate access.
-- DELETE deliberately omitted — append-only audit trail.
-- =====================================================================
DROP POLICY IF EXISTS director_decisions_select_self ON director_decisions;
CREATE POLICY director_decisions_select_self ON director_decisions
  FOR SELECT USING (auth.uid() = director_user_id);

DROP POLICY IF EXISTS director_decisions_insert_self ON director_decisions;
CREATE POLICY director_decisions_insert_self ON director_decisions
  FOR INSERT WITH CHECK (auth.uid() = director_user_id);

DROP POLICY IF EXISTS director_decisions_update_self ON director_decisions;
CREATE POLICY director_decisions_update_self ON director_decisions
  FOR UPDATE USING (auth.uid() = director_user_id)
              WITH CHECK (auth.uid() = director_user_id);

GRANT SELECT, INSERT, UPDATE ON director_decisions TO service_role;

-- ================================================================================
-- 2026-04-27 — notifications RLS lockdown (Bug B, supersedes PR #517's verbose form)
-- ================================================================================
-- Symptom: any authenticated user could SELECT * FROM notifications, exposing
-- 11,150 rows of personal data (Sunday Wraps, Friday Reflections, dashboard
-- approvals, anomaly alerts) across all categories.
--
-- Root cause: prior policy "Users with notifications.view permissions can view
-- notification" had USING (auth.uid() IS NOT NULL) — no permission check, no
-- targeting check. The "permissions" name was misleading; actual gate was
-- only "is logged in".
--
-- Fix: drop both broken policies, install per-user (via fn_notification_is_for_user
-- helper which honours BOTH legacy singular {user_id} and canonical array
-- {user_ids: []} shapes plus broadcast flag), super-admin governance view,
-- and admin-only writes.
--
-- This block is the cleaner version of PR #517's verbose 3-clause OR predicate.
-- Behaviour is identical (singular + array + broadcast all match); the helper
-- centralises the matcher logic so future shape additions touch one function
-- not every policy that reads `targeting`.
-- ================================================================================

DROP POLICY IF EXISTS "Super admins can manage all notifications" ON notifications;
DROP POLICY IF EXISTS "Users with notifications.view permissions can view notification" ON notifications;
DROP POLICY IF EXISTS notifications_select_own ON notifications;
DROP POLICY IF EXISTS notifications_select_super_admin ON notifications;
DROP POLICY IF EXISTS notifications_insert_admins ON notifications;
DROP POLICY IF EXISTS notifications_update_admins ON notifications;
DROP POLICY IF EXISTS notifications_delete_admins ON notifications;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Per-user SELECT — delegates to fn_notification_is_for_user which accepts
-- both legacy {user_id: uuid} and canonical {user_ids: [uuid]} targeting
-- shapes plus optional {broadcast: true} flag for system-wide notifications.
CREATE POLICY notifications_select_own ON notifications FOR SELECT USING (
  auth.uid() IS NOT NULL AND fn_notification_is_for_user(targeting, auth.uid())
);

-- Governance SELECT — super_admin sees everything for audit/compliance.
-- Multiple SELECT policies are OR'd together by Postgres, so super_admin
-- gets union of "their own" + "everything".
CREATE POLICY notifications_select_super_admin ON notifications FOR SELECT USING (
  is_super_admin()
);

-- Writes — super_admin + admin only. Regular users (faculty, learners,
-- staff) cannot insert/update/delete notifications via PostgREST.
CREATE POLICY notifications_insert_admins ON notifications FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin(auth.uid())
);
CREATE POLICY notifications_update_admins ON notifications FOR UPDATE USING (
  is_super_admin() OR is_admin(auth.uid())
) WITH CHECK (
  is_super_admin() OR is_admin(auth.uid())
);
CREATE POLICY notifications_delete_admins ON notifications FOR DELETE USING (
  is_super_admin() OR is_admin(auth.uid())
);

-- ================================================================================
-- IMS (Inventory Management System) RLS POLICIES
-- ================================================================================
-- Added 2026-04-28 — wires the IMS module into MyJKKN's canonical role-based
-- access. Replaces the legacy raw-role pattern
--   USING (institution_id = (SELECT profiles.institution_id ...) OR get_current_user_role() = 'super_admin')
-- with the standard pattern enforced project-wide:
--   is_super_admin() OR is_admin(auth.uid())
--   OR (user_has_permission('key') AND role_has_institution_access(institution_id))
--
-- Closes the two known security holes flagged in
--   docs/modules/ims/2026-04-27-MODULE-supabase-database-schema.md §8:
--     - ims_supply_shipments       previously USING (true)
--     - ims_supply_shipment_items  previously USING (true)
-- Both now require ims.transfers.{view,dispatch,receive} + institution access.
--
-- IMS table inventory (25 tables):
--   13 institution-scoped root tables  (institution_id column on row)
--    4 institution-scoped counter tables (atomic sequence increments)
--    4 global reference tables          (no institution_id — units, suppliers, …)
--    4 child / junction tables          (FK-scoped — RLS via parent EXISTS)
--
-- Guarded by `to_regclass('public.ims_stores')`. If IMS migrations have not
-- been applied to the target database (e.g. a fresh staging cut), this entire
-- block emits a NOTICE and exits — no error. Re-run after IMS DDL lands.
--
-- Why pg_temp helper functions: 25 tables × 4 policies = 100 near-identical
-- DDL statements. The helpers compress this to one template + per-table call,
-- which is auditable AND drops itself at session end (no permanent schema
-- pollution). Permission keys are passed as arguments so per-table policy
-- targets remain explicit and greppable.
-- ================================================================================

DO $$
BEGIN
  IF to_regclass('public.ims_stores') IS NULL THEN
    RAISE NOTICE '[ims-rls] ims_* tables not present in this database — skipping IMS RLS section. Apply IMS table migration first, then re-run 03_policies.sql.';
    RETURN;
  END IF;

  -- ── Helper #1: institution-scoped tables (13 root + 4 counters = 17) ─────────
  -- Tables with an institution_id column directly on the row. Reads gated by
  -- p_view, writes by p_write. Both also require role_has_institution_access
  -- on the row's institution_id for non-admins.
  CREATE OR REPLACE FUNCTION pg_temp.ims_apply_inst_policies(
    p_table TEXT, p_view TEXT, p_write TEXT
  ) RETURNS void AS $fn$
  BEGIN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_select', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_insert', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_update', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_delete', p_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ('
      'is_super_admin() OR is_admin(auth.uid()) '
      'OR (user_has_permission(%L) AND role_has_institution_access(institution_id)))',
      p_table || '_select', p_table, p_view);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ('
      'is_super_admin() OR is_admin(auth.uid()) '
      'OR (user_has_permission(%L) AND role_has_institution_access(institution_id)))',
      p_table || '_insert', p_table, p_write);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING ('
      'is_super_admin() OR is_admin(auth.uid()) '
      'OR (user_has_permission(%L) AND role_has_institution_access(institution_id))) '
      'WITH CHECK ('
      'is_super_admin() OR is_admin(auth.uid()) '
      'OR (user_has_permission(%L) AND role_has_institution_access(institution_id)))',
      p_table || '_update', p_table, p_write, p_write);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ('
      'is_super_admin() OR is_admin(auth.uid()) '
      'OR (user_has_permission(%L) AND role_has_institution_access(institution_id)))',
      p_table || '_delete', p_table, p_write);
  END;
  $fn$ LANGUAGE plpgsql;

  -- ── Helper #2: global reference tables (no institution_id) ───────────────────
  -- Read open to any user with ims.view; writes restricted to settings keys.
  CREATE OR REPLACE FUNCTION pg_temp.ims_apply_global_policies(
    p_table TEXT, p_write TEXT
  ) RETURNS void AS $fn$
  BEGIN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_select', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_insert', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_update', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_delete', p_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ('
      'is_super_admin() OR is_admin(auth.uid()) OR user_has_permission(%L))',
      p_table || '_select', p_table, 'ims.view');

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ('
      'is_super_admin() OR is_admin(auth.uid()) OR user_has_permission(%L))',
      p_table || '_insert', p_table, p_write);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (is_super_admin() OR is_admin(auth.uid()) OR user_has_permission(%L)) '
      'WITH CHECK (is_super_admin() OR is_admin(auth.uid()) OR user_has_permission(%L))',
      p_table || '_update', p_table, p_write, p_write);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ('
      'is_super_admin() OR is_admin(auth.uid()) OR user_has_permission(%L))',
      p_table || '_delete', p_table, p_write);
  END;
  $fn$ LANGUAGE plpgsql;

  -- ── Helper #3: child tables (FK-scoped via parent EXISTS) ────────────────────
  -- Child rows do not carry institution_id; instead, the parent does. Policy
  -- joins to parent and checks role_has_institution_access(parent.institution_id).
  -- p_fk = name of the FK column on the child pointing at the parent's id.
  CREATE OR REPLACE FUNCTION pg_temp.ims_apply_child_policies(
    p_table TEXT, p_fk TEXT, p_parent TEXT, p_view TEXT, p_write TEXT
  ) RETURNS void AS $fn$
  BEGIN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_select', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_insert', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_update', p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_delete', p_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ('
      'is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.%I p WHERE p.id = %I.%I '
      '  AND user_has_permission(%L) AND role_has_institution_access(p.institution_id)))',
      p_table || '_select', p_table, p_parent, p_table, p_fk, p_view);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ('
      'is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.%I p WHERE p.id = %I.%I '
      '  AND user_has_permission(%L) AND role_has_institution_access(p.institution_id)))',
      p_table || '_insert', p_table, p_parent, p_table, p_fk, p_write);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.%I p WHERE p.id = %I.%I '
      '  AND user_has_permission(%L) AND role_has_institution_access(p.institution_id))) '
      'WITH CHECK (is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.%I p WHERE p.id = %I.%I '
      '  AND user_has_permission(%L) AND role_has_institution_access(p.institution_id)))',
      p_table || '_update', p_table,
      p_parent, p_table, p_fk, p_write,
      p_parent, p_table, p_fk, p_write);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ('
      'is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.%I p WHERE p.id = %I.%I '
      '  AND user_has_permission(%L) AND role_has_institution_access(p.institution_id)))',
      p_table || '_delete', p_table, p_parent, p_table, p_fk, p_write);
  END;
  $fn$ LANGUAGE plpgsql;

  -- ── Apply: institution-scoped root tables (13) ───────────────────────────────
  PERFORM pg_temp.ims_apply_inst_policies('ims_stores',                  'ims.view',                'ims.settings.stores.manage');
  PERFORM pg_temp.ims_apply_inst_policies('ims_items',                   'ims.inventory.view',      'ims.inventory.edit');
  PERFORM pg_temp.ims_apply_inst_policies('ims_stock_summary',           'ims.stock.view',          'ims.stock.adjust');
  PERFORM pg_temp.ims_apply_inst_policies('ims_stock_batches',           'ims.stock.view',          'ims.stock.adjust');
  PERFORM pg_temp.ims_apply_inst_policies('ims_stock_issues',            'ims.stock.view',          'ims.stock.adjust');
  PERFORM pg_temp.ims_apply_inst_policies('ims_department_consumption',  'ims.stock.view',          'ims.stock.adjust');
  PERFORM pg_temp.ims_apply_inst_policies('ims_goods_received_notes',    'ims.stock.grn.view',      'ims.stock.grn.create');
  PERFORM pg_temp.ims_apply_inst_policies('ims_indent_requests',         'ims.indents.view',        'ims.indents.edit');
  -- ims_supply_shipments: handled in dedicated DO block below (no institution_id column;
  -- scope is via source_store.institution_id and destination_institution_id).
  -- Helper would crash on missing column. See "ims_supply_shipments hand-written" block.
  PERFORM pg_temp.ims_apply_inst_policies('ims_sales',                   'ims.sales.view',          'ims.sales.create');
  PERFORM pg_temp.ims_apply_inst_policies('ims_shifts',                  'ims.sales.view',          'ims.sales.create');
  PERFORM pg_temp.ims_apply_inst_policies('ims_upi_qr_payments',         'ims.sales.view',          'ims.sales.create');
  -- Financial transactions: read-only at user level. Writes happen via DB
  -- triggers as side-effects of sales/grn posting. Gate the write path behind
  -- a synthetic key no role grants — only super_admin / is_admin can mutate.
  --
  -- DESIGN NOTE (rls-reviewer BUG #10, 2026-05-02): 'ims.financial.write_admin_only'
  -- is intentionally NOT in lib/constants/permissions.ts and intentionally
  -- not grantable to any role. The only legitimate write paths are:
  --   1) SECURITY DEFINER trigger/RPC functions (which run as table owner
  --      and bypass RLS by design), and
  --   2) service_role connections (also bypass RLS).
  -- A normal user cannot mutate this table — by design. Do NOT add this key
  -- to PERMISSION_CATEGORIES; that would defeat the safety net.
  PERFORM pg_temp.ims_apply_inst_policies('ims_financial_transactions',  'ims.financial.view',      'ims.financial.write_admin_only');

  -- ── Apply: institution-scoped counter tables (4) ─────────────────────────────
  -- Counters carry store_id only (no institution_id column). Live policies scope
  -- via EXISTS-join through ims_stores. Helper ims_apply_inst_policies would
  -- reference a non-existent column and crash, so these are handled in a
  -- hand-written DO block below ("counter tables hand-written").

  -- ── Apply: global reference tables (2) ───────────────────────────────────────
  -- Truly global tables with NO scoping column: ims_units only.
  -- (ims_unit_conversions, ims_item_categories, ims_suppliers are scoped — see
  -- their hand-written blocks below.)
  PERFORM pg_temp.ims_apply_global_policies('ims_units',             'ims.settings.units.manage');

  -- ── ims_unit_conversions: child of ims_items (scoped via item.institution_id) ─
  -- Live DB scopes via EXISTS-join on ims_items. Setup script previously declared
  -- it as a global table — re-applying would loosen scope. Use child helper.
  PERFORM pg_temp.ims_apply_child_policies(
    'ims_unit_conversions',  'item_id',
    'ims_items',             'ims.view',  'ims.settings.units.manage');

  -- ── ims_suppliers: institution-scoped (has institution_id column) ─────────────
  -- Setup script previously declared it as global — re-applying would loosen scope.
  PERFORM pg_temp.ims_apply_inst_policies('ims_suppliers', 'ims.view', 'ims.settings.suppliers.manage');

  -- ims_item_categories: handled in dedicated DO block below
  -- (has store_id but NO institution_id; scope must be via ims_stores EXISTS-join).

  -- ── Apply: child / junction tables (4) — RLS via parent EXISTS ───────────────
  -- FK column names follow the convention <parent_singular>_id. If a child
  -- table uses a different FK name, update the second arg here AND verify
  -- against information_schema.columns before applying in production.
  PERFORM pg_temp.ims_apply_child_policies(
    'ims_grn_items',             'grn_id',
    'ims_goods_received_notes',  'ims.stock.grn.view',  'ims.stock.grn.create');
  PERFORM pg_temp.ims_apply_child_policies(
    'ims_indent_request_items',  'indent_id',
    'ims_indent_requests',       'ims.indents.view',    'ims.indents.edit');
  -- ims_supply_shipment_items: parent (ims_supply_shipments) has NO institution_id.
  -- Generic child helper joins parent.institution_id and would crash. Hand-written
  -- block below ("ims_supply_shipment_items hand-written") joins parent then
  -- nests an EXISTS on ims_stores for source-side institution access.
  PERFORM pg_temp.ims_apply_child_policies(
    'ims_sale_items',            'sale_id',
    'ims_sales',                 'ims.sales.view',      'ims.sales.create');

  RAISE NOTICE '[ims-rls] Applied canonical role-based RLS to 25 ims_* tables.';
END $$;

-- =====================================================================
-- IMS Hand-Written RLS — tables that don't fit the helper template
-- (added 2026-05-02 by rls-fixer; resolves scope-reviewer BUGs #2, #3, #6)
-- =====================================================================
-- Some IMS tables do NOT carry an institution_id column directly. Routing
-- them through the generic `ims_apply_inst_policies` helper would either
-- crash (column missing) or, worse, generate policies with no institution
-- scope (helper #2). These hand-written blocks match the live DB shape:
--
--   ims_item_categories        — store_id only, scope via ims_stores join
--   ims_supply_shipments       — source_store_id + destination_institution_id
--   ims_supply_shipment_items  — child of ims_supply_shipments
--   ims_*_number_counters (4)  — store_id only, scope via ims_stores join
--
-- These run AFTER the helper-driven block, so DROP POLICY IF EXISTS clears
-- any helper-generated artifacts before re-creating with the correct shape.
-- =====================================================================

-- ── ims_item_categories: store-scoped (no institution_id) ───────────────────
-- BUG #2 FIX (HIGH): live policies were globally readable/writable across
-- stores. Now reads any user with ims.view scoped to their store's institution;
-- writes any user with ims.inventory.categories.manage on the row's store.
DO $$
BEGIN
  IF to_regclass('public.ims_item_categories') IS NULL THEN
    RAISE NOTICE '[ims-rls/item-categories] Skipped: table not present.';
    RETURN;
  END IF;

  ALTER TABLE public.ims_item_categories ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS ims_item_categories_select ON public.ims_item_categories;
  CREATE POLICY ims_item_categories_select ON public.ims_item_categories
    FOR SELECT TO authenticated USING (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_stores s
        WHERE s.id = ims_item_categories.store_id
          AND user_has_permission('ims.view')
          AND role_has_institution_access(s.institution_id))
    );

  DROP POLICY IF EXISTS ims_item_categories_insert ON public.ims_item_categories;
  CREATE POLICY ims_item_categories_insert ON public.ims_item_categories
    FOR INSERT TO authenticated WITH CHECK (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_stores s
        WHERE s.id = ims_item_categories.store_id
          AND user_has_permission('ims.inventory.categories.manage')
          AND role_has_institution_access(s.institution_id))
    );

  DROP POLICY IF EXISTS ims_item_categories_update ON public.ims_item_categories;
  CREATE POLICY ims_item_categories_update ON public.ims_item_categories
    FOR UPDATE TO authenticated
    USING (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_stores s
        WHERE s.id = ims_item_categories.store_id
          AND user_has_permission('ims.inventory.categories.manage')
          AND role_has_institution_access(s.institution_id))
    )
    WITH CHECK (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_stores s
        WHERE s.id = ims_item_categories.store_id
          AND user_has_permission('ims.inventory.categories.manage')
          AND role_has_institution_access(s.institution_id))
    );

  DROP POLICY IF EXISTS ims_item_categories_delete ON public.ims_item_categories;
  CREATE POLICY ims_item_categories_delete ON public.ims_item_categories
    FOR DELETE TO authenticated USING (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_stores s
        WHERE s.id = ims_item_categories.store_id
          AND user_has_permission('ims.inventory.categories.manage')
          AND role_has_institution_access(s.institution_id))
    );

  RAISE NOTICE '[ims-rls/item-categories] Store-scoped policies applied (BUG #2 fix).';
END $$;

-- ── ims_supply_shipments: dual-side scoping (no institution_id) ──────────────
-- BUG #3 FIX (HIGH): table has source_store_id + destination_institution_id.
-- BUG #1 FIX (HIGH): UPDATE/DELETE narrowed to source-side only via
-- ims.transfers.dispatch. Receive-side updates are handled by the additive
-- ims_supply_shipments_update_receive policy (in granular overrides block).
-- INSERT only by source store's institution; SELECT visible to either side.
DO $$
BEGIN
  IF to_regclass('public.ims_supply_shipments') IS NULL THEN
    RAISE NOTICE '[ims-rls/supply-shipments] Skipped: table not present.';
    RETURN;
  END IF;

  ALTER TABLE public.ims_supply_shipments ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS ims_supply_shipments_select ON public.ims_supply_shipments;
  CREATE POLICY ims_supply_shipments_select ON public.ims_supply_shipments
    FOR SELECT TO authenticated USING (
      is_super_admin() OR is_admin(auth.uid())
      OR (user_has_permission('ims.transfers.view')
          AND (
            role_has_institution_access(destination_institution_id)
            OR EXISTS (
              SELECT 1 FROM public.ims_stores s
              WHERE s.id = ims_supply_shipments.source_store_id
                AND role_has_institution_access(s.institution_id))
          ))
    );

  DROP POLICY IF EXISTS ims_supply_shipments_insert ON public.ims_supply_shipments;
  CREATE POLICY ims_supply_shipments_insert ON public.ims_supply_shipments
    FOR INSERT TO authenticated WITH CHECK (
      is_super_admin() OR is_admin(auth.uid())
      OR (user_has_permission('ims.transfers.dispatch')
          AND EXISTS (
            SELECT 1 FROM public.ims_stores s
            WHERE s.id = ims_supply_shipments.source_store_id
              AND role_has_institution_access(s.institution_id)))
    );

  -- BUG #1 cross-tenant fix: UPDATE narrowed to source-side. Destination side
  -- updates flow through ims_supply_shipments_update_receive (additive policy
  -- gated on ims.transfers.receive in the granular-overrides block below).
  DROP POLICY IF EXISTS ims_supply_shipments_update ON public.ims_supply_shipments;
  CREATE POLICY ims_supply_shipments_update ON public.ims_supply_shipments
    FOR UPDATE TO authenticated
    USING (
      is_super_admin() OR is_admin(auth.uid())
      OR (user_has_permission('ims.transfers.dispatch')
          AND EXISTS (
            SELECT 1 FROM public.ims_stores s
            WHERE s.id = ims_supply_shipments.source_store_id
              AND role_has_institution_access(s.institution_id)))
    )
    WITH CHECK (
      is_super_admin() OR is_admin(auth.uid())
      OR (user_has_permission('ims.transfers.dispatch')
          AND EXISTS (
            SELECT 1 FROM public.ims_stores s
            WHERE s.id = ims_supply_shipments.source_store_id
              AND role_has_institution_access(s.institution_id)))
    );

  -- DELETE: source-side only (matches narrowed UPDATE).
  DROP POLICY IF EXISTS ims_supply_shipments_delete ON public.ims_supply_shipments;
  CREATE POLICY ims_supply_shipments_delete ON public.ims_supply_shipments
    FOR DELETE TO authenticated USING (
      is_super_admin() OR is_admin(auth.uid())
      OR (user_has_permission('ims.transfers.dispatch')
          AND EXISTS (
            SELECT 1 FROM public.ims_stores s
            WHERE s.id = ims_supply_shipments.source_store_id
              AND role_has_institution_access(s.institution_id)))
    );

  RAISE NOTICE '[ims-rls/supply-shipments] Source/destination-scoped policies applied (BUG #1 + #3 fix).';
END $$;

-- ── ims_supply_shipment_items: child of ims_supply_shipments ─────────────────
-- BUG #3 FIX (HIGH): generic child helper would join parent.institution_id
-- (does not exist on parent). Hand-written: SELECT visible to either side;
-- INSERT only by source-side (dispatch); UPDATE/DELETE narrowed to source-side
-- (BUG #1 alignment — receive-side covered by additive _update_receive policy).
DO $$
BEGIN
  IF to_regclass('public.ims_supply_shipment_items') IS NULL THEN
    RAISE NOTICE '[ims-rls/supply-shipment-items] Skipped: table not present.';
    RETURN;
  END IF;

  ALTER TABLE public.ims_supply_shipment_items ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS ims_supply_shipment_items_select ON public.ims_supply_shipment_items;
  CREATE POLICY ims_supply_shipment_items_select ON public.ims_supply_shipment_items
    FOR SELECT TO authenticated USING (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_supply_shipments ss
        WHERE ss.id = ims_supply_shipment_items.shipment_id
          AND user_has_permission('ims.transfers.view')
          AND (
            role_has_institution_access(ss.destination_institution_id)
            OR EXISTS (
              SELECT 1 FROM public.ims_stores s
              WHERE s.id = ss.source_store_id
                AND role_has_institution_access(s.institution_id))
          ))
    );

  DROP POLICY IF EXISTS ims_supply_shipment_items_insert ON public.ims_supply_shipment_items;
  CREATE POLICY ims_supply_shipment_items_insert ON public.ims_supply_shipment_items
    FOR INSERT TO authenticated WITH CHECK (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_supply_shipments ss
        WHERE ss.id = ims_supply_shipment_items.shipment_id
          AND user_has_permission('ims.transfers.dispatch')
          AND EXISTS (
            SELECT 1 FROM public.ims_stores s
            WHERE s.id = ss.source_store_id
              AND role_has_institution_access(s.institution_id)))
    );

  -- BUG #1 cross-tenant alignment: UPDATE narrowed to source-side.
  -- Destination-side handled by ims_supply_shipment_items_update_receive (additive).
  DROP POLICY IF EXISTS ims_supply_shipment_items_update ON public.ims_supply_shipment_items;
  CREATE POLICY ims_supply_shipment_items_update ON public.ims_supply_shipment_items
    FOR UPDATE TO authenticated
    USING (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_supply_shipments ss
        WHERE ss.id = ims_supply_shipment_items.shipment_id
          AND user_has_permission('ims.transfers.dispatch')
          AND EXISTS (
            SELECT 1 FROM public.ims_stores s
            WHERE s.id = ss.source_store_id
              AND role_has_institution_access(s.institution_id)))
    )
    WITH CHECK (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_supply_shipments ss
        WHERE ss.id = ims_supply_shipment_items.shipment_id
          AND user_has_permission('ims.transfers.dispatch')
          AND EXISTS (
            SELECT 1 FROM public.ims_stores s
            WHERE s.id = ss.source_store_id
              AND role_has_institution_access(s.institution_id)))
    );

  DROP POLICY IF EXISTS ims_supply_shipment_items_delete ON public.ims_supply_shipment_items;
  CREATE POLICY ims_supply_shipment_items_delete ON public.ims_supply_shipment_items
    FOR DELETE TO authenticated USING (
      is_super_admin() OR is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ims_supply_shipments ss
        WHERE ss.id = ims_supply_shipment_items.shipment_id
          AND user_has_permission('ims.transfers.dispatch')
          AND EXISTS (
            SELECT 1 FROM public.ims_stores s
            WHERE s.id = ss.source_store_id
              AND role_has_institution_access(s.institution_id)))
    );

  RAISE NOTICE '[ims-rls/supply-shipment-items] Parent-joined source/destination policies applied (BUG #1 + #3 fix).';
END $$;

-- ── ims_*_number_counters: store-scoped via ims_stores join ─────────────────
-- BUG #6 FIX (MED): counter tables carry only store_id (no institution_id).
-- Helper would crash. Hand-written block creates 4 policies × 4 tables.
DO $$
DECLARE
  v_counter RECORD;
BEGIN
  FOR v_counter IN
    SELECT t.table_name, t.view_perm, t.write_perm
    FROM (VALUES
      ('ims_grn_number_counters',    'ims.stock.grn.view', 'ims.stock.grn.create'),
      ('ims_indent_number_counters', 'ims.indents.view',   'ims.indents.create'),
      ('ims_sale_number_counters',   'ims.sales.view',     'ims.sales.create'),
      ('ims_batch_number_counters',  'ims.stock.view',     'ims.stock.adjust')
    ) AS t(table_name, view_perm, write_perm)
  LOOP
    IF to_regclass('public.' || v_counter.table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_counter.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_counter.table_name || '_select', v_counter.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_counter.table_name || '_insert', v_counter.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_counter.table_name || '_update', v_counter.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_counter.table_name || '_delete', v_counter.table_name);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ('
      'is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.ims_stores s '
      '  WHERE s.id = %I.store_id '
      '  AND user_has_permission(%L) '
      '  AND role_has_institution_access(s.institution_id)))',
      v_counter.table_name || '_select', v_counter.table_name, v_counter.table_name, v_counter.view_perm);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ('
      'is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.ims_stores s '
      '  WHERE s.id = %I.store_id '
      '  AND user_has_permission(%L) '
      '  AND role_has_institution_access(s.institution_id)))',
      v_counter.table_name || '_insert', v_counter.table_name, v_counter.table_name, v_counter.write_perm);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.ims_stores s '
      '  WHERE s.id = %I.store_id '
      '  AND user_has_permission(%L) '
      '  AND role_has_institution_access(s.institution_id))) '
      'WITH CHECK (is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.ims_stores s '
      '  WHERE s.id = %I.store_id '
      '  AND user_has_permission(%L) '
      '  AND role_has_institution_access(s.institution_id)))',
      v_counter.table_name || '_update', v_counter.table_name,
      v_counter.table_name, v_counter.write_perm,
      v_counter.table_name, v_counter.write_perm);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ('
      'is_super_admin() OR is_admin(auth.uid()) OR EXISTS ('
      '  SELECT 1 FROM public.ims_stores s '
      '  WHERE s.id = %I.store_id '
      '  AND user_has_permission(%L) '
      '  AND role_has_institution_access(s.institution_id)))',
      v_counter.table_name || '_delete', v_counter.table_name, v_counter.table_name, v_counter.write_perm);
  END LOOP;

  RAISE NOTICE '[ims-rls/counters] Store-scoped policies applied to 4 counter tables (BUG #6 fix).';
END $$;

-- =====================================================================
-- IMS Granular Permission Overrides — wires previously-dead keys
-- (added 2026-05-02 by ims-permission-audit team review;
--  extended 2026-05-02 by rls-fixer for BUGs #7/#8)
-- =====================================================================
-- Seven permission keys declared in lib/constants/permissions.ts had NO DB
-- enforcement: the canonical helper above maps a single write key to
-- INSERT/UPDATE/DELETE per table, so granular keys never gated the verbs
-- they advertised. This block adds *additive* permissive policies so each
-- key starts working without narrowing existing role authority:
--
--   ims.indents.create        → INSERT on ims_indent_requests
--   ims.indents.delete        → DELETE on ims_indent_requests
--   ims.indents.approve       → UPDATE on ims_indent_requests when status
--                               transitions to 'approved'/'rejected'
--   ims.sales.refund          → UPDATE on ims_sales when status='cancelled'
--   ims.transfers.receive     → UPDATE on ims_supply_shipments &
--                               ims_supply_shipment_items when status
--                               transitions to 'received' or
--                               'received_with_variance'
--   ims.inventory.create      → INSERT on ims_items
--   ims.inventory.delete      → DELETE on ims_items
--   ims.stock.grn.receive     → UPDATE on ims_goods_received_notes when
--                               status transitions to 'received'/'verified'
--
-- NOT wired here (intentional):
--   ims.inventory.bulk_import → no per-row RLS signal; service-layer concern
--   ims.audit.write           → deferred (requires new permission key in
--                               lib/constants/permissions.ts; UI-layer task)
--
-- Postgres ORs multiple permissive policies for the same verb. Existing
-- roles relying on ims.indents.edit / ims.sales.create / ims.inventory.edit
-- keep their access. A follow-up hardening pass (audit who actually has
-- *.edit-only and migrate them to granular grants) is recommended once
-- role configs are reviewed via the Permissions Audit dashboard.
--
-- Note: ims_supply_shipments has NO institution_id column — scope is via
-- destination_institution_id (receive side) and source_store.institution_id
-- (dispatch side, EXISTS-join through ims_stores). The base UPDATE/DELETE
-- policies on this table were narrowed to source-side-only in the preceding
-- hand-written block (BUG #1 cross-tenant fix).
-- =====================================================================

DO $$
BEGIN
  IF to_regclass('public.ims_indent_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS ims_indent_requests_insert_create ON public.ims_indent_requests;
    CREATE POLICY ims_indent_requests_insert_create ON public.ims_indent_requests
      FOR INSERT TO authenticated WITH CHECK (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.indents.create')
            AND role_has_institution_access(institution_id))
      );

    DROP POLICY IF EXISTS ims_indent_requests_delete_specific ON public.ims_indent_requests;
    CREATE POLICY ims_indent_requests_delete_specific ON public.ims_indent_requests
      FOR DELETE TO authenticated USING (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.indents.delete')
            AND role_has_institution_access(institution_id))
      );

    DROP POLICY IF EXISTS ims_indent_requests_update_approve ON public.ims_indent_requests;
    CREATE POLICY ims_indent_requests_update_approve ON public.ims_indent_requests
      FOR UPDATE TO authenticated
      USING (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.indents.approve')
            AND role_has_institution_access(institution_id))
      )
      WITH CHECK (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.indents.approve')
            AND role_has_institution_access(institution_id)
            AND status IN ('approved', 'rejected'))
      );
  END IF;

  IF to_regclass('public.ims_sales') IS NOT NULL THEN
    DROP POLICY IF EXISTS ims_sales_update_refund ON public.ims_sales;
    CREATE POLICY ims_sales_update_refund ON public.ims_sales
      FOR UPDATE TO authenticated
      USING (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.sales.refund')
            AND role_has_institution_access(institution_id))
      )
      WITH CHECK (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.sales.refund')
            AND role_has_institution_access(institution_id)
            AND status = 'cancelled')
      );
  END IF;

  IF to_regclass('public.ims_supply_shipments') IS NOT NULL THEN
    DROP POLICY IF EXISTS ims_supply_shipments_update_receive ON public.ims_supply_shipments;
    CREATE POLICY ims_supply_shipments_update_receive ON public.ims_supply_shipments
      FOR UPDATE TO authenticated
      USING (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.transfers.receive')
            AND role_has_institution_access(destination_institution_id))
      )
      WITH CHECK (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.transfers.receive')
            AND role_has_institution_access(destination_institution_id)
            AND status IN ('received', 'received_with_variance'))
      );
  END IF;

  IF to_regclass('public.ims_supply_shipment_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS ims_supply_shipment_items_update_receive ON public.ims_supply_shipment_items;
    CREATE POLICY ims_supply_shipment_items_update_receive ON public.ims_supply_shipment_items
      FOR UPDATE TO authenticated
      USING (
        is_super_admin() OR is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.ims_supply_shipments p
          WHERE p.id = ims_supply_shipment_items.shipment_id
            AND user_has_permission('ims.transfers.receive')
            AND role_has_institution_access(p.destination_institution_id))
      )
      WITH CHECK (
        is_super_admin() OR is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.ims_supply_shipments p
          WHERE p.id = ims_supply_shipment_items.shipment_id
            AND user_has_permission('ims.transfers.receive')
            AND role_has_institution_access(p.destination_institution_id))
      );
  END IF;

  -- ── BUG #7 (rls-reviewer, MED): ims.inventory.create / .delete dead keys ──
  -- Helper-generated ims_items_* policies use ims.inventory.edit for all writes,
  -- so granular .create / .delete keys never gated anything. Add additive
  -- permissive policies. Note: ims.inventory.bulk_import has NO per-row signal
  -- expressible at the RLS layer (the row inserted by a bulk import is
  -- indistinguishable from a single-row insert) — bulk_import gating must be
  -- enforced at the service layer (see lib/services/ims/items-service.ts and
  -- the bulk-import API route). This policy block intentionally does NOT
  -- include a bulk_import policy; document upstream if anything tries to
  -- enforce that key here.
  IF to_regclass('public.ims_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS ims_items_insert_create ON public.ims_items;
    CREATE POLICY ims_items_insert_create ON public.ims_items
      FOR INSERT TO authenticated WITH CHECK (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.inventory.create')
            AND role_has_institution_access(institution_id))
      );

    DROP POLICY IF EXISTS ims_items_delete_specific ON public.ims_items;
    CREATE POLICY ims_items_delete_specific ON public.ims_items
      FOR DELETE TO authenticated USING (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.inventory.delete')
            AND role_has_institution_access(institution_id))
      );
  END IF;

  -- ── BUG #8 (rls-reviewer, MED): ims.stock.grn.receive dead key ──────────
  -- Helper uses ims.stock.grn.create for INSERT/UPDATE/DELETE. .edit is the
  -- general write key (already covered by .create-gated policy; no new policy
  -- needed — the key is documented as a synonym at the constants layer).
  -- .receive gates UPDATE when status transitions to 'received'/'verified'.
  -- Verified live: status column is text; service code transitions it through
  -- 'received' → 'verified' → 'approved' (see reports-service.ts, grn-service.ts).
  IF to_regclass('public.ims_goods_received_notes') IS NOT NULL THEN
    DROP POLICY IF EXISTS ims_goods_received_notes_update_receive ON public.ims_goods_received_notes;
    CREATE POLICY ims_goods_received_notes_update_receive ON public.ims_goods_received_notes
      FOR UPDATE TO authenticated
      USING (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.stock.grn.receive')
            AND role_has_institution_access(institution_id))
      )
      WITH CHECK (
        is_super_admin() OR is_admin(auth.uid())
        OR (user_has_permission('ims.stock.grn.receive')
            AND role_has_institution_access(institution_id)
            AND status IN ('received', 'verified'))
      );
  END IF;

  -- ── BUG #7 (scope-reviewer, LOW, DEFERRED): ims_activity_log INSERT key ──
  -- TODO(2026-05-02): The append-only INSERT policy at the bottom of this file
  -- gates on 'ims.view' (any IMS user can write audit rows). Reviewer recommends
  -- a dedicated 'ims.audit.write' permission. Deferred because adding that key
  -- requires updating lib/constants/permissions.ts (UI-layer concern owned by
  -- a different agent in this team). When that key lands, change the
  -- ims_activity_log_insert policy below to gate on 'ims.audit.write'.

  RAISE NOTICE '[ims-rls] Granular permission overrides applied: 7 keys wired (indents.create/delete/approve, sales.refund, transfers.receive, inventory.create/delete, stock.grn.receive)';
END $$;

-- =====================================================================
-- IMS Activity Log RLS — Phase F (2026-04-28)
-- Append-only audit trail for IMS workflow transitions.
-- SELECT + INSERT only; intentionally NO UPDATE / DELETE policies so rows
-- are tamper-resistant via RLS-respecting clients (compliance property).
-- Service-role connections (used by SECURITY DEFINER functions) still
-- bypass RLS — those don't run from the browser.
-- =====================================================================

DO $$
BEGIN
  IF to_regclass('public.ims_activity_log') IS NULL THEN
    RAISE NOTICE '[ims-activity-log-rls] Skipped: ims_activity_log table not present.';
    RETURN;
  END IF;

  ALTER TABLE public.ims_activity_log ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS ims_activity_log_select ON public.ims_activity_log;
  CREATE POLICY ims_activity_log_select ON public.ims_activity_log
    FOR SELECT TO authenticated USING (
      is_super_admin() OR is_admin(auth.uid())
      OR (user_has_permission('ims.view') AND role_has_institution_access(institution_id))
    );

  DROP POLICY IF EXISTS ims_activity_log_insert ON public.ims_activity_log;
  CREATE POLICY ims_activity_log_insert ON public.ims_activity_log
    FOR INSERT TO authenticated WITH CHECK (
      is_super_admin() OR is_admin(auth.uid())
      OR (user_has_permission('ims.view') AND role_has_institution_access(institution_id))
    );

  RAISE NOTICE '[ims-activity-log-rls] Applied SELECT + INSERT policies (append-only).';
END $$;

DROP POLICY IF EXISTS fee_structures_write ON public.admission_fee_structures;
CREATE POLICY fee_structures_write
    ON public.admission_fee_structures FOR ALL
    USING (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    )
    WITH CHECK (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    );

-- Items inherit via the parent's institution_id
DROP POLICY IF EXISTS fee_structure_items_read ON public.admission_fee_structure_items;
CREATE POLICY fee_structure_items_read
    ON public.admission_fee_structure_items FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(fs.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_structure_items_write ON public.admission_fee_structure_items;
CREATE POLICY fee_structure_items_write
    ON public.admission_fee_structure_items FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.manage')
           AND public.role_has_institution_access(fs.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.manage')
           AND public.role_has_institution_access(fs.institution_id)
      )
    );

-- ============================================================================
-- admission_fee_adjustments RLS (Plan 3 Task 2)
-- ============================================================================
-- Read: admission_fees.read + access to the parent learner's institution
-- Write: admission_fees.manage_adjustments + same institution access
-- Spec: §10.2
-- ============================================================================

ALTER TABLE public.admission_fee_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_adjustments_read ON public.admission_fee_adjustments;
CREATE POLICY fee_adjustments_read
    ON public.admission_fee_adjustments FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_adjustments_write ON public.admission_fee_adjustments;
CREATE POLICY fee_adjustments_write
    ON public.admission_fee_adjustments FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.manage_adjustments')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.manage_adjustments')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

-- ============================================================================
-- learner_admission_documents RLS (Plan 4 Task 2)
-- ============================================================================
-- Spec §10.2. Read: admission_fees.read OR admission_documents.manage with
-- institution access to parent learner. Write: admission_documents.manage only.
-- ============================================================================

ALTER TABLE public.learner_admission_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learner_admission_documents_read
    ON public.learner_admission_documents;
CREATE POLICY learner_admission_documents_read
    ON public.learner_admission_documents FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND (
             public.user_has_permission('admission_fees.read')
             OR public.user_has_permission('admission_documents.manage')
           )
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS learner_admission_documents_write
    ON public.learner_admission_documents;
CREATE POLICY learner_admission_documents_write
    ON public.learner_admission_documents FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND public.user_has_permission('admission_documents.manage')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND public.user_has_permission('admission_documents.manage')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

-- ============================================================================
-- Plan 5 — RLS for fee_change_events, event_lines, student_credit_balances
-- Spec §10.2
-- ============================================================================

ALTER TABLE public.admission_fee_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_fee_change_event_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_credit_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_change_events_read ON public.admission_fee_change_events;
CREATE POLICY fee_change_events_read
    ON public.admission_fee_change_events FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_change_events.learner_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_change_events_write ON public.admission_fee_change_events;
CREATE POLICY fee_change_events_write
    ON public.admission_fee_change_events FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_change_events.learner_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_change_events.learner_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_change_event_lines_read ON public.admission_fee_change_event_lines;
CREATE POLICY fee_change_event_lines_read
    ON public.admission_fee_change_event_lines FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_change_events e
         JOIN public.learners_profiles lp ON lp.id = e.learner_id
         WHERE e.id = admission_fee_change_event_lines.event_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_change_event_lines_write ON public.admission_fee_change_event_lines;
CREATE POLICY fee_change_event_lines_write
    ON public.admission_fee_change_event_lines FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_change_events e
         JOIN public.learners_profiles lp ON lp.id = e.learner_id
         WHERE e.id = admission_fee_change_event_lines.event_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.admission_fee_change_events e
         JOIN public.learners_profiles lp ON lp.id = e.learner_id
         WHERE e.id = admission_fee_change_event_lines.event_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS student_credit_balances_read ON public.student_credit_balances;
CREATE POLICY student_credit_balances_read
    ON public.student_credit_balances FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = student_credit_balances.student_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS student_credit_balances_write ON public.student_credit_balances;
CREATE POLICY student_credit_balances_write
    ON public.student_credit_balances FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = student_credit_balances.student_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = student_credit_balances.student_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

-- ============================================================================
-- Campus Living — Resident own-row RLS (My Hostel feature)
-- Added: 2026-05-31 (migration: 20260531090100_my_hostel_resident_rls)
-- ============================================================================

-- ── hostel_leave_requests: residents READ own ────────────────────────
DROP POLICY IF EXISTS hostel_leave_requests_select_permission ON public.hostel_leave_requests;
CREATE POLICY hostel_leave_requests_select_permission ON public.hostel_leave_requests
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.leave.view') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.leave.view_own') AND learner_id = auth.uid())
);

-- ── hostel_gate_passes: residents READ own ───────────────────────────
DROP POLICY IF EXISTS hostel_gate_passes_select_permission ON public.hostel_gate_passes;
CREATE POLICY hostel_gate_passes_select_permission ON public.hostel_gate_passes
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.gate_passes.view') AND role_has_institution_access(institution_id))
  OR (user_has_permission('campus_living.gate_passes.view_own') AND learner_id = auth.uid())
);

-- ── hostel_leave_requests: INSERT (staff + resident self) ────────────
-- Added: 2026-05-31 (migration: 20260531093000_resident_request_insert_rls)
DROP POLICY IF EXISTS hostel_leave_requests_insert_permission ON public.hostel_leave_requests;
CREATE POLICY hostel_leave_requests_insert_permission ON public.hostel_leave_requests
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.leave.create') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.leave.request') AND learner_id = auth.uid())
);

-- ── hostel_gate_passes: INSERT (staff + resident self) ───────────────
-- Added: 2026-05-31 (migration: 20260531093000_resident_request_insert_rls)
DROP POLICY IF EXISTS hostel_gate_passes_insert_permission ON public.hostel_gate_passes;
CREATE POLICY hostel_gate_passes_insert_permission ON public.hostel_gate_passes
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.gate_passes.approve') AND role_has_institution_access(institution_id))
  OR (user_has_permission('campus_living.gate_passes.create') AND learner_id = auth.uid())
);

-- ── learner_hostel_profiles: residents read + upsert OWN ──────────────
DROP POLICY IF EXISTS lhp_select_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_select_permission ON public.learner_hostel_profiles
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.view')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.view_own') AND learner_id = public.get_my_learner_id())
);

DROP POLICY IF EXISTS lhp_update_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_update_permission ON public.learner_hostel_profiles
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
);

DROP POLICY IF EXISTS lhp_insert_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_insert_permission ON public.learner_hostel_profiles
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
);

-- lhp_delete_permission predates this change; included here so the setup mirror
-- shows the table's complete RLS state (admin-only delete).
DROP POLICY IF EXISTS lhp_delete_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_delete_permission ON public.learner_hostel_profiles
FOR DELETE USING (is_super_admin() OR is_admin());

-- ── hostel_allocations: residents READ own (table empty today) ────────
DROP POLICY IF EXISTS hostel_allocations_select_permission ON public.hostel_allocations;
CREATE POLICY hostel_allocations_select_permission ON public.hostel_allocations
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.allocations.view') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.allocations.view_own') AND learner_id = auth.uid())
);

-- ============================================================================
-- razorpay_accounts (migration 20260603130000) — service-role only; secrets here.
-- ============================================================================
ALTER TABLE public.razorpay_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages razorpay accounts" ON public.razorpay_accounts;
CREATE POLICY "Service role manages razorpay accounts" ON public.razorpay_accounts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- accommodation_types (migration 20260610100000) — global lookup table.
-- Read open to all authenticated users; writes behind admission_fees.manage.
-- ============================================================================
ALTER TABLE public.accommodation_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accommodation_types_read ON public.accommodation_types;
CREATE POLICY accommodation_types_read ON public.accommodation_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS accommodation_types_write ON public.accommodation_types;
CREATE POLICY accommodation_types_write ON public.accommodation_types
  FOR ALL
  USING (public.user_has_permission('admission_fees.manage'))
  WITH CHECK (public.user_has_permission('admission_fees.manage'));

-- ============================================================================
-- Resident room-detail visibility (migration 20260610120000) — a user may read
-- the block/room/bed referenced by their OWN hostel allocation (My Hostel card).
-- Additive to the staff perm-gated SELECT policies on these tables.
-- ============================================================================
DROP POLICY IF EXISTS hostel_blocks_select_own_allocation ON public.hostel_blocks;
CREATE POLICY hostel_blocks_select_own_allocation ON public.hostel_blocks
  FOR SELECT USING (fn_user_allocated_block(id));

DROP POLICY IF EXISTS hostel_rooms_select_own_allocation ON public.hostel_rooms;
CREATE POLICY hostel_rooms_select_own_allocation ON public.hostel_rooms
  FOR SELECT USING (fn_user_allocated_room(id));

DROP POLICY IF EXISTS hostel_beds_select_own_allocation ON public.hostel_beds;
CREATE POLICY hostel_beds_select_own_allocation ON public.hostel_beds
  FOR SELECT USING (fn_user_allocated_bed(id));

-- ============================================================================
-- hostel_category_upgrade_fees (migration 20260610210000) — read open to
-- authenticated (My Hostel reads it); writes behind campus_living.settings.edit.
-- ============================================================================
ALTER TABLE public.hostel_category_upgrade_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hostel_category_upgrade_fees_select ON public.hostel_category_upgrade_fees;
CREATE POLICY hostel_category_upgrade_fees_select ON public.hostel_category_upgrade_fees
  FOR SELECT USING (true);
DROP POLICY IF EXISTS hostel_category_upgrade_fees_insert ON public.hostel_category_upgrade_fees;
CREATE POLICY hostel_category_upgrade_fees_insert ON public.hostel_category_upgrade_fees
  FOR INSERT WITH CHECK (user_has_permission('campus_living.settings.edit'));
DROP POLICY IF EXISTS hostel_category_upgrade_fees_update ON public.hostel_category_upgrade_fees;
CREATE POLICY hostel_category_upgrade_fees_update ON public.hostel_category_upgrade_fees
  FOR UPDATE USING (user_has_permission('campus_living.settings.edit'));
DROP POLICY IF EXISTS hostel_category_upgrade_fees_delete ON public.hostel_category_upgrade_fees;
CREATE POLICY hostel_category_upgrade_fees_delete ON public.hostel_category_upgrade_fees
  FOR DELETE USING (user_has_permission('campus_living.settings.edit'));

-- ============================================================================
-- Social Media module - granular permission RLS retrofit (2026-06-11)
-- Additive permissive policies gated on user_has_permission(social.*) keys.
-- Full body in supabase/migrations/20260611160000_social_module_granular_permission_rls.sql
-- ============================================================================

-- ── Facebook ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS fb_pages_social_perm_read ON public.fb_pages;
CREATE POLICY fb_pages_social_perm_read ON public.fb_pages
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

DROP POLICY IF EXISTS fb_posts_social_perm_read ON public.fb_posts;
CREATE POLICY fb_posts_social_perm_read ON public.fb_posts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

DROP POLICY IF EXISTS fb_page_metrics_social_perm_read ON public.fb_page_metrics;
CREATE POLICY fb_page_metrics_social_perm_read ON public.fb_page_metrics
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

DROP POLICY IF EXISTS fb_post_metrics_social_perm_read ON public.fb_post_metrics;
CREATE POLICY fb_post_metrics_social_perm_read ON public.fb_post_metrics
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

DROP POLICY IF EXISTS social_facebook_logs_social_perm_read ON public.social_facebook_logs;
CREATE POLICY social_facebook_logs_social_perm_read ON public.social_facebook_logs
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

-- ── Instagram ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ig_accounts_social_perm_read ON public.ig_accounts;
CREATE POLICY ig_accounts_social_perm_read ON public.ig_accounts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_posts_social_perm_read ON public.ig_posts;
CREATE POLICY ig_posts_social_perm_read ON public.ig_posts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_post_metrics_social_perm_read ON public.ig_post_metrics;
CREATE POLICY ig_post_metrics_social_perm_read ON public.ig_post_metrics
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_account_metrics_social_perm_read ON public.ig_account_metrics;
CREATE POLICY ig_account_metrics_social_perm_read ON public.ig_account_metrics
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_monthly_audit_social_perm_read ON public.ig_monthly_audit;
CREATE POLICY ig_monthly_audit_social_perm_read ON public.ig_monthly_audit
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_stories_social_perm_read ON public.ig_stories;
CREATE POLICY ig_stories_social_perm_read ON public.ig_stories
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_story_insights_social_perm_read ON public.ig_story_insights;
CREATE POLICY ig_story_insights_social_perm_read ON public.ig_story_insights
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS social_instagram_logs_social_perm_read ON public.social_instagram_logs;
CREATE POLICY social_instagram_logs_social_perm_read ON public.social_instagram_logs
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

-- IG-login connections surface on both the Instagram and Dept Accounts pages.
DROP POLICY IF EXISTS ig_account_connections_social_perm_read ON public.ig_account_connections;
CREATE POLICY ig_account_connections_social_perm_read ON public.ig_account_connections
  FOR SELECT TO authenticated
  USING (
    user_has_permission('social.instagram.view')
    OR user_has_permission('social.departments.view')
  );

-- ── Messenger / Instagram DMs ───────────────────────────────────────────────

DROP POLICY IF EXISTS messenger_conversations_social_perm_read ON public.messenger_conversations;
CREATE POLICY messenger_conversations_social_perm_read ON public.messenger_conversations
  FOR SELECT TO authenticated
  USING (user_has_permission('social.messenger.view'));

DROP POLICY IF EXISTS messenger_messages_social_perm_read ON public.messenger_messages;
CREATE POLICY messenger_messages_social_perm_read ON public.messenger_messages
  FOR SELECT TO authenticated
  USING (user_has_permission('social.messenger.view'));

DROP POLICY IF EXISTS ig_dm_conversations_social_perm_read ON public.ig_dm_conversations;
CREATE POLICY ig_dm_conversations_social_perm_read ON public.ig_dm_conversations
  FOR SELECT TO authenticated
  USING (user_has_permission('social.messenger.view'));

DROP POLICY IF EXISTS ig_dm_messages_social_perm_read ON public.ig_dm_messages;
CREATE POLICY ig_dm_messages_social_perm_read ON public.ig_dm_messages
  FOR SELECT TO authenticated
  USING (user_has_permission('social.messenger.view'));

-- ── Ads ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_ad_accounts_social_perm_read ON public.meta_ad_accounts;
CREATE POLICY meta_ad_accounts_social_perm_read ON public.meta_ad_accounts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.ads.view'));

DROP POLICY IF EXISTS meta_ad_insights_social_perm_read ON public.meta_ad_insights;
CREATE POLICY meta_ad_insights_social_perm_read ON public.meta_ad_insights
  FOR SELECT TO authenticated
  USING (user_has_permission('social.ads.view'));

DROP POLICY IF EXISTS meta_campaigns_social_perm_read ON public.meta_campaigns;
CREATE POLICY meta_campaigns_social_perm_read ON public.meta_campaigns
  FOR SELECT TO authenticated
  USING (user_has_permission('social.ads.view'));

-- ── Lead Ads ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_leadgen_events_social_perm_read ON public.meta_leadgen_events;
CREATE POLICY meta_leadgen_events_social_perm_read ON public.meta_leadgen_events
  FOR SELECT TO authenticated
  USING (user_has_permission('social.lead_ads.view'));

-- meta_lead_forms / meta_lead_field_mappings SELECT is already open to all
-- authenticated users; only the writes (admin mappings editor + form sync,
-- which run through the user-session client) need the manage key.
DROP POLICY IF EXISTS meta_lead_forms_social_perm_write ON public.meta_lead_forms;
CREATE POLICY meta_lead_forms_social_perm_write ON public.meta_lead_forms
  FOR ALL TO authenticated
  USING (user_has_permission('social.lead_ads.manage'))
  WITH CHECK (user_has_permission('social.lead_ads.manage'));

DROP POLICY IF EXISTS meta_lead_field_mappings_social_perm_write ON public.meta_lead_field_mappings;
CREATE POLICY meta_lead_field_mappings_social_perm_write ON public.meta_lead_field_mappings
  FOR ALL TO authenticated
  USING (user_has_permission('social.lead_ads.manage'))
  WITH CHECK (user_has_permission('social.lead_ads.manage'));

-- ── Meta Pixel / CAPI ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_capi_events_social_perm_read ON public.meta_capi_events;
CREATE POLICY meta_capi_events_social_perm_read ON public.meta_capi_events
  FOR SELECT TO authenticated
  USING (user_has_permission('social.meta_pixel.view'));

-- ── Meta Audiences ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_audience_rules_social_perm_read ON public.meta_audience_rules;
CREATE POLICY meta_audience_rules_social_perm_read ON public.meta_audience_rules
  FOR SELECT TO authenticated
  USING (user_has_permission('social.meta_audiences.view'));

-- The Meta Audiences page mutates rules through the browser client
-- (lib/services/marketing/remarketing-service.ts), so writes need policies.
DROP POLICY IF EXISTS meta_audience_rules_social_perm_insert ON public.meta_audience_rules;
CREATE POLICY meta_audience_rules_social_perm_insert ON public.meta_audience_rules
  FOR INSERT TO authenticated
  WITH CHECK (user_has_permission('social.meta_audiences.manage'));

DROP POLICY IF EXISTS meta_audience_rules_social_perm_update ON public.meta_audience_rules;
CREATE POLICY meta_audience_rules_social_perm_update ON public.meta_audience_rules
  FOR UPDATE TO authenticated
  USING (user_has_permission('social.meta_audiences.manage'))
  WITH CHECK (user_has_permission('social.meta_audiences.manage'));

DROP POLICY IF EXISTS meta_audience_rules_social_perm_delete ON public.meta_audience_rules;
CREATE POLICY meta_audience_rules_social_perm_delete ON public.meta_audience_rules
  FOR DELETE TO authenticated
  USING (user_has_permission('social.meta_audiences.manage'));

DROP POLICY IF EXISTS meta_audience_sync_history_social_perm_read ON public.meta_audience_sync_history;
CREATE POLICY meta_audience_sync_history_social_perm_read ON public.meta_audience_sync_history
  FOR SELECT TO authenticated
  USING (user_has_permission('social.meta_audiences.view'));

-- ── Dept Accounts ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS social_dept_accounts_social_perm_read ON public.social_dept_accounts;
CREATE POLICY social_dept_accounts_social_perm_read ON public.social_dept_accounts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.departments.view'));

-- ── Shared Meta substrate ───────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_business_accounts_social_perm_read ON public.meta_business_accounts;
CREATE POLICY meta_business_accounts_social_perm_read ON public.meta_business_accounts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.view'));

DROP POLICY IF EXISTS meta_subscription_audit_social_perm_read ON public.meta_subscription_audit;
CREATE POLICY meta_subscription_audit_social_perm_read ON public.meta_subscription_audit
  FOR SELECT TO authenticated
  USING (user_has_permission('social.view'));

-- ── Attribution window policy ───────────────────────────────────────────────
-- The attribution page edits ONE platform_policies row from the browser.
-- Scope the new write policies to that exact policy_key so the
-- social.attribution.edit key cannot touch any other platform policy.

DROP POLICY IF EXISTS platform_policies_social_attr_insert ON public.platform_policies;
CREATE POLICY platform_policies_social_attr_insert ON public.platform_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    policy_key = 'ig.attribution_window_days'
    AND user_has_permission('social.attribution.edit')
  );

DROP POLICY IF EXISTS platform_policies_social_attr_update ON public.platform_policies;
CREATE POLICY platform_policies_social_attr_update ON public.platform_policies
  FOR UPDATE TO authenticated
  USING (
    policy_key = 'ig.attribution_window_days'
    AND user_has_permission('social.attribution.edit')
  )
  WITH CHECK (
    policy_key = 'ig.attribution_window_days'
    AND user_has_permission('social.attribution.edit')
  );

-- ─── Housekeeping (hostel_cleaning_schedules / hostel_cleaning_tasks) ────────
-- 20260611170000: RLS aligned to the permission CATALOG keys
-- (campus_living.housekeeping.view / .schedule / .mark_done). The original
-- policies checked .create/.edit/.delete — keys no role holds and that aren't
-- in lib/constants/permissions.ts, so only super_admin/admin could ever write.
-- SELECT policies (unchanged) gate on campus_living.housekeeping.view.

ALTER POLICY hostel_cleaning_schedules_insert_permission ON public.hostel_cleaning_schedules
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id)
        AND role_has_block_access(block_id))
  );

ALTER POLICY hostel_cleaning_schedules_update_permission ON public.hostel_cleaning_schedules
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id)
        AND role_has_block_access(block_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id)
        AND role_has_block_access(block_id))
  );

ALTER POLICY hostel_cleaning_schedules_delete_permission ON public.hostel_cleaning_schedules
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id)
        AND role_has_block_access(block_id))
  );

ALTER POLICY hostel_cleaning_tasks_insert_permission ON public.hostel_cleaning_tasks
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id))
  );

ALTER POLICY hostel_cleaning_tasks_update_permission ON public.hostel_cleaning_tasks
  USING (
    is_super_admin() OR is_admin()
    OR ((user_has_permission('campus_living.housekeeping.mark_done')
         OR user_has_permission('campus_living.housekeeping.schedule'))
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR ((user_has_permission('campus_living.housekeeping.mark_done')
         OR user_has_permission('campus_living.housekeeping.schedule'))
        AND role_has_institution_access(institution_id))
  );

ALTER POLICY hostel_cleaning_tasks_delete_permission ON public.hostel_cleaning_tasks
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id))
  );

-- =====================================================================
-- Global Calendar module (Phase 1) — mirror of 20260623100000_calendar_module_tables.sql
-- =====================================================================
ALTER TABLE public.calendar_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feed_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_categories    FROM anon;
REVOKE ALL ON public.calendar_entries       FROM anon;
REVOKE ALL ON public.calendar_feed_settings FROM anon;

DROP POLICY IF EXISTS calendar_categories_select ON public.calendar_categories;
CREATE POLICY calendar_categories_select ON public.calendar_categories
  FOR SELECT USING (is_super_admin() OR is_admin() OR user_has_permission('calendar.view'));
DROP POLICY IF EXISTS calendar_categories_write ON public.calendar_categories;
CREATE POLICY calendar_categories_write ON public.calendar_categories
  FOR ALL USING (is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage'));

DROP POLICY IF EXISTS calendar_entries_select ON public.calendar_entries;
CREATE POLICY calendar_entries_select ON public.calendar_entries
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.view')
        AND (scope_institution_ids IS NULL OR scope_institution_ids && public._user_accessible_institutions())));
DROP POLICY IF EXISTS calendar_entries_write ON public.calendar_entries;
CREATE POLICY calendar_entries_write ON public.calendar_entries
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.holidays.manage')
        AND (scope_institution_ids IS NULL OR scope_institution_ids && public._user_accessible_institutions())))
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.holidays.manage')
        AND (scope_institution_ids IS NULL OR scope_institution_ids && public._user_accessible_institutions())));

DROP POLICY IF EXISTS calendar_feed_settings_select ON public.calendar_feed_settings;
CREATE POLICY calendar_feed_settings_select ON public.calendar_feed_settings
  FOR SELECT USING (is_super_admin() OR is_admin() OR user_has_permission('calendar.view'));
DROP POLICY IF EXISTS calendar_feed_settings_write ON public.calendar_feed_settings;
CREATE POLICY calendar_feed_settings_write ON public.calendar_feed_settings
  FOR ALL USING (is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage'));

-- =====================================================================
-- 2026-06-24 — Social Loop Engine playbook table
-- Dynamic-permission RLS: read=social.view, write=social.manage (or admins).
-- Migration: supabase/migrations/20260624031500_social_loop_playbook.sql
-- =====================================================================
ALTER TABLE public.social_loop_playbook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_loop_playbook_select ON public.social_loop_playbook;
CREATE POLICY social_loop_playbook_select ON public.social_loop_playbook
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('social.view'));

DROP POLICY IF EXISTS social_loop_playbook_insert ON public.social_loop_playbook;
CREATE POLICY social_loop_playbook_insert ON public.social_loop_playbook
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('social.manage'));

DROP POLICY IF EXISTS social_loop_playbook_update ON public.social_loop_playbook;
CREATE POLICY social_loop_playbook_update ON public.social_loop_playbook
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('social.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('social.manage'));

REVOKE ALL ON public.social_loop_playbook FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.social_loop_playbook TO authenticated;

-- ── Induction session polls (2026-06-30) — super_admin-only direct access; rest via DEFINER RPCs ──
ALTER TABLE public.induction_session_poll ENABLE ROW LEVEL SECURITY;
CREATE POLICY induction_session_poll_super_admin ON public.induction_session_poll FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
ALTER TABLE public.induction_session_poll_question ENABLE ROW LEVEL SECURITY;
CREATE POLICY induction_session_poll_question_super_admin ON public.induction_session_poll_question FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
ALTER TABLE public.induction_session_poll_option ENABLE ROW LEVEL SECURITY;
CREATE POLICY induction_session_poll_option_super_admin ON public.induction_session_poll_option FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
ALTER TABLE public.induction_session_poll_vote ENABLE ROW LEVEL SECURITY;
CREATE POLICY induction_session_poll_vote_super_admin ON public.induction_session_poll_vote FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
-- =====================================================================
-- 2026-06-30 — Schools Network module (DB substrate, Agent A)
-- Migration: supabase/migrations/20260630120000_schools_network_substrate.sql
-- Spec: /tmp/schools-network-spec.md
-- Canonical pattern: is_super_admin() OR is_admin() OR
--   (user_has_permission('schools_network.X') AND school-scope helper).
-- 30 policies across 10 tables. Anon locked out + authenticated GRANTed.
-- =====================================================================

-- Master tables: read-open to authenticated, admin-write
DROP POLICY IF EXISTS school_session_types_select_authed ON public.school_session_types;
CREATE POLICY school_session_types_select_authed ON public.school_session_types
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS school_session_types_admin_write ON public.school_session_types;
CREATE POLICY school_session_types_admin_write ON public.school_session_types
  FOR ALL TO authenticated
  USING      (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'));

DROP POLICY IF EXISTS program_partner_types_select_authed ON public.program_partner_types;
CREATE POLICY program_partner_types_select_authed ON public.program_partner_types
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS program_partner_types_admin_write ON public.program_partner_types;
CREATE POLICY program_partner_types_admin_write ON public.program_partner_types
  FOR ALL TO authenticated
  USING      (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'));

DROP POLICY IF EXISTS school_contact_roles_select_authed ON public.school_contact_roles;
CREATE POLICY school_contact_roles_select_authed ON public.school_contact_roles
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS school_contact_roles_admin_write ON public.school_contact_roles;
CREATE POLICY school_contact_roles_admin_write ON public.school_contact_roles
  FOR ALL TO authenticated
  USING      (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'));

-- schools
DROP POLICY IF EXISTS schools_select ON public.schools;
CREATE POLICY schools_select ON public.schools FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('schools_network.schools.view')
      AND (user_owns_school(id) OR user_leads_partner_for_school(id)
           OR (ownership = 'internal' AND role_has_institution_access(institution_id))))
  OR is_school_portal_user_for(id)
);
DROP POLICY IF EXISTS schools_insert ON public.schools;
CREATE POLICY schools_insert ON public.schools FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('schools_network.schools.create')
);
DROP POLICY IF EXISTS schools_update ON public.schools;
CREATE POLICY schools_update ON public.schools FOR UPDATE
  USING (is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.schools.edit')
        AND (user_owns_school(id) OR user_leads_partner_for_school(id))))
  WITH CHECK (is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.schools.edit')
        AND (user_owns_school(id) OR user_leads_partner_for_school(id))));
DROP POLICY IF EXISTS schools_delete ON public.schools;
CREATE POLICY schools_delete ON public.schools FOR DELETE USING (is_super_admin() OR is_admin());

-- school_contacts
DROP POLICY IF EXISTS school_contacts_select ON public.school_contacts;
CREATE POLICY school_contacts_select ON public.school_contacts FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('schools_network.contacts.view')
      AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  OR is_school_portal_user_for(school_id)
);
DROP POLICY IF EXISTS school_contacts_insert ON public.school_contacts;
CREATE POLICY school_contacts_insert ON public.school_contacts FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('schools_network.contacts.create')
      AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
);
DROP POLICY IF EXISTS school_contacts_update ON public.school_contacts;
CREATE POLICY school_contacts_update ON public.school_contacts FOR UPDATE
  USING (is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contacts.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))))
  WITH CHECK (is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contacts.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))));
DROP POLICY IF EXISTS school_contacts_delete ON public.school_contacts;
CREATE POLICY school_contacts_delete ON public.school_contacts FOR DELETE USING (is_super_admin() OR is_admin());

-- school_sessions
DROP POLICY IF EXISTS school_sessions_select ON public.school_sessions;
CREATE POLICY school_sessions_select ON public.school_sessions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('schools_network.sessions.view')
      AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  OR is_school_portal_user_for(school_id)
);
DROP POLICY IF EXISTS school_sessions_insert ON public.school_sessions;
CREATE POLICY school_sessions_insert ON public.school_sessions FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('schools_network.sessions.create')
      AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
);
DROP POLICY IF EXISTS school_sessions_update ON public.school_sessions;
CREATE POLICY school_sessions_update ON public.school_sessions FOR UPDATE
  USING (is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.sessions.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))))
  WITH CHECK (is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.sessions.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))));
DROP POLICY IF EXISTS school_sessions_delete ON public.school_sessions;
CREATE POLICY school_sessions_delete ON public.school_sessions FOR DELETE USING (is_super_admin() OR is_admin());

-- school_contributions
DROP POLICY IF EXISTS school_contributions_select ON public.school_contributions;
CREATE POLICY school_contributions_select ON public.school_contributions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('schools_network.contributions.view')
      AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  OR is_school_portal_user_for(school_id)
);
DROP POLICY IF EXISTS school_contributions_insert ON public.school_contributions;
CREATE POLICY school_contributions_insert ON public.school_contributions FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('schools_network.contributions.create')
      AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
);
DROP POLICY IF EXISTS school_contributions_update ON public.school_contributions;
CREATE POLICY school_contributions_update ON public.school_contributions FOR UPDATE
  USING (is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contributions.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))))
  WITH CHECK (is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contributions.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))));
DROP POLICY IF EXISTS school_contributions_delete ON public.school_contributions;
CREATE POLICY school_contributions_delete ON public.school_contributions FOR DELETE USING (is_super_admin() OR is_admin());

-- school_jkkn_owners
DROP POLICY IF EXISTS school_jkkn_owners_select ON public.school_jkkn_owners;
CREATE POLICY school_jkkn_owners_select ON public.school_jkkn_owners FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR jkkn_user_id = auth.uid()
  OR (user_has_permission('schools_network.owners.view') AND user_owns_school(school_id))
);
DROP POLICY IF EXISTS school_jkkn_owners_admin_write ON public.school_jkkn_owners;
CREATE POLICY school_jkkn_owners_admin_write ON public.school_jkkn_owners FOR ALL
  USING (is_super_admin() OR is_admin() OR user_has_permission('schools_network.owners.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.owners.manage'));

-- program_partners + program_partner_grants
DROP POLICY IF EXISTS program_partners_select ON public.program_partners;
CREATE POLICY program_partners_select ON public.program_partners FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('schools_network.partners.view')
);
DROP POLICY IF EXISTS program_partners_admin_write ON public.program_partners;
CREATE POLICY program_partners_admin_write ON public.program_partners FOR ALL
  USING (is_super_admin() OR is_admin() OR user_has_permission('schools_network.partners.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.partners.manage'));

DROP POLICY IF EXISTS program_partner_grants_select ON public.program_partner_grants;
CREATE POLICY program_partner_grants_select ON public.program_partner_grants FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('schools_network.grants.view')
);
DROP POLICY IF EXISTS program_partner_grants_admin_write ON public.program_partner_grants;
CREATE POLICY program_partner_grants_admin_write ON public.program_partner_grants FOR ALL
  USING (is_super_admin() OR is_admin() OR user_has_permission('schools_network.grants.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.grants.manage'));

-- Anon lockdown + authenticated grants (defense-in-depth on top of policies)
REVOKE ALL ON public.school_session_types     FROM anon;
REVOKE ALL ON public.program_partner_types    FROM anon;
REVOKE ALL ON public.school_contact_roles     FROM anon;
REVOKE ALL ON public.schools                  FROM anon;
REVOKE ALL ON public.school_contacts          FROM anon;
REVOKE ALL ON public.school_jkkn_owners       FROM anon;
REVOKE ALL ON public.school_sessions          FROM anon;
REVOKE ALL ON public.school_contributions     FROM anon;
REVOKE ALL ON public.program_partners         FROM anon;
REVOKE ALL ON public.program_partner_grants   FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_session_types     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_partner_types    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contact_roles     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contacts          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_jkkn_owners       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_sessions          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contributions     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_partners         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_partner_grants   TO authenticated;

-- ── Induction day/program feedback (2026-07-30) ──
-- Migration: supabase/migrations/20260730110000_induction_day_program_feedback.sql
DROP POLICY IF EXISTS event_day_feedback_admin ON public.event_day_feedback;
CREATE POLICY event_day_feedback_admin ON public.event_day_feedback FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS event_program_feedback_admin ON public.event_program_feedback;
CREATE POLICY event_program_feedback_admin ON public.event_program_feedback FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ── Induction event coordinators (2026-07-30) ──
-- Migration: supabase/migrations/20260730120000_induction_event_coordinators.sql
DROP POLICY IF EXISTS induction_event_coordinators_admin ON public.induction_event_coordinators;
CREATE POLICY induction_event_coordinators_admin ON public.induction_event_coordinators FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ── Induction resource-person (session speaker) reads (2026-07-02) ──
-- Migration: supabase/migrations/20260702150000_induction_resource_person_session_access.sql
--            supabase/migrations/20260702151000_induction_speakers_read_co_speakers.sql
-- A credited resource person can read the event shell + speaker links of the
-- induction they speak at. Additive SELECT-only; writes stay RPC-gated.
DROP POLICY IF EXISTS events_induction_speaker_read ON public.events;
CREATE POLICY events_induction_speaker_read ON public.events
  FOR SELECT TO authenticated
  USING (public.fn_induction_is_event_speaker(id));

-- ── Tournament per-event organizer reads (2026-07-22) ──
-- Migration: supabase/migrations/20260722130000_events_tournament_role_read_rls.sql
-- The tournament counterpart of the induction policy above. In-charges, committee
-- members and checked-in volunteers are authorized per event by the module's RPCs,
-- but `events` itself is read client-side (EventBaseService.getEvent), and its only
-- SELECT paths were institution-match or is_public+non-draft. A cross-institution
-- student committee member therefore got PGRST116 -> null -> "Tournament not found".
-- All three fn_* are SECURITY DEFINER and hard-code auth.uid(), so no recursion and
-- each caller only ever learns their own role. Additive SELECT-only.
DROP POLICY IF EXISTS events_tournament_role_read ON public.events;
CREATE POLICY events_tournament_role_read ON public.events
  FOR SELECT TO authenticated
  USING (
    event_type = 'sports_tournament'
    AND (
      public.fn_is_event_incharge(id)
      OR public.fn_is_event_committee_member(id)
      OR public.fn_is_event_volunteer(id)
    )
  );

DROP POLICY IF EXISTS induction_programs_speaker_view ON public.induction_programs;
CREATE POLICY induction_programs_speaker_view ON public.induction_programs
  FOR SELECT TO authenticated
  USING (public.fn_induction_is_event_speaker(event_id));

DROP POLICY IF EXISTS induction_batches_speaker_view ON public.induction_batches;
CREATE POLICY induction_batches_speaker_view ON public.induction_batches
  FOR SELECT TO authenticated
  USING (public.fn_induction_is_event_speaker(event_id));

DROP POLICY IF EXISTS ess_event_speaker_read ON public.event_session_speakers;
CREATE POLICY ess_event_speaker_read ON public.event_session_speakers
  FOR SELECT TO authenticated
  USING (public.fn_induction_session_in_my_speaker_event(session_id));

-- =====================================================================
-- social_monthly_cadence — RLS policies + config seeds + HOD owner grant
-- Added: 2026-07-04 — mirror of migration 20260704120000_social_monthly_cadence.sql
-- Canonical dynamic-permission pattern (no hardcoded roles). Writer RPCs
-- (02_functions.sql) also self-gate because DEFINER bypasses RLS.
-- =====================================================================

-- SELECT-only RLS (round-3). Writes have NO table grant (see 01_tables.sql) and
-- flow only through the DEFINER RPCs, so INSERT/UPDATE policies are removed.
-- MED #3 (round-2): the SELECT USING adds fn_social_caller_owns_dept so a
-- scope='own' HOD reads ONLY its own dept's cadence rows, not every dept's in
-- the tenant (admins bypass; NULL dept falls back to institution scope). The
-- helper is defined in 02_functions.sql.
DROP POLICY IF EXISTS social_monthly_cadence_select ON public.social_monthly_cadence;
CREATE POLICY social_monthly_cadence_select ON public.social_monthly_cadence
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('social.departments.view')
      AND role_has_institution_access(institution_id)
      AND fn_social_caller_owns_dept(department_id)
    )
  );

-- Write policies REMOVED (round-3 HIGH root fix): authenticated has no
-- INSERT/UPDATE/DELETE grant. Dropped idempotently if an earlier apply made them.
DROP POLICY IF EXISTS social_monthly_cadence_insert ON public.social_monthly_cadence;
DROP POLICY IF EXISTS social_monthly_cadence_update ON public.social_monthly_cadence;

-- Config seeds (ships DARK): social.cadence.* in the canonical platform_policies store.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system) VALUES
('social.cadence.enabled', 'global', NULL, 'false'::jsonb,
  'Master switch for the Department Instagram monthly cadence engine. Ships DARK (false) — flip true only after Director review + jkknpharmacy pilot.',
  'boolean', NULL, true),
('social.cadence.clock_mode', 'global', NULL, '"calendar_month"'::jsonb,
  'Monthly clock for cadence cycles. v1 locks calendar_month (aligned to ig_monthly_audit.audit_month).',
  'enum', '["calendar_month","days_from_objective"]'::jsonb, true),
('social.cadence.period_days', 'global', NULL, '30'::jsonb,
  'Cycle length in days — used ONLY in days_from_objective clock mode (ignored under calendar_month).',
  'number', NULL, true),
('social.cadence.win_delta_pct', 'global', NULL, '10'::jsonb,
  'Minimum month-over-month reach uplift (%) for a cadence cycle to grade as a win.',
  'number', NULL, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Owner grant (Director-locked): scope='own' HOD owns its dept's cadence.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
      'social.departments.view', true,
      'social.departments.manage', true
    ),
    updated_at = now()
WHERE role_key = 'hod' AND is_active = true;

-- hr_recruitment_candidate_comments (migration 20260703130200) — visibility
-- inherits the candidate row's RLS via EXISTS.
ALTER TABLE hr_recruitment_candidate_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_rec_cand_comments_select ON hr_recruitment_candidate_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_recruitment_candidates c WHERE c.id = hr_recruitment_candidate_comments.candidate_id));
CREATE POLICY hr_rec_cand_comments_insert ON hr_recruitment_candidate_comments
  FOR INSERT TO authenticated
  WITH CHECK (commenter_id = auth.uid()
    AND EXISTS (SELECT 1 FROM hr_recruitment_candidates c WHERE c.id = hr_recruitment_candidate_comments.candidate_id));

-- =====================================================================================
-- Cohort Core RLS (migration 20260731040000_cohort_core_spine.sql). Added 2026-07-05.
-- Canonical dynamic-permission pattern: is_super_admin() OR is_admin() first, then
-- user_has_permission('cohort.<verb>') + tenant scope. cohorts scope directly on
-- institution_id; memberships/events scope through the parent cohort via EXISTS.
-- SECDEF calls wrapped as (select fn(...)) → InitPlan-cached once per statement.
-- DELETE gated on cohort.manage (keeps every referenced key in PERMISSION_CATEGORIES).
-- Events are append-only: UPDATE/DELETE are admin-only.
-- =====================================================================================
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohorts_select_permission ON public.cohorts;
CREATE POLICY cohorts_select_permission ON public.cohorts
  FOR SELECT USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.view'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohorts_insert_permission ON public.cohorts;
CREATE POLICY cohorts_insert_permission ON public.cohorts
  FOR INSERT WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.create'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohorts_update_permission ON public.cohorts;
CREATE POLICY cohorts_update_permission ON public.cohorts
  FOR UPDATE USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.edit'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohorts_delete_permission ON public.cohorts;
CREATE POLICY cohorts_delete_permission ON public.cohorts
  FOR DELETE USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

ALTER TABLE public.cohort_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_memberships_select_permission ON public.cohort_memberships;
CREATE POLICY cohort_memberships_select_permission ON public.cohort_memberships
  FOR SELECT USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.view'::text))
        AND EXISTS (SELECT 1 FROM public.cohorts c
                    WHERE c.id = cohort_memberships.cohort_id
                      AND role_has_institution_access(c.institution_id)))
  );

DROP POLICY IF EXISTS cohort_memberships_insert_permission ON public.cohort_memberships;
CREATE POLICY cohort_memberships_insert_permission ON public.cohort_memberships
  FOR INSERT WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.create'::text))
        AND EXISTS (SELECT 1 FROM public.cohorts c
                    WHERE c.id = cohort_memberships.cohort_id
                      AND role_has_institution_access(c.institution_id)))
  );

DROP POLICY IF EXISTS cohort_memberships_update_permission ON public.cohort_memberships;
CREATE POLICY cohort_memberships_update_permission ON public.cohort_memberships
  FOR UPDATE USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.edit'::text))
        AND EXISTS (SELECT 1 FROM public.cohorts c
                    WHERE c.id = cohort_memberships.cohort_id
                      AND role_has_institution_access(c.institution_id)))
  );

DROP POLICY IF EXISTS cohort_memberships_delete_permission ON public.cohort_memberships;
CREATE POLICY cohort_memberships_delete_permission ON public.cohort_memberships
  FOR DELETE USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND EXISTS (SELECT 1 FROM public.cohorts c
                    WHERE c.id = cohort_memberships.cohort_id
                      AND role_has_institution_access(c.institution_id)))
  );

ALTER TABLE public.cohort_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_status_events_select_permission ON public.cohort_status_events;
CREATE POLICY cohort_status_events_select_permission ON public.cohort_status_events
  FOR SELECT USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.view'::text))
        AND EXISTS (SELECT 1 FROM public.cohorts c
                    WHERE (c.id = cohort_status_events.cohort_id
                           OR c.id = (SELECT m.cohort_id FROM public.cohort_memberships m
                                      WHERE m.id = cohort_status_events.membership_id))
                      AND role_has_institution_access(c.institution_id)))
  );

DROP POLICY IF EXISTS cohort_status_events_insert_permission ON public.cohort_status_events;
CREATE POLICY cohort_status_events_insert_permission ON public.cohort_status_events
  FOR INSERT WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.edit'::text))
        AND EXISTS (SELECT 1 FROM public.cohorts c
                    WHERE (c.id = cohort_status_events.cohort_id
                           OR c.id = (SELECT m.cohort_id FROM public.cohort_memberships m
                                      WHERE m.id = cohort_status_events.membership_id))
                      AND role_has_institution_access(c.institution_id)))
  );

DROP POLICY IF EXISTS cohort_status_events_update_permission ON public.cohort_status_events;
CREATE POLICY cohort_status_events_update_permission ON public.cohort_status_events
  FOR UPDATE USING ((select is_super_admin()) OR (select is_admin()));

DROP POLICY IF EXISTS cohort_status_events_delete_permission ON public.cohort_status_events;
CREATE POLICY cohort_status_events_delete_permission ON public.cohort_status_events
  FOR DELETE USING ((select is_super_admin()) OR (select is_admin()));

-- Cohort Core — Foundations self-enrol carve-out on cohort_memberships
-- (migration 20260731080000_foundations_demote_to_cohort_core.sql, 2026-07-06).
-- The Foundations self-enrol POST runs RLS-scoped AS THE STUDENT (never
-- service-role); the standard cohort_memberships_insert_permission needs
-- cohort.create, which a student does not hold, so mirroring their membership would
-- 403. This permissive INSERT policy OR-adds a narrow self-insert path (mirrors the
-- ssf_responses_insert `submitted_by = auth.uid()` self-policy): the caller may
-- insert ONLY a non-terminal member_type='student' row referencing THEIR OWN uid
-- into a kind='foundations' cohort. Graduation stays mentor-gated (D5) — a student
-- cannot self-insert a 'graduated' membership. The facilitator-add path is
-- unaffected (member_ref = the enrolled student, not the caller).
DROP POLICY IF EXISTS cohort_memberships_foundations_self_insert ON public.cohort_memberships;
CREATE POLICY cohort_memberships_foundations_self_insert ON public.cohort_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    member_type = 'student'
    AND member_ref = (select auth.uid())
    AND status IN ('invited', 'enrolled', 'active')
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = cohort_memberships.cohort_id
        AND c.kind = 'foundations'
    )
  );


-- ── Cohort Core — M2: cohort_outcomes RLS (Phase 7 · THE MOAT) ────────────────
-- Migration: supabase/migrations/20260731091000_cohort_outcome_capture.sql (2026-07-05).
-- Institution-scoped (cohort_outcomes.institution_id is NOT NULL, copied from the
-- parent cohort). SELECT→cohort.view; INSERT→cohort.manage (manual/service
-- capture; the trigger is SECURITY DEFINER and bypasses RLS); UPDATE/DELETE
-- admin-only (a captured baseline is a tamper-resistant moat record).
ALTER TABLE public.cohort_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_outcomes_select_permission ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_select_permission ON public.cohort_outcomes
  FOR SELECT USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.view'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohort_outcomes_insert_permission ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_insert_permission ON public.cohort_outcomes
  FOR INSERT WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohort_outcomes_update_permission ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_update_permission ON public.cohort_outcomes
  FOR UPDATE USING ((select is_super_admin()) OR (select is_admin()));

DROP POLICY IF EXISTS cohort_outcomes_delete_permission ON public.cohort_outcomes;
CREATE POLICY cohort_outcomes_delete_permission ON public.cohort_outcomes
  FOR DELETE USING ((select is_super_admin()) OR (select is_admin()));

-- hr_recruitment_job_notes (migration 20260706110000) — visibility inherits
-- the job row's RLS via EXISTS.
ALTER TABLE hr_recruitment_job_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_rec_job_notes_select ON hr_recruitment_job_notes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_recruitment_jobs j WHERE j.id = hr_recruitment_job_notes.job_id));
CREATE POLICY hr_rec_job_notes_insert ON hr_recruitment_job_notes
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM hr_recruitment_jobs j WHERE j.id = hr_recruitment_job_notes.job_id));

-- ── Cohort Core — M7.2/M7.3 RLS (Phase 7 · THE MOAT) ─────────────────────────
-- Migrations: 20260731093000_cohort_experiments.sql, 20260731094000_cohort_feedforward.sql
-- Canonical dynamic-permission: is_super_admin/is_admin first, then cohort.view
-- (read) / cohort.manage (write) + role_has_institution_access; DELETE admin-only.

ALTER TABLE public.cohort_experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_experiments_select_permission ON public.cohort_experiments;
CREATE POLICY cohort_experiments_select_permission ON public.cohort_experiments
  FOR SELECT USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.view'::text))
        AND (select role_has_institution_access(institution_id)))
  );

-- INSERT/UPDATE is manage-level (the compute fn is DEFINER and bypasses RLS; this
-- governs a manual/service-role-less recompute performed as the user).
DROP POLICY IF EXISTS cohort_experiments_insert_permission ON public.cohort_experiments;
CREATE POLICY cohort_experiments_insert_permission ON public.cohort_experiments
  FOR INSERT WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohort_experiments_update_permission ON public.cohort_experiments;
CREATE POLICY cohort_experiments_update_permission ON public.cohort_experiments
  FOR UPDATE USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

-- DELETE admin-only (an experiment result is a moat audit record).
DROP POLICY IF EXISTS cohort_experiments_delete_permission ON public.cohort_experiments;
CREATE POLICY cohort_experiments_delete_permission ON public.cohort_experiments
  FOR DELETE USING ( (select is_super_admin()) OR (select is_admin()) );

ALTER TABLE public.cohort_adjustment_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_proposals_select_permission ON public.cohort_adjustment_proposals;
CREATE POLICY cohort_proposals_select_permission ON public.cohort_adjustment_proposals
  FOR SELECT USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.view'::text))
        AND (select role_has_institution_access(institution_id)))
  );

-- INSERT = manage (the proposer fn is DEFINER; this governs a manual insert).
DROP POLICY IF EXISTS cohort_proposals_insert_permission ON public.cohort_adjustment_proposals;
CREATE POLICY cohort_proposals_insert_permission ON public.cohort_adjustment_proposals
  FOR INSERT WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

-- UPDATE = manage: this is the HUMAN APPROVAL surface (pending→approved/rejected).
DROP POLICY IF EXISTS cohort_proposals_update_permission ON public.cohort_adjustment_proposals;
CREATE POLICY cohort_proposals_update_permission ON public.cohort_adjustment_proposals
  FOR UPDATE USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohort_proposals_delete_permission ON public.cohort_adjustment_proposals;
CREATE POLICY cohort_proposals_delete_permission ON public.cohort_adjustment_proposals
  FOR DELETE USING ( (select is_super_admin()) OR (select is_admin()) );
-- ============================================================================
-- Cross-institution teaching (migration 20260706_cross_institution_teaching)
-- Visiting staff (assigned via staff planning into another institution's plan)
-- need: their staff row visible where they teach, read access to that
-- institution's academic structure, and a permission-gated attendance
-- read/write path. All policies are ADDITIVE (permissive OR) — existing
-- policies untouched. Helpers are SECURITY DEFINER (see 02_functions.sql).
-- ============================================================================

-- `staff` (856 rows) is read unbounded by the analytics dashboard, list pages, pickers
-- and exports. The per-row form below caused a multi-second "Loading Dashboard..." hang
-- (1245 ms / 33,766 buffers for one scan as an own_institution user). Both staff SELECT
-- policies now use the once-evaluated forms -- see
-- supabase/migrations/optimize_staff_select_rls_dashboard_perf.sql for the measurements
-- and the 11-user equivalence proof. Keep these two policies in sync with that migration;
-- the pre-optimisation shapes live in 20260511_staff_module_scope_lockdown.sql and in the
-- Cross-institution teaching migration and must NOT be restored.
DROP POLICY IF EXISTS "staff_select_scope_aware" ON public.staff;
CREATE POLICY "staff_select_scope_aware" ON public.staff
FOR SELECT USING (
  (SELECT is_super_admin())
  OR (
    (SELECT user_has_permission('staff.view'))
    AND (
      CASE (SELECT get_user_module_scope('staff'))
        WHEN 'all_institutions' THEN TRUE
        WHEN 'own_institution'  THEN (
          staff.institution_id IS NULL
          OR staff.institution_id IN (SELECT unnest(public._user_accessible_institutions()))
        )
        WHEN 'own_records'      THEN staff.profile_id = (SELECT auth.uid())
        ELSE FALSE
      END
    )
  )
);

DROP POLICY IF EXISTS "staff_select_visiting_teacher" ON public.staff;
CREATE POLICY "staff_select_visiting_teacher" ON public.staff
FOR SELECT USING (
  (
    (SELECT user_has_permission('academic.staff.planning.view'))
    OR (SELECT user_has_permission('academic.timetables.view'))
    OR (SELECT user_has_permission('academic.attendance.mark'))
    OR (SELECT user_has_permission('academic.attendance.view'))
  )
  AND staff.id IN (SELECT unnest(public.staff_ids_visiting_accessible_institutions()))
);

-- Visiting teachers can read the academic structure of institutions they teach in.
-- courses is large (~3790 rows); the per-row staff_teaches_in_institution(institution_id)
-- caused a full-scan statement timeout (57014). Use a once-evaluated hashed sublink instead.
-- (sections/semesters/degrees stay on the per-row form — those tables are small.)
DROP POLICY IF EXISTS "courses_select_visiting_teacher" ON public.courses;
CREATE POLICY "courses_select_visiting_teacher" ON public.courses
FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

-- Permission-based read. Var-free checks are hoisted to one-time evaluation
-- (scalar sub-selects for booleans, hashed sublink for the institution set) so the
-- unbounded courses scan no longer re-runs role_has_institution_access() per row (57014).
DROP POLICY IF EXISTS "courses_select_permission" ON public.courses;
CREATE POLICY "courses_select_permission" ON public.courses
FOR SELECT USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR (
    (SELECT user_has_permission('organizations.courses.view'::text))
    AND institution_id IN (SELECT unnest(public._user_accessible_institutions()))
  )
);

-- Visiting-teacher policies: the per-row staff_teaches_in_institution(institution_id)
-- full-scanned these tables (esp. student_attendance, which grows daily) and hit the
-- 8s statement_timeout (57014) -> "attendance not loading". Replaced with the once-
-- evaluated hashed sublink institution_id IN (SELECT unnest(staff_teaching_institution_ids())),
-- and the Var-free permission check hoisted via (SELECT user_has_permission(...)).
-- Migration: optimize_attendance_visiting_teacher_rls_perf.sql (2026-07-16).
DROP POLICY IF EXISTS "sections_select_visiting_teacher" ON public.sections;
CREATE POLICY "sections_select_visiting_teacher" ON public.sections
FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

DROP POLICY IF EXISTS "semesters_select_visiting_teacher" ON public.semesters;
CREATE POLICY "semesters_select_visiting_teacher" ON public.semesters
FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

DROP POLICY IF EXISTS "degrees_select_visiting_teacher" ON public.degrees;
CREATE POLICY "degrees_select_visiting_teacher" ON public.degrees
FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

DROP POLICY IF EXISTS "departments_select_visiting_teacher" ON public.departments;
CREATE POLICY "departments_select_visiting_teacher" ON public.departments
FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

DROP POLICY IF EXISTS "programs_select_visiting_teacher" ON public.programs;
CREATE POLICY "programs_select_visiting_teacher" ON public.programs
FOR SELECT USING (institution_id IN (SELECT unnest(public.staff_teaching_institution_ids())));

-- student_attendance: permission-gated visiting read/write (covers visiting
-- staff whose profile role is hod / custom — the legacy faculty-role path
-- doesn't admit them)
DROP POLICY IF EXISTS "student_attendance_select_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_select_visiting_teacher" ON public.student_attendance
FOR SELECT USING (
  (SELECT user_has_permission('academic.attendance.mark'))
  AND institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
);

DROP POLICY IF EXISTS "student_attendance_insert_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_insert_visiting_teacher" ON public.student_attendance
FOR INSERT WITH CHECK (
  (SELECT user_has_permission('academic.attendance.mark'))
  AND institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
);

DROP POLICY IF EXISTS "student_attendance_update_visiting_teacher" ON public.student_attendance;
CREATE POLICY "student_attendance_update_visiting_teacher" ON public.student_attendance
FOR UPDATE USING (
  (SELECT user_has_permission('academic.attendance.mark'))
  AND institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
) WITH CHECK (
  (SELECT user_has_permission('academic.attendance.mark'))
  AND institution_id IN (SELECT unnest(public.staff_teaching_institution_ids()))
);

-- ============================================================================
-- School Master (global lookup: authenticated read, permission-gated writes)
-- ============================================================================
ALTER TABLE public.school_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_master_select ON public.school_master
  FOR SELECT TO authenticated USING (true);
CREATE POLICY school_master_insert ON public.school_master
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('learners.school_master.create'));
CREATE POLICY school_master_update ON public.school_master
  FOR UPDATE TO authenticated
  USING (public.user_has_permission('learners.school_master.edit'))
  WITH CHECK (public.user_has_permission('learners.school_master.edit'));
CREATE POLICY school_master_delete ON public.school_master
  FOR DELETE TO authenticated
  USING (public.user_has_permission('learners.school_master.delete'));

REVOKE ALL ON public.school_master FROM anon;

-- ============================================================================
-- Postal Codes (static lookup: authenticated read only, no write policies)
-- ============================================================================
ALTER TABLE public.postal_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY postal_codes_select ON public.postal_codes
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.postal_codes FROM anon;

-- Postal Codes: admin CRUD (added 20260731104000) — writes permission-gated
CREATE POLICY postal_codes_insert ON public.postal_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('learners.postal_codes.create'));
CREATE POLICY postal_codes_update ON public.postal_codes
  FOR UPDATE TO authenticated
  USING (public.user_has_permission('learners.postal_codes.edit'))
  WITH CHECK (public.user_has_permission('learners.postal_codes.edit'));
CREATE POLICY postal_codes_delete ON public.postal_codes
  FOR DELETE TO authenticated
  USING (public.user_has_permission('learners.postal_codes.delete'));

-- ── Tournament In-charge access (2026-07-10, tournament_incharge_access) ──────
-- Additive: in-charges (events.config->'incharges') get full event-row update +
-- division CRUD; committee members get division read.

CREATE POLICY "events_incharge_update" ON public.events
  FOR UPDATE TO authenticated
  USING (public.fn_is_event_incharge(id))
  WITH CHECK (public.fn_is_event_incharge(id));

CREATE POLICY "tournament_divisions_incharge_all" ON public.tournament_divisions
  FOR ALL TO authenticated
  USING (public.fn_is_event_incharge(event_id))
  WITH CHECK (public.fn_is_event_incharge(event_id));

CREATE POLICY "tournament_divisions_committee_read" ON public.tournament_divisions
  FOR SELECT TO authenticated
  USING (public.fn_is_event_committee_member(event_id));

-- ── Tournament dynamic registration form builder (2026-07-14, event_registration_form_builder) ──
-- Mirrors tournament_divisions_select/_insert/_update/_delete (sports_tournament_pr1)
-- + the in-charge FOR ALL policy (tournament_incharge_access) above. event_id is
-- denormalized onto all 3 tables so each policy stays a single-join EXISTS.

ALTER TABLE event_registration_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration_form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_registration_forms_select" ON event_registration_forms
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

CREATE POLICY "event_registration_forms_manage" ON event_registration_forms
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

CREATE POLICY "event_registration_form_sections_select" ON event_registration_form_sections
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

CREATE POLICY "event_registration_form_sections_manage" ON event_registration_form_sections
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

CREATE POLICY "event_registration_form_fields_select" ON event_registration_form_fields
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

CREATE POLICY "event_registration_form_fields_manage" ON event_registration_form_fields
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

-- ── hostel_attendance: BLOCK-scoped RLS (multi-college hostel) ───────────
-- Added: 2026-07-14 (migration: 20260714160000_hostel_attendance_block_scoped_rls,
-- superseding 20260714153000_hostel_attendance_update_allow_marker).
--
-- The row's institution_id is the RESIDENT's home college and block_id is the
-- physical block. In the hostel-rooms-v2 model one block houses residents from
-- several affiliated colleges, so a block-scoped warden (chief_warden, granted
-- the block via user_block_access) has BLOCK access but NO institution access to
-- the residents' home colleges. The generated policies used
--   role_has_institution_access(institution_id) AND role_has_block_access(block_id)
-- which fails on the institution dimension for every resident such a warden can
-- mark -> 42501 on bulkMarkAttendance. The two helpers encode two DIFFERENT
-- authority models (institution-scoped staff vs block-scoped wardens); the correct
-- rule is OR, not AND. role_has_block_access still precisely scopes a warden to
-- THEIR granted blocks (block_id is NOT NULL, app-stamped from the resident's
-- allocation), so this only enables legitimate actors the AND wrongly excluded.
-- Also: the upsert-on-conflict (re-mark) path is an UPDATE, so it needs a
-- mark-keyed UPDATE policy alongside the edit-keyed one (chief_warden has .mark,
-- not .edit). DELETE left unchanged (its key is admin-only / not in the catalog).
DROP POLICY IF EXISTS hostel_attendance_insert_permission ON public.hostel_attendance;
CREATE POLICY hostel_attendance_insert_permission ON public.hostel_attendance
    FOR INSERT TO public
    WITH CHECK (
        is_super_admin() OR is_admin()
        OR (user_has_permission('campus_living.attendance.mark')
            AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))
    );

DROP POLICY IF EXISTS hostel_attendance_update_permission ON public.hostel_attendance;
CREATE POLICY hostel_attendance_update_permission ON public.hostel_attendance
    FOR UPDATE TO public
    USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('campus_living.attendance.edit')
            AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))
    )
    WITH CHECK (
        is_super_admin() OR is_admin()
        OR (user_has_permission('campus_living.attendance.edit')
            AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))
    );

-- mark-keyed UPDATE for the upsert-on-conflict (re-mark) path
DROP POLICY IF EXISTS hostel_attendance_update_marker ON public.hostel_attendance;
CREATE POLICY hostel_attendance_update_marker ON public.hostel_attendance
    FOR UPDATE TO authenticated
    USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('campus_living.attendance.mark')
            AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))
    )
    WITH CHECK (
        is_super_admin() OR is_admin()
        OR (user_has_permission('campus_living.attendance.mark')
            AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))
    );

DROP POLICY IF EXISTS hostel_attendance_select_permission ON public.hostel_attendance;
CREATE POLICY hostel_attendance_select_permission ON public.hostel_attendance
    FOR SELECT TO public
    USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('campus_living.attendance.view')
            AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))
    );

-- hr_leave_types (migration 20260721120000_hr_leave_types_split.sql) — staff
-- leave-type catalog, split out of the shared leave_types table. Reads are
-- gated on org membership (own hr_organization_id) or the manage permission;
-- writes require the manage permission outright.
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY hlt_select ON public.hr_leave_types
  FOR SELECT TO authenticated
  USING (
    hr_organization_id IN (
      SELECT o.id FROM public.hr_organizations o
      JOIN public.staff s ON s.institution_id = o.institution_id
      WHERE s.profile_id = auth.uid()
    )
    OR public.user_has_permission('hr.leave.types.manage')
  );

CREATE POLICY hlt_write ON public.hr_leave_types
  FOR ALL TO authenticated
  USING      (public.user_has_permission('hr.leave.types.manage'))
  WITH CHECK (public.user_has_permission('hr.leave.types.manage'));

-- Updated: 2026-07-31 - hr_staff_payroll: WHO PAYS each staff member.
-- HR only. These policies are the ONLY thing keeping the paying organisation off
-- everyone else's screen, which is why the fact lives in its own table rather
-- than as a column on staff (row-level RLS cannot hide a column).
-- Gated on permission KEYS, never on role names — the sibling hr_payslips
-- policies still hardcode role_key IN ('hr_officer','hr_admin',...); that
-- pattern is deliberately not copied here.
-- Each check is wrapped in (SELECT ...) so Postgres evaluates it ONCE per query
-- instead of once per row (the variable-free-check rule behind the 57014
-- timeouts on this database).
ALTER TABLE public.hr_staff_payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_staff_payroll_select ON public.hr_staff_payroll;
CREATE POLICY hr_staff_payroll_select ON public.hr_staff_payroll
  FOR SELECT TO authenticated
  USING ((SELECT public.user_has_permission('hr.payroll.institution.view')));

DROP POLICY IF EXISTS hr_staff_payroll_write ON public.hr_staff_payroll;
CREATE POLICY hr_staff_payroll_write ON public.hr_staff_payroll
  FOR ALL TO authenticated
  USING      ((SELECT public.user_has_permission('hr.payroll.institution.manage')))
  WITH CHECK ((SELECT public.user_has_permission('hr.payroll.institution.manage')));

DROP POLICY IF EXISTS hr_staff_payroll_service_role ON public.hr_staff_payroll;
CREATE POLICY hr_staff_payroll_service_role ON public.hr_staff_payroll
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon must never see payroll data. REVOKE FROM anon (not FROM public — that
-- would also strip authenticated and service_role).
REVOKE ALL ON public.hr_staff_payroll FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_payroll TO authenticated;

-- Updated: 2026-07-24 - ID Card bridge heartbeat policies (migration
-- 20260724045622_id_card_agent_status.sql). Reads mirror
-- id_card_print_jobs_admin_view (queue viewers + admins); writes are
-- service-role only (the jobs route heartbeat).
ALTER TABLE public.id_card_agent_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "id_card_agent_status_view" ON public.id_card_agent_status;
CREATE POLICY "id_card_agent_status_view"
  ON public.id_card_agent_status FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.jobs.view')
  );

DROP POLICY IF EXISTS "id_card_agent_status_service_role_all" ON public.id_card_agent_status;
CREATE POLICY "id_card_agent_status_service_role_all"
  ON public.id_card_agent_status FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Voided receipts are staff-only. Unlike billing_receipts_select_permission
-- there is deliberately NO student self-view branch: a learner must not keep
-- seeing a receipt that no longer settles anything.
ALTER TABLE public.billing_receipts_voided ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_receipts_voided_select_permission ON public.billing_receipts_voided;
CREATE POLICY billing_receipts_voided_select_permission
  ON public.billing_receipts_voided FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('billing.receipts.view') AND role_has_institution_access(institution_id))
  );
-- No INSERT/UPDATE/DELETE policies: written only by fn_void_billing_receipt.

-- Receipt cancellation requests: SELECT-only. Every write goes through the
-- SECURITY DEFINER RPCs, so the audit trail cannot be edited by whoever it
-- incriminates.
ALTER TABLE public.billing_receipt_cancel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_receipt_cancel_request_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_receipt_cancel_requests_select ON public.billing_receipt_cancel_requests;
CREATE POLICY billing_receipt_cancel_requests_select
  ON public.billing_receipt_cancel_requests FOR SELECT
  USING (
    is_super_admin()
    OR requested_by = auth.uid()
    OR (user_has_permission('billing.receipts.view') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS billing_receipt_cancel_actions_select ON public.billing_receipt_cancel_request_actions;
CREATE POLICY billing_receipt_cancel_actions_select
  ON public.billing_receipt_cancel_request_actions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.billing_receipt_cancel_requests r
    WHERE r.id = request_id
      AND (
        is_super_admin()
        OR r.requested_by = auth.uid()
        OR (user_has_permission('billing.receipts.view') AND role_has_institution_access(r.institution_id))
      )
  ));

-- super-admin-only delete (mig 20260729_billing_delete_super_admin_only)
DROP POLICY IF EXISTS billing_receipts_delete_permission ON public.billing_receipts;
CREATE POLICY billing_receipts_delete_permission
  ON public.billing_receipts FOR DELETE
  USING (
    is_super_admin()
    OR (user_has_permission('billing.receipts.delete') AND role_has_institution_access(institution_id))
  );

-- super-admin-only delete (mig 20260729_billing_delete_super_admin_only)
DROP POLICY IF EXISTS billing_bills_delete_permission ON public.billing_student_bills;
CREATE POLICY billing_bills_delete_permission
  ON public.billing_student_bills FOR DELETE
  USING (
    is_super_admin()
    OR (user_has_permission('billing.schedule.delete') AND role_has_institution_access(institution_id))
  );

-- ============================================================================
-- 2026-08-01 — IQAC committee RLS realigned onto the GRANTABLE permission family
-- (mig 20260808210000_accreditation_committee_rls_naac_permission_family)
--
-- These eight policies checked accreditation.committees.* (no `naac` segment) —
-- keys that exist on ZERO roles and in ZERO lines of lib/constants/permissions.ts,
-- so Role Management could never grant them and only is_super_admin()/is_admin()
-- could reach the module. The UI, and the RLS on accreditation_committee_meetings
-- and accreditation_committee_resolutions, already use accreditation.naac.committees.*
-- — which IS registered and grantable. Only the key string changed; the policy
-- shape and the role_has_institution_access(institution_id) conjunct are
-- byte-identical to the live production expressions.
-- ============================================================================
ALTER POLICY "committees_select" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "committees_insert" ON public.accreditation_committees WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "committees_update" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "committees_delete" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

ALTER POLICY "members_select" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission)));
ALTER POLICY "members_insert" ON public.accreditation_committee_members WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)));
ALTER POLICY "members_update" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)));
ALTER POLICY "members_delete" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)));

-- =====================================================
-- PHYSICAL-ROOM ELIGIBILITY RULES (campus living)
-- =====================================================
-- These two tables had no entry in this reference file until 2026-08-04; the
-- block below is the full live policy set, not just the newly added policies.
--
-- Reads are open (a rule is not sensitive data); writes were originally gated on
-- hardcoded admin identity, which locked out Chief Wardens who hold
-- campus_living.settings.edit. The *_settings_edit policies added in
-- 20260804102100_campus_living_room_rule_writes_by_permission_key.sql are
-- additive and gate on that key instead. hostel_blocks RLS independently limits
-- which blocks a warden can see, so the Block picker stays scoped either way.

ALTER TABLE public.hostel_room_eligibility_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_room_eligibility_rule_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hostel_room_elig_rules_select" ON public.hostel_room_eligibility_rules;
CREATE POLICY "hostel_room_elig_rules_select" ON public.hostel_room_eligibility_rules
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "hostel_room_elig_rules_insert" ON public.hostel_room_eligibility_rules;
CREATE POLICY "hostel_room_elig_rules_insert" ON public.hostel_room_eligibility_rules
    FOR INSERT WITH CHECK ((SELECT is_super_admin()) OR (SELECT is_admin()));

DROP POLICY IF EXISTS "hostel_room_elig_rules_update" ON public.hostel_room_eligibility_rules;
CREATE POLICY "hostel_room_elig_rules_update" ON public.hostel_room_eligibility_rules
    FOR UPDATE USING ((SELECT is_super_admin()) OR (SELECT is_admin()));

DROP POLICY IF EXISTS "hostel_room_elig_rules_delete" ON public.hostel_room_eligibility_rules;
CREATE POLICY "hostel_room_elig_rules_delete" ON public.hostel_room_eligibility_rules
    FOR DELETE USING ((SELECT is_super_admin()) OR (SELECT is_admin()));

DROP POLICY IF EXISTS "hostel_room_elig_rule_rooms_select" ON public.hostel_room_eligibility_rule_rooms;
CREATE POLICY "hostel_room_elig_rule_rooms_select" ON public.hostel_room_eligibility_rule_rooms
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "hostel_room_elig_rule_rooms_insert" ON public.hostel_room_eligibility_rule_rooms;
CREATE POLICY "hostel_room_elig_rule_rooms_insert" ON public.hostel_room_eligibility_rule_rooms
    FOR INSERT WITH CHECK ((SELECT is_super_admin()) OR (SELECT is_admin()));

DROP POLICY IF EXISTS "hostel_room_elig_rule_rooms_delete" ON public.hostel_room_eligibility_rule_rooms;
CREATE POLICY "hostel_room_elig_rule_rooms_delete" ON public.hostel_room_eligibility_rule_rooms
    FOR DELETE USING ((SELECT is_super_admin()) OR (SELECT is_admin()));

-- Additive permission-key writes (2026-08-04) — see the migration for rationale.
DROP POLICY IF EXISTS "hostel_room_elig_rules_insert_settings_edit" ON public.hostel_room_eligibility_rules;
CREATE POLICY "hostel_room_elig_rules_insert_settings_edit" ON public.hostel_room_eligibility_rules
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT user_has_permission('campus_living.settings.edit')));

DROP POLICY IF EXISTS "hostel_room_elig_rules_update_settings_edit" ON public.hostel_room_eligibility_rules;
CREATE POLICY "hostel_room_elig_rules_update_settings_edit" ON public.hostel_room_eligibility_rules
    FOR UPDATE TO authenticated
    USING      ((SELECT user_has_permission('campus_living.settings.edit')))
    WITH CHECK ((SELECT user_has_permission('campus_living.settings.edit')));

DROP POLICY IF EXISTS "hostel_room_elig_rules_delete_settings_edit" ON public.hostel_room_eligibility_rules;
CREATE POLICY "hostel_room_elig_rules_delete_settings_edit" ON public.hostel_room_eligibility_rules
    FOR DELETE TO authenticated
    USING ((SELECT user_has_permission('campus_living.settings.edit')));

DROP POLICY IF EXISTS "hostel_room_elig_rule_rooms_insert_settings_edit" ON public.hostel_room_eligibility_rule_rooms;
CREATE POLICY "hostel_room_elig_rule_rooms_insert_settings_edit" ON public.hostel_room_eligibility_rule_rooms
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT user_has_permission('campus_living.settings.edit')));

DROP POLICY IF EXISTS "hostel_room_elig_rule_rooms_delete_settings_edit" ON public.hostel_room_eligibility_rule_rooms;
CREATE POLICY "hostel_room_elig_rule_rooms_delete_settings_edit" ON public.hostel_room_eligibility_rule_rooms
    FOR DELETE TO authenticated
    USING ((SELECT user_has_permission('campus_living.settings.edit')));


-- =====================================================================
-- hr_shift_timings — row level security
-- Added 2026-08-06. Source of truth:
--   supabase/migrations/20260806090000_create_hr_shift_timings.sql
--   supabase/migrations/20260806090100_hr_shift_timings_functions.sql
--   supabase/migrations/20260806090400_hr_shift_timings_save_week.sql
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- Replaced the legacy hr_shift_templates / hr_shift_assignments /
-- hr_shift_swap_requests module, dropped 2026-08-06 (all three were empty).
-- Those tables were never mirrored into supabase/setup, so there is nothing
-- to remove here.
-- =====================================================================

ALTER TABLE public.hr_shift_timings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_shift_timings_select ON public.hr_shift_timings;
CREATE POLICY hr_shift_timings_select ON public.hr_shift_timings
  FOR SELECT USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.view'))
        AND public.role_has_institution_access(institution_id))
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_shift_timings_insert ON public.hr_shift_timings;
CREATE POLICY hr_shift_timings_insert ON public.hr_shift_timings
  FOR INSERT WITH CHECK (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_shift_timings_update ON public.hr_shift_timings;
CREATE POLICY hr_shift_timings_update ON public.hr_shift_timings
  FOR UPDATE USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_shift_timings_delete ON public.hr_shift_timings;
CREATE POLICY hr_shift_timings_delete ON public.hr_shift_timings
  FOR DELETE USING (
       (SELECT public.is_super_admin())
    OR ((SELECT public.is_admin())
        AND (SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- BILLING_LATE_CHARGES TABLE (4 policies)
-- Added: 2026-08-07 (migration 20260815010000_late_charge_mechanism.sql — FILE
-- ONLY, apply is Director-gated). Platform-wide late-payment charge ledger;
-- mechanism OFF by default (billing.late_charge.enabled = false).
-- CREATE TABLE never enables RLS; do it explicitly, and close the anon door
-- Supabase's default privileges opened.
ALTER TABLE public.billing_late_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_late_charges FROM anon, PUBLIC;

-- Admin read: permission + institution scope. Learner read: her own rows only,
-- resolved the same two ways the live bills policies resolve a learner
-- (profiles.learner_id linkage OR the email join).
DROP POLICY IF EXISTS late_charges_select_scoped ON public.billing_late_charges;
CREATE POLICY late_charges_select_scoped ON public.billing_late_charges
    FOR SELECT USING (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('billing.late_charges.view')
            AND role_has_institution_access(institution_id))
        OR student_id IN (
            SELECT lp.id
            FROM learners_profiles lp
            JOIN profiles p ON p.id = auth.uid()
            WHERE lp.id = p.learner_id
               OR p.email IN (lp.student_email, lp.college_email)
        )
    );

DROP POLICY IF EXISTS late_charges_insert_admin ON public.billing_late_charges;
CREATE POLICY late_charges_insert_admin ON public.billing_late_charges
    FOR INSERT WITH CHECK (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('billing.late_charges.manage')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS late_charges_update_admin ON public.billing_late_charges;
CREATE POLICY late_charges_update_admin ON public.billing_late_charges
    FOR UPDATE USING (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('billing.late_charges.manage')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS late_charges_delete_admin ON public.billing_late_charges;
CREATE POLICY late_charges_delete_admin ON public.billing_late_charges
    FOR DELETE USING (
        is_super_admin()
        OR (user_has_permission('billing.late_charges.manage')
            AND role_has_institution_access(institution_id))
    );

-- Campus Living — Settle Then Bill (Director 2026-08-09)
-- Added: 2026-08-09 (migration 20260815060000_hostel_settle_then_bill.sql —
-- FILE ONLY, apply is Director-gated). A hostel room is NOT billed at
-- move-in: a settle window lets the room fill (5 days, restarting on each
-- joiner, capped 20 days from first open, short-circuited when the room is
-- full), then every resident is billed at the occupancy that exists at that
-- moment. A later joiner produces CREDITS, never a refund or a bill rewrite.
-- The whole mechanism is OFF by default (hostel.settle_bill.enabled = false
-- in platform_policies).

ALTER TABLE public.hostel_room_settle_windows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hostel_room_settle_windows FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.hostel_room_settle_windows TO authenticated;

DROP POLICY IF EXISTS settle_windows_select_admin ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_select_admin ON public.hostel_room_settle_windows
    FOR SELECT USING (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('campus_living.fees.view')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    );

-- A resident may read the window of the room she actually lives in — that is
-- the "why am I not billed yet / when will I be" answer, and nothing more.
-- hostel_allocations.learner_id FKs profiles(id), and profiles.id = auth.uid().
DROP POLICY IF EXISTS settle_windows_select_own_room ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_select_own_room ON public.hostel_room_settle_windows
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.hostel_allocations a
            WHERE a.room_id = hostel_room_settle_windows.room_id
              AND a.learner_id = auth.uid()
              AND a.check_out_date IS NULL
        )
    );

DROP POLICY IF EXISTS settle_windows_insert_admin ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_insert_admin ON public.hostel_room_settle_windows
    FOR INSERT WITH CHECK (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('campus_living.fees.config')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    );

-- WITH CHECK is NOT optional here. Without it the post-image is never
-- re-validated, so a tenant-scoped holder of campus_living.fees.config could
-- UPDATE a window they can see and move its room_id to another institution's
-- room — or flip status from 'billed' back to 'open' and clear the guard that
-- stops a room being billed twice.
DROP POLICY IF EXISTS settle_windows_update_admin ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_update_admin ON public.hostel_room_settle_windows
    FOR UPDATE USING (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('campus_living.fees.config')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    )
    WITH CHECK (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('campus_living.fees.config')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    );

DROP POLICY IF EXISTS settle_windows_delete_admin ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_delete_admin ON public.hostel_room_settle_windows
    FOR DELETE USING (
        is_super_admin()
        OR (user_has_permission('campus_living.fees.config')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    );

-- Updated: 2026-08-09 - Empty-bed intimation ledger (hostel_empty_bed_notices).
-- READ-ONLY policies by design. The ledger is written exclusively by the
-- service-role cron, which bypasses RLS; a row nobody can forge is the whole
-- point of the one-per-day guard, so no INSERT/UPDATE/DELETE policy is granted.
-- The anon lock and the narrow authenticated re-grant live in the migration:
-- supabase/migrations/20260815060001_empty_bed_intimation.sql (FILE ONLY, NOT APPLIED).
ALTER TABLE public.hostel_empty_bed_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_empty_bed_notices_select_admin ON public.hostel_empty_bed_notices;
CREATE POLICY hostel_empty_bed_notices_select_admin ON public.hostel_empty_bed_notices
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('campus_living.allocations.view')
    );

-- profiles.id = auth.users.id and hostel_allocations.learner_id is a profiles.id,
-- so learner_id = auth.uid() is the same self test the rest of campus living uses.
DROP POLICY IF EXISTS hostel_empty_bed_notices_select_own ON public.hostel_empty_bed_notices;
CREATE POLICY hostel_empty_bed_notices_select_own ON public.hostel_empty_bed_notices
    FOR SELECT USING (learner_id = auth.uid());

-- =====================================================
-- HR ACADEMIC YEARS (2026-08-10)
-- =====================================================
-- SELECT is open to authenticated on purpose: this is a four-row calendar with
-- no PII, and every staff member's apply-leave drawer has to resolve the
-- current year. Gating it on a key would mean granting that key to 5,000+
-- users. Writes are what needs guarding.
ALTER TABLE public.hr_academic_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_academic_years_select_authenticated ON public.hr_academic_years;
CREATE POLICY hr_academic_years_select_authenticated ON public.hr_academic_years
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS hr_academic_years_insert_manage ON public.hr_academic_years;
CREATE POLICY hr_academic_years_insert_manage ON public.hr_academic_years
    FOR INSERT TO authenticated WITH CHECK (
        (SELECT is_super_admin())
        OR (SELECT user_has_permission('hr.academic_years.manage'))
    );

DROP POLICY IF EXISTS hr_academic_years_update_manage ON public.hr_academic_years;
CREATE POLICY hr_academic_years_update_manage ON public.hr_academic_years
    FOR UPDATE TO authenticated USING (
        (SELECT is_super_admin())
        OR (SELECT user_has_permission('hr.academic_years.manage'))
    );

DROP POLICY IF EXISTS hr_academic_years_delete_manage ON public.hr_academic_years;
CREATE POLICY hr_academic_years_delete_manage ON public.hr_academic_years
    FOR DELETE TO authenticated USING (
        (SELECT is_super_admin())
        OR (SELECT user_has_permission('hr.academic_years.manage'))
    );


-- =====================================================================
-- Added: 2026-08-06 - admission_leads source/referral audit trail
-- Mirror of migration 20260818020000_admission_lead_source_audit.sql
-- (ALREADY APPLIED TO PROD 2026-08-06 via hand-run SQL).
-- Read-only to admission-lead viewers; the table is written only by the
-- SECURITY DEFINER trigger fn_audit_admission_lead_source (bypasses RLS),
-- so there is no INSERT/UPDATE/DELETE policy by design.
-- Table -> setup/01_tables.sql; fn -> setup/02_functions.sql.
-- =====================================================================
DROP POLICY IF EXISTS alsa_select ON public.admission_lead_source_audit;
CREATE POLICY alsa_select ON public.admission_lead_source_audit
FOR SELECT USING (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.view'));

-- Updated: 2026-08-10 - Referral attribution + quota audit trail
-- (referral_attribution_audit). READ-ONLY policy by design. The table is written
-- exclusively by trg_audit_learner_referral_attribution, whose SECURITY DEFINER
-- function runs as the owner; a trail a client can write to, edit or delete is
-- not evidence of anything, so no INSERT/UPDATE/DELETE policy is granted and no
-- write privilege is held. See migration
-- supabase/migrations/20260818030000_extend_referral_source_audit.sql
-- (FILE ONLY, NOT APPLIED).
--
-- Supabase default-grants ALL on every new table to anon AND authenticated, so a
-- bare GRANT SELECT is a silent no-op. Revoke both first, then grant back only
-- SELECT.
REVOKE ALL ON TABLE public.referral_attribution_audit FROM anon, PUBLIC, authenticated;
GRANT SELECT ON TABLE public.referral_attribution_audit TO authenticated;

ALTER TABLE public.referral_attribution_audit ENABLE ROW LEVEL SECURITY;

-- Read is gated on the same key that opens the leads the trail is about, so
-- nobody gains sight of referral attribution here that they could not already
-- see on the lead itself.
--
-- 🔴 Deliberately NOT institution-scoped. The table holds no institution_id (its
-- subject is a learner id and nothing else), so this is a flat permission test:
-- whoever holds admission.leads.view sees every institution's rows. That matches
-- how the admission desk already works — admission and counselor roles are
-- institution_scope='all' — but an own-scoped role granted this key in future
-- would read across colleges. Scoping it later means joining
-- learners_profiles.institution_id, which is a change to make deliberately.
DROP POLICY IF EXISTS referral_attribution_audit_select ON public.referral_attribution_audit;
CREATE POLICY referral_attribution_audit_select ON public.referral_attribution_audit
    FOR SELECT TO authenticated
    USING (
        COALESCE(public.is_super_admin(), false)
        OR COALESCE(public.is_admin(), false)
        OR COALESCE(public.user_has_permission('admission.leads.view'), false)
    );

-- Updated: 2026-08-10 - Referral integrity: reconciliation + pair scoring RLS.
-- Read is the same key that gates the page (commissions.view) so a user never
-- sees the page and is then denied its data. Writing a reconciliation is the
-- Registrar's desk (commissions.manage). Writing a pair score directly is
-- admin-only — the score is meant to be produced by the functions, not typed.
-- The anon lock lives in the migration:
-- supabase/migrations/20260818040000_referral_reconciliation_and_pair_scoring.sql
-- (FILE ONLY, NOT APPLIED).
ALTER TABLE public.referral_reconciliation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_recon_sessions_read ON public.referral_reconciliation_sessions;
CREATE POLICY referral_recon_sessions_read ON public.referral_reconciliation_sessions
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('admission.consultants.commissions.view')
    );

DROP POLICY IF EXISTS referral_recon_sessions_write ON public.referral_reconciliation_sessions;
CREATE POLICY referral_recon_sessions_write ON public.referral_reconciliation_sessions
    FOR ALL USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('admission.consultants.commissions.manage')
    )
    WITH CHECK (
        is_super_admin() OR is_admin()
        OR user_has_permission('admission.consultants.commissions.manage')
    );

ALTER TABLE public.referral_reconciliation_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_recon_claims_read ON public.referral_reconciliation_claims;
CREATE POLICY referral_recon_claims_read ON public.referral_reconciliation_claims
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('admission.consultants.commissions.view')
    );

DROP POLICY IF EXISTS referral_recon_claims_write ON public.referral_reconciliation_claims;
CREATE POLICY referral_recon_claims_write ON public.referral_reconciliation_claims
    FOR ALL USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('admission.consultants.commissions.manage')
    )
    WITH CHECK (
        is_super_admin() OR is_admin()
        OR user_has_permission('admission.consultants.commissions.manage')
    );

ALTER TABLE public.referral_pair_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_pair_scores_read ON public.referral_pair_scores;
CREATE POLICY referral_pair_scores_read ON public.referral_pair_scores
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('admission.consultants.commissions.view')
    );

DROP POLICY IF EXISTS referral_pair_scores_write ON public.referral_pair_scores;
CREATE POLICY referral_pair_scores_write ON public.referral_pair_scores
    FOR ALL USING (is_super_admin() OR is_admin())
    WITH CHECK (is_super_admin() OR is_admin());

-- =====================================================================
-- Updated: 2026-08-10 - JKKN permanent identity register
-- Migration: supabase/migrations/20260817040000_jkkn_permanent_identity_schema.sql
-- FILE ONLY / NOT APPLIED to production as of 2026-08-10.
-- =====================================================================
-- `authenticated` is revoked alongside anon deliberately. Supabase ships
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated,
-- service_role, so a new table arrives with authenticated ALREADY holding
-- DELETE; revoking only anon leaves that in place and makes the GRANT below
-- a no-op restating privileges already held. Measured on a throwaway
-- PostgreSQL 16 cluster with those default privileges replicated.
--
-- There is NO DELETE grant and NO DELETE policy on either table, on purpose:
-- deleting a row would release its number back into the pool, and a JKKN ID
-- is never reused. Withdraw an identity with retired_at + retired_reason;
-- close an alias with valid_to + is_current = false.
ALTER TABLE public.jkkn_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jkkn_identities FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.jkkn_identities TO authenticated;

DROP POLICY IF EXISTS jkkn_identities_select ON public.jkkn_identities;
CREATE POLICY jkkn_identities_select ON public.jkkn_identities
    FOR SELECT TO authenticated
    USING (
        COALESCE(is_super_admin(), false) OR is_admin()
        OR user_has_permission('users.jkkn_id.view')
    );

DROP POLICY IF EXISTS jkkn_identities_insert ON public.jkkn_identities;
CREATE POLICY jkkn_identities_insert ON public.jkkn_identities
    FOR INSERT TO authenticated
    WITH CHECK (
        COALESCE(is_super_admin(), false) OR is_admin()
        OR user_has_permission('users.jkkn_id.issue')
    );

DROP POLICY IF EXISTS jkkn_identities_update ON public.jkkn_identities;
CREATE POLICY jkkn_identities_update ON public.jkkn_identities
    FOR UPDATE TO authenticated
    USING (
        COALESCE(is_super_admin(), false) OR is_admin()
        OR user_has_permission('users.jkkn_id.issue')
    )
    WITH CHECK (
        COALESCE(is_super_admin(), false) OR is_admin()
        OR user_has_permission('users.jkkn_id.issue')
    );

ALTER TABLE public.jkkn_identity_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jkkn_identity_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.jkkn_identity_aliases TO authenticated;

DROP POLICY IF EXISTS jkkn_identity_aliases_select ON public.jkkn_identity_aliases;
CREATE POLICY jkkn_identity_aliases_select ON public.jkkn_identity_aliases
    FOR SELECT TO authenticated
    USING (
        COALESCE(is_super_admin(), false) OR is_admin()
        OR user_has_permission('users.jkkn_id.view')
    );

DROP POLICY IF EXISTS jkkn_identity_aliases_insert ON public.jkkn_identity_aliases;
CREATE POLICY jkkn_identity_aliases_insert ON public.jkkn_identity_aliases
    FOR INSERT TO authenticated
    WITH CHECK (
        COALESCE(is_super_admin(), false) OR is_admin()
        OR user_has_permission('users.jkkn_id.issue')
    );

DROP POLICY IF EXISTS jkkn_identity_aliases_update ON public.jkkn_identity_aliases;
CREATE POLICY jkkn_identity_aliases_update ON public.jkkn_identity_aliases
    FOR UPDATE TO authenticated
    USING (
        COALESCE(is_super_admin(), false) OR is_admin()
        OR user_has_permission('users.jkkn_id.issue')
    )
    WITH CHECK (
        COALESCE(is_super_admin(), false) OR is_admin()
        OR user_has_permission('users.jkkn_id.issue')
    );

-- =====================================================================
-- Added: 2026-08-11 - Derived leave entitlement (hr_leave_entitlement_overrides)
-- Mirror of migration 20260811180000_hr_leave_entitlement_overrides.sql
-- hleo_select mirrors hlb_select on hr_leave_balances verbatim. Write key
-- is hr.leave.balance.manage (the key already guarding
-- /hr/admin/leave-balances), NOT hr.leave.policies.write which guards
-- hlb_write. Setting one person's exception is balance administration.
-- =====================================================================
CREATE POLICY hleo_select ON public.hr_leave_entitlement_overrides
FOR SELECT USING (
  (SELECT public.is_super_admin())
  OR employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
  OR ((SELECT public.user_has_permission('hr.leave.approve'))
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
);

CREATE POLICY hleo_write ON public.hr_leave_entitlement_overrides
FOR ALL USING (
  (SELECT public.is_super_admin())
  OR ((SELECT public.user_has_permission('hr.leave.balance.manage'))
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
);

-- =====================================================================
-- Added: 2026-08-13 - Course Events core RLS (course_events,
-- course_packages, course_package_installments)
-- Mirror of migration 20260813100000_course_events_core.sql
-- Participant-visibility policies are ADDITIVE and are added in
-- 20260813100300 (they reference course_enrollments, which does not
-- exist yet). Until then these tables are staff-only, which is the safe
-- direction to be wrong in.
-- =====================================================================
ALTER TABLE public.course_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_packages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_package_installments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_events               FROM anon, PUBLIC;
REVOKE ALL ON public.course_packages             FROM anon, PUBLIC;
REVOKE ALL ON public.course_package_installments FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_events               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_packages             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_package_installments TO authenticated;

CREATE POLICY course_events_select ON public.course_events
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_events_insert ON public.course_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.create'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_events_update ON public.course_events
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.edit'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.edit'))
        AND public.role_has_institution_access(institution_id))
  );

-- Super admin ONLY, deliberately narrower than courses.delete. Deleting a course
-- cascades through enrollments, bills and payments (see fn_course_delete_cascade
-- in 02_functions.sql), so it is not delegated by permission key. courses.delete
-- is kept in the catalog for the audit gate and to make re-delegation a one-line
-- change here, but it no longer grants deletion.
CREATE POLICY course_events_delete ON public.course_events
  FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()));

-- Packages and installments: read follows courses.view, write follows
-- courses.packages.manage. Installments have no institution_id of their
-- own, so they inherit tenancy through their package.
CREATE POLICY course_packages_select ON public.course_packages
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_packages_manage ON public.course_packages
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_package_installments_select ON public.course_package_installments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  );

CREATE POLICY course_package_installments_manage ON public.course_package_installments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  );

-- =====================================================================
-- Added: 2026-08-13 - Course Sessions RLS
-- Mirror of migration 20260813100100_course_sessions_and_reservations.sql
-- =====================================================================
ALTER TABLE public.course_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_sessions FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_sessions TO authenticated;

CREATE POLICY course_sessions_select ON public.course_sessions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_sessions_manage ON public.course_sessions
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.sessions.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.sessions.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- =====================================================================
-- Added: 2026-08-13 - Registration form builder RLS (course_registration_forms,
-- course_registration_form_sections, course_registration_form_fields)
-- Mirror of migration 20260813100200_course_registration_forms.sql
-- anon holds nothing here — the public application page reads these
-- through a service-role API route, never through anon RLS.
-- =====================================================================
ALTER TABLE public.course_registration_forms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_registration_form_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_registration_form_fields    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_registration_forms         FROM anon, PUBLIC;
REVOKE ALL ON public.course_registration_form_sections FROM anon, PUBLIC;
REVOKE ALL ON public.course_registration_form_fields   FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_forms         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_form_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_form_fields   TO authenticated;

CREATE POLICY course_registration_forms_select ON public.course_registration_forms
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_registration_forms_manage ON public.course_registration_forms
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- Sections and fields inherit tenancy through their form.
CREATE POLICY course_reg_sections_select ON public.course_registration_form_sections
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_sections_manage ON public.course_registration_form_sections
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_fields_select ON public.course_registration_form_fields
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_fields_manage ON public.course_registration_form_fields
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

-- =====================================================================
-- Added: 2026-08-13 - Applications (screening gate) and enrollments RLS
-- (course_applications, course_enrollments)
-- Mirror of migration 20260813100300_course_applications_enrollments.sql
-- =====================================================================
ALTER TABLE public.course_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_applications FROM anon, PUBLIC;
REVOKE ALL ON public.course_enrollments  FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_enrollments  TO authenticated;

CREATE POLICY course_applications_select ON public.course_applications
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.view'))
        AND public.role_has_institution_access(institution_id))
    OR profile_id = (SELECT auth.uid())
  );

CREATE POLICY course_applications_decide ON public.course_applications
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.decide'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.decide'))
        AND public.role_has_institution_access(institution_id))
  );

-- Corrected 2026-08-18 (migration 20260818010000): the courses.view arm
-- was dropped. course_enrollments carries total_payable, total_paid,
-- balance and refundable_amount for every enrollee, and the entry-level
-- "View Courses" key exposed that money to anyone holding it — while the
-- same figures on course_bills correctly require courses.billing.view.
CREATE POLICY course_enrollments_select ON public.course_enrollments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
    OR profile_id = (SELECT auth.uid())
  );

CREATE POLICY course_enrollments_manage ON public.course_enrollments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- Additive participant visibility for the tables created earlier
-- ---------------------------------------------------------------------
-- These are SEPARATE policies, not widened admin policies. Multiple
-- PERMISSIVE policies on one command are OR'd, so adding a policy grants
-- exactly this narrow extra read and cannot loosen the admin rule.
--
-- A participant sees the course, packages, installment plan and session
-- schedule for a course they are enrolled on — and nothing else.
-- ---------------------------------------------------------------------
CREATE POLICY course_events_participant_select ON public.course_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.course_event_id = course_events.id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_packages_participant_select ON public.course_packages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.package_id = course_packages.id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_package_installments_participant_select
  ON public.course_package_installments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.package_id = course_package_installments.package_id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_sessions_participant_select ON public.course_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.course_event_id = course_sessions.course_event_id
       AND e.profile_id = (SELECT auth.uid())
  ));

-- ---------------------------------------------------------------------
-- (course_bills, course_bill_payments)
-- Mirror of migration 20260813100400_course_billing.sql
-- ---------------------------------------------------------------------
ALTER TABLE public.course_bills         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_bill_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_bills         FROM anon, PUBLIC;
REVOKE ALL ON public.course_bill_payments FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_bills         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_bill_payments TO authenticated;

CREATE POLICY course_bills_select ON public.course_bills
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.view'))
        AND public.role_has_institution_access(institution_id))
    OR EXISTS (SELECT 1 FROM public.course_enrollments e
                WHERE e.id = course_bills.enrollment_id
                  AND e.profile_id = (SELECT auth.uid()))
  );

CREATE POLICY course_bills_manage ON public.course_bills
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.manage'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_bill_payments_select ON public.course_bill_payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.view'))
        AND public.role_has_institution_access(institution_id))
    OR EXISTS (SELECT 1 FROM public.course_enrollments e
                WHERE e.id = course_bill_payments.enrollment_id
                  AND e.profile_id = (SELECT auth.uid()))
  );

CREATE POLICY course_bill_payments_manage ON public.course_bill_payments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.manage'))
        AND public.role_has_institution_access(institution_id))
  );


-- ============================================================================
-- Empty-bed settlement + room buyout (2026-08-13)
-- Source: supabase/migrations/2026081903*.sql
-- ============================================================================

ALTER TABLE public.hostel_room_buyouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY hostel_room_buyouts_select ON public.hostel_room_buyouts
  FOR SELECT TO authenticated
  USING (
    -- A current resident of the room may see her own room's buyout.
    EXISTS (
      SELECT 1 FROM public.hostel_allocations a
      WHERE a.room_id = hostel_room_buyouts.room_id
        AND a.check_out_date IS NULL
        AND a.learner_id = (SELECT auth.uid())
    )
    OR public.fn_settle_can_manage(hostel_room_buyouts.room_id, 'campus_living.fees.view')
  )

ALTER TABLE public.hostel_room_buyout_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY hostel_room_buyout_consents_select ON public.hostel_room_buyout_consents
  FOR SELECT TO authenticated
  USING (
    learner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.hostel_room_buyouts b
      JOIN public.hostel_allocations a ON a.room_id = b.room_id
      WHERE b.id = hostel_room_buyout_consents.buyout_id
        AND a.check_out_date IS NULL
        AND a.learner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.hostel_room_buyouts b
      WHERE b.id = hostel_room_buyout_consents.buyout_id
        AND public.fn_settle_can_manage(b.room_id, 'campus_living.fees.view')
    )
  )

-- ===========================================================================
-- Comp off — claimant may withdraw their own PENDING claim
-- Mirrored from supabase/migrations/20260821140000_withdraw_own_pending_comp_off_claim.sql
-- ===========================================================================
-- HR Compensatory Off — let the claimant withdraw their own PENDING claim.
--
-- THE GAP
-- -------
-- A claim is raised as status='pending' and then only HR can touch it:
--
--   hcoc_update USING (is_super_admin()
--                      OR (hr.leave.approve AND hr_organization_id IN fn_my_hr_organization_ids()))
--
-- So a member of staff who claimed the wrong worked day had no way to take it
-- back — they had to ask an approver to reject it, which records a rejection
-- against them for their own clerical slip. Leave and short time off already
-- have this: hla_update admits `employee_id IN fn_my_staff_ids()`, which is how
-- withdrawApplication() works today.
--
-- TWO CHANGES, BOTH NARROW
--
-- 1. 'withdrawn' joins the status CHECK. Not 'cancelled': leave already uses
--    withdrawn for "the applicant took it back before a decision" and cancelled
--    for "an approved one was undone afterwards". Reusing the same word for the
--    same act keeps one vocabulary across the module.
--
-- 2. An ADDITIVE policy, not an edit to hcoc_update. Policies for the same
--    command are OR'd, so widening the existing one would also loosen what an
--    approver may do. This one grants exactly: my own claim, currently pending,
--    becoming withdrawn — and nothing else. The WITH CHECK is what pins the new
--    value; USING alone would let the owner set any status they liked.
--
-- A withdrawn claim is NOT deleted. The row is the only record that the day was
-- ever claimed, and an expiring credit window is worth being able to audit.

ALTER TABLE public.hr_comp_off_credits
  DROP CONSTRAINT IF EXISTS hr_comp_off_credits_status_check;

ALTER TABLE public.hr_comp_off_credits
  ADD CONSTRAINT hr_comp_off_credits_status_check
  CHECK (status::text = ANY (ARRAY[
    'pending'::text, 'approved'::text, 'rejected'::text,
    'consumed'::text, 'withdrawn'::text
  ]));

DROP POLICY IF EXISTS hcoc_withdraw_own_pending ON public.hr_comp_off_credits;
CREATE POLICY hcoc_withdraw_own_pending ON public.hr_comp_off_credits
  FOR UPDATE
  USING (
    employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    AND status = 'pending'
  )
  WITH CHECK (
    employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    AND status = 'withdrawn'
  );

COMMENT ON POLICY hcoc_withdraw_own_pending ON public.hr_comp_off_credits IS
  'The claimant may take back their own claim while it is still pending. USING pins the old status, WITH CHECK pins the new one, so this grants withdrawal and nothing else.';

-- ============================================================================
-- 2026-08-21 — admission_fee_structure_item_schedules
-- Applied by: 20260821180000_fee_structure_item_schedules.sql
-- ============================================================================
-- NO new permission keys. The schedule is a child of a fee structure item, so
-- it inherits admission_fees.read / admission_fees.manage through the same
-- nested-EXISTS shape fee_structure_items_read/_write already use, one level
-- deeper. Those keys are already granted to 7 roles, so this ships reachable
-- rather than declaring a key no role holds.

ALTER TABLE public.admission_fee_structure_item_schedules ENABLE ROW LEVEL SECURITY;

-- Supabase default privileges hand anon (holder of the publishable key embedded
-- in every bundle) ALL on a new table.
REVOKE ALL ON TABLE public.admission_fee_structure_item_schedules FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.admission_fee_structure_item_schedules TO authenticated;
GRANT ALL ON TABLE public.admission_fee_structure_item_schedules TO service_role;

DROP POLICY IF EXISTS "fee_structure_item_schedules_read"
  ON public.admission_fee_structure_item_schedules;
CREATE POLICY "fee_structure_item_schedules_read"
ON public.admission_fee_structure_item_schedules
FOR SELECT USING (
  EXISTS (
    SELECT 1
      FROM public.admission_fee_structure_items fsi
      JOIN public.admission_fee_structures fs ON fs.id = fsi.fee_structure_id
     WHERE fsi.id = admission_fee_structure_item_schedules.fee_structure_item_id
       AND (SELECT public.user_has_permission('admission_fees.read'))
       AND public.role_has_institution_access(fs.institution_id)
  )
);

DROP POLICY IF EXISTS "fee_structure_item_schedules_write"
  ON public.admission_fee_structure_item_schedules;
CREATE POLICY "fee_structure_item_schedules_write"
ON public.admission_fee_structure_item_schedules
FOR ALL USING (
  EXISTS (
    SELECT 1
      FROM public.admission_fee_structure_items fsi
      JOIN public.admission_fee_structures fs ON fs.id = fsi.fee_structure_id
     WHERE fsi.id = admission_fee_structure_item_schedules.fee_structure_item_id
       AND (SELECT public.user_has_permission('admission_fees.manage'))
       AND public.role_has_institution_access(fs.institution_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
      FROM public.admission_fee_structure_items fsi
      JOIN public.admission_fee_structures fs ON fs.id = fsi.fee_structure_id
     WHERE fsi.id = admission_fee_structure_item_schedules.fee_structure_item_id
       AND (SELECT public.user_has_permission('admission_fees.manage'))
       AND public.role_has_institution_access(fs.institution_id)
  )
);

-- ===========================================================================
-- hr_staff_salaries (2026-08-21)
-- Source: 20260821191000_hr_staff_salaries.sql
-- ===========================================================================
-- Deliberately NOT reusing hr.payroll.institution.*: those say who may see
-- which organisation pays someone. Seeing the AMOUNT is a different decision.
ALTER TABLE public.hr_staff_salaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_staff_salaries_service_role ON public.hr_staff_salaries;
CREATE POLICY hr_staff_salaries_service_role ON public.hr_staff_salaries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS hr_staff_salaries_select ON public.hr_staff_salaries;
CREATE POLICY hr_staff_salaries_select ON public.hr_staff_salaries
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.view'))
    -- Your own salary. Reading your own pay needs no HR permission, and a
    -- payslip screen would otherwise be unbuildable for ordinary staff.
    OR staff_id IN (SELECT unnest(public.fn_my_staff_ids()))
  );

DROP POLICY IF EXISTS hr_staff_salaries_write ON public.hr_staff_salaries;
CREATE POLICY hr_staff_salaries_write ON public.hr_staff_salaries
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
  );

-- ===========================================================================
-- hr_staff_bank_accounts (2026-08-21)
-- Source: 20260821240000_hr_staff_bank_accounts.sql
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- NOTE THE DIFFERENCE FROM hr_staff_salaries: there is no "read your own row"
-- clause. The salary table has one because a payslip screen would otherwise be
-- unbuildable for ordinary staff. No such screen exists for bank accounts, and
-- opening the read path before there is something to read it widens the blast
-- radius for nothing.
ALTER TABLE public.hr_staff_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_staff_bank_accounts_service_role ON public.hr_staff_bank_accounts;
CREATE POLICY hr_staff_bank_accounts_service_role ON public.hr_staff_bank_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS hr_staff_bank_accounts_select ON public.hr_staff_bank_accounts;
CREATE POLICY hr_staff_bank_accounts_select ON public.hr_staff_bank_accounts
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.bank.view'))
  );

DROP POLICY IF EXISTS hr_staff_bank_accounts_write ON public.hr_staff_bank_accounts;
CREATE POLICY hr_staff_bank_accounts_write ON public.hr_staff_bank_accounts
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.bank.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.bank.manage'))
  );

COMMENT ON TABLE public.hr_staff_bank_accounts IS
  'Payment destination for a staff member. One current account per person, superseded rather than updated so a changed account number leaves a trail.';
COMMENT ON COLUMN public.hr_staff_bank_accounts.account_holder_name IS
  'The name AS THE BANK HOLDS IT, which often differs from the HR record. A transfer is rejected on a name mismatch.';
COMMENT ON COLUMN public.hr_staff_bank_accounts.verified_at IS
  'Somebody checked this against a passbook or cancelled cheque. A wrong account number does not error -- it pays the wrong person.';


-- ============================================================================
-- 2026-08-22 — billing_bill_instalments
-- Applied by: 20260822090000_billing_bill_instalments.sql
-- ============================================================================
-- The SELECT policy is a bare EXISTS against the parent, deliberately: bills
-- carry SEVEN policies (admin permissions, two institution-scoped paths, two
-- learner self-view linkages) and Postgres applies the parent's RLS inside this
-- subquery. Restating any of it here would create a second copy free to drift.
--
-- Writes are NOT inherited that way — a learner can SELECT their own bill and
-- must not be able to rewrite its schedule — so they gate on bill-edit rights.

ALTER TABLE public.billing_bill_instalments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_bill_instalments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_bill_instalments TO authenticated;
GRANT ALL ON TABLE public.billing_bill_instalments TO service_role;

DROP POLICY IF EXISTS "bill_instalments_select" ON public.billing_bill_instalments;
CREATE POLICY "bill_instalments_select" ON public.billing_bill_instalments
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.billing_student_bills b
           WHERE b.id = billing_bill_instalments.bill_id)
);

DROP POLICY IF EXISTS "bill_instalments_write" ON public.billing_bill_instalments;
CREATE POLICY "bill_instalments_write" ON public.billing_bill_instalments
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.billing_student_bills b
    WHERE b.id = billing_bill_instalments.bill_id
      AND ((SELECT public.is_super_admin()) OR (SELECT public.is_admin())
        OR (public.role_has_institution_access(b.institution_id)
            AND ((SELECT public.user_has_permission('billing.bills.edit'))
              OR (SELECT public.user_has_permission('billing.schedule.update')))))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.billing_student_bills b
    WHERE b.id = billing_bill_instalments.bill_id
      AND ((SELECT public.is_super_admin()) OR (SELECT public.is_admin())
        OR (public.role_has_institution_access(b.institution_id)
            AND ((SELECT public.user_has_permission('billing.bills.create'))
              OR (SELECT public.user_has_permission('billing.bills.edit'))
              OR (SELECT public.user_has_permission('billing.schedule.create'))
              OR (SELECT public.user_has_permission('billing.schedule.update')))))
  )
);

-- ===========================================================================
-- hr_attendance_periods + summaries (2026-08-22)
-- Source: 20260822010000_hr_attendance_periods_and_summaries.sql
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_attendance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_period_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_attendance_periods_service_role ON public.hr_attendance_periods;
CREATE POLICY hr_attendance_periods_service_role ON public.hr_attendance_periods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reading WHETHER a month is closed is not sensitive -- it is a fact every
-- employee needs, because it is the reason their leave form refuses. Gated on
-- the ordinary self-service attendance key rather than the manage key.
DROP POLICY IF EXISTS hr_attendance_periods_select ON public.hr_attendance_periods;
CREATE POLICY hr_attendance_periods_select ON public.hr_attendance_periods
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.view'))
    OR (SELECT public.user_has_permission('hr.attendance.view_self'))
  );

DROP POLICY IF EXISTS hr_attendance_periods_write ON public.hr_attendance_periods;
CREATE POLICY hr_attendance_periods_write ON public.hr_attendance_periods
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.manage'))
  );

DROP POLICY IF EXISTS hr_attendance_period_summaries_service_role ON public.hr_attendance_period_summaries;
CREATE POLICY hr_attendance_period_summaries_service_role ON public.hr_attendance_period_summaries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Day counts drive pay, so the read gate is the period key OR your own row.
DROP POLICY IF EXISTS hr_attendance_period_summaries_select ON public.hr_attendance_period_summaries;
CREATE POLICY hr_attendance_period_summaries_select ON public.hr_attendance_period_summaries
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.view'))
    OR staff_id IN (SELECT unnest(public.fn_my_staff_ids()))
  );

DROP POLICY IF EXISTS hr_attendance_period_summaries_write ON public.hr_attendance_period_summaries;
CREATE POLICY hr_attendance_period_summaries_write ON public.hr_attendance_period_summaries
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.attendance.period.manage'))
  );

COMMENT ON TABLE public.hr_attendance_periods IS
  'Attendance month close, per institution. Upstream of hr_payroll_periods: freeze the day counts BEFORE payroll reads them, not after distribution.';
COMMENT ON COLUMN public.hr_attendance_periods.forced IS
  'Locked while requests were still pending. Those requests were auto-rejected with a stamped reason rather than silently denied.';
COMMENT ON TABLE public.hr_attendance_period_summaries IS
  'Frozen per-staff day counts. Derived from hr_attendance_records so working days match the evaluator, not a separate calendar rule.';



-- ── Receipt cancellation approval flows (20260825160000) ──────────────────
ALTER TABLE public.billing_receipt_cancel_approval_flows ENABLE ROW LEVEL SECURITY;

-- Readable by anyone who can see the queue, so a requester can be told who
-- their request is waiting on. Writable by super admins ONLY, which is the
-- whole point: approval authority must not be delegable by whoever holds a
-- billing permission.
DROP POLICY IF EXISTS billing_receipt_cancel_flows_select ON public.billing_receipt_cancel_approval_flows;
CREATE POLICY billing_receipt_cancel_flows_select
  ON public.billing_receipt_cancel_approval_flows FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (SELECT user_has_permission('billing.receipts.view'))
    OR (SELECT user_has_permission('billing.receipts.cancel.request'))
  );

DROP POLICY IF EXISTS billing_receipt_cancel_flows_write ON public.billing_receipt_cancel_approval_flows;
CREATE POLICY billing_receipt_cancel_flows_write
  ON public.billing_receipt_cancel_approval_flows FOR ALL TO authenticated
  USING ((SELECT is_super_admin()))
  WITH CHECK ((SELECT is_super_admin()));

-- The two queue SELECTs were widened at the same time: without the
-- fn_is_receipt_cancel_approver() arm, a delegated approver opens the page
-- to an EMPTY list, because most candidate roles lack billing.receipts.view.
DROP POLICY IF EXISTS billing_receipt_cancel_requests_select ON public.billing_receipt_cancel_requests;
CREATE POLICY billing_receipt_cancel_requests_select
  ON public.billing_receipt_cancel_requests FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR requested_by = (SELECT auth.uid())
    OR ((SELECT user_has_permission('billing.receipts.view')) AND role_has_institution_access(institution_id))
    OR public.fn_is_receipt_cancel_approver(institution_id)
  );

DROP POLICY IF EXISTS billing_receipt_cancel_actions_select ON public.billing_receipt_cancel_request_actions;
CREATE POLICY billing_receipt_cancel_actions_select
  ON public.billing_receipt_cancel_request_actions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_receipt_cancel_requests r
      WHERE r.id = billing_receipt_cancel_request_actions.request_id
        AND (
          (SELECT is_super_admin())
          OR r.requested_by = (SELECT auth.uid())
          OR ((SELECT user_has_permission('billing.receipts.view')) AND role_has_institution_access(r.institution_id))
          OR public.fn_is_receipt_cancel_approver(r.institution_id)
        )
    )
  );

-- Updated: 2026-08-25 - id_card_templates scoped per institution (migration
-- 20261012000000_id_card_templates_institution_scope.sql). The table shipped in
-- 20260507150000 WITH an institution_id column and NOT ONE of its four
-- authenticated policies gated on it, so whoever held id_cards.templates.* held
-- it over every college's card design. lib/services/id-cards/template-design-client.ts
-- applies no institution filter of its own — RLS is the entire control surface,
-- and no SECURITY DEFINER function reads this table. The predicate below is the
-- canonical pattern; role_has_institution_access() is what decides whether a
-- role legitimately reaches other colleges, so cross-college reach is expressed
-- by institution_scope rather than by a missing clause.
-- ⚠️ role_has_institution_access(NULL) returns TRUE by design and
--    institution_id is nullable, so a NULL-institution template stays global.

DROP POLICY IF EXISTS "id_card_templates_view" ON public.id_card_templates;
CREATE POLICY "id_card_templates_view"
  ON public.id_card_templates FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.view'))
      AND public.role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS "id_card_templates_create" ON public.id_card_templates;
CREATE POLICY "id_card_templates_create"
  ON public.id_card_templates FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.create'))
      AND public.role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS "id_card_templates_edit" ON public.id_card_templates;
CREATE POLICY "id_card_templates_edit"
  ON public.id_card_templates FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.edit'))
      AND public.role_has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.edit'))
      AND public.role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS "id_card_templates_delete" ON public.id_card_templates;
CREATE POLICY "id_card_templates_delete"
  ON public.id_card_templates FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.delete'))
      AND public.role_has_institution_access(institution_id)
    )
  );

-- =============================================================================
-- Mirrored from supabase/migrations/20260827170000_hr_attendance_regularizations_staff_rewire.sql
-- (policies half; the employee_id->staff FK is mirrored in 01_tables.sql)
-- =============================================================================

DROP POLICY IF EXISTS hr_attendance_regs_select ON public.hr_attendance_regularizations;
CREATE POLICY hr_attendance_regs_select ON public.hr_attendance_regularizations
  FOR SELECT USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('hr.attendance.view_all'))
    OR (SELECT user_has_permission('hr.attendance.regularize_approve'))
    OR (SELECT user_has_permission('hr.attendance.approve_team'))
    OR (
      (SELECT user_has_permission('hr.attendance.regularize_self'))
      AND employee_id = ANY (COALESCE((SELECT public.fn_my_staff_ids()), ARRAY[]::uuid[]))
    )
  );

DROP POLICY IF EXISTS hr_attendance_regs_insert ON public.hr_attendance_regularizations;
CREATE POLICY hr_attendance_regs_insert ON public.hr_attendance_regularizations
  FOR INSERT WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('hr.attendance.override'))
    OR (
      (SELECT user_has_permission('hr.attendance.regularize_self'))
      AND employee_id = ANY (COALESCE((SELECT public.fn_my_staff_ids()), ARRAY[]::uuid[]))
    )
  );

-- =============================================================================
-- Mirrored from supabase/migrations/20260828120000_staff_id_standardisation_primitives.sql
-- and 20260828130000_staff_id_backfill.sql (policies and grants)
-- =============================================================================

-- Both tables are read-only to users and written only by SECURITY DEFINER code.
-- No INSERT/UPDATE/DELETE policy exists, by design.

ALTER TABLE public.staff_id_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_id_counters FROM anon;
GRANT SELECT ON public.staff_id_counters TO authenticated;

DROP POLICY IF EXISTS staff_id_counters_select_super_admin ON public.staff_id_counters;
CREATE POLICY staff_id_counters_select_super_admin
  ON public.staff_id_counters FOR SELECT TO authenticated
  USING (public.is_super_admin());

ALTER TABLE public.staff_id_crosswalk ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_id_crosswalk FROM anon;
GRANT SELECT ON public.staff_id_crosswalk TO authenticated;

DROP POLICY IF EXISTS staff_id_crosswalk_select_super_admin ON public.staff_id_crosswalk;
CREATE POLICY staff_id_crosswalk_select_super_admin
  ON public.staff_id_crosswalk FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- =============================================================================
-- Mirrored from supabase/migrations/20260828140000_staff_address_standardisation.sql
-- =============================================================================

ALTER TABLE public.staff_address_backfill_20260828 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_address_backfill_20260828 FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.staff_address_backfill_20260828 TO authenticated;

DROP POLICY IF EXISTS staff_address_backfill_select_super_admin ON public.staff_address_backfill_20260828;
CREATE POLICY staff_address_backfill_select_super_admin
  ON public.staff_address_backfill_20260828 FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- =============================================================================
-- Mirrored from supabase/migrations/20260830150000_hr_salary_register.sql
-- =============================================================================

-- Salary register. Gated on its OWN key pair, not a reuse of the salary/bank
-- ones: a register is the single screen showing amount AND destination AND day
-- counts for everybody at once, which is a wider grant than any of the three.
-- Granted to HR Head alone — the only role already holding all four keys a run
-- reads through (payroll.institution.view, payroll.salary.view,
-- payroll.bank.view, attendance.period.view). A role missing any of them would
-- produce a run that SILENTLY omits people: RLS returns zero rows, no error.
--
-- Unlike hr_staff_salaries these also scope on role_has_institution_access — a
-- register is inherently a per-institution document. HR Head is
-- institution_scope='all' so it passes everywhere; a future 'own'-scoped
-- payroll role is correctly confined.
--
-- Every helper call is wrapped in (SELECT ...) so Postgres evaluates it once as
-- an InitPlan rather than per row — the unwrapped form is what produced 57014
-- statement timeouts elsewhere in this schema.
--
-- No self-read policy, deliberately: there is no employee-facing payslip screen
-- yet, and a register row exposes colleagues' context alongside your own.
ALTER TABLE public.hr_salary_register_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_register_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_salary_register_runs_select
  ON public.hr_salary_register_runs FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.view'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  );

CREATE POLICY hr_salary_register_runs_write
  ON public.hr_salary_register_runs FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.payroll.register.manage'))
      AND (SELECT public.role_has_institution_access(institution_id))
    )
  );

CREATE POLICY hr_salary_register_runs_service_role
  ON public.hr_salary_register_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Lines inherit the parent's verdict via EXISTS rather than a duplicated
-- predicate, so the two cannot drift apart.
CREATE POLICY hr_salary_register_lines_select
  ON public.hr_salary_register_lines FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.view'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  );

CREATE POLICY hr_salary_register_lines_write
  ON public.hr_salary_register_lines FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.manage'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs r
       WHERE r.id = hr_salary_register_lines.run_id
         AND (SELECT public.user_has_permission('hr.payroll.register.manage'))
         AND (SELECT public.role_has_institution_access(r.institution_id))
    )
  );

CREATE POLICY hr_salary_register_lines_service_role
  ON public.hr_salary_register_lines FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- REVOKE FROM anon, not FROM public: revoking from public also strips what
-- authenticated inherits through it.
REVOKE ALL ON public.hr_salary_register_runs  FROM anon;
REVOKE ALL ON public.hr_salary_register_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_salary_register_runs  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_salary_register_lines TO authenticated;

-- ============================================================================
-- billing_bill_cancellations (mig 20260901010000). SELECT-only, and ONE
-- permissive policy rather than several ORed together: multiple permissive
-- policies are all evaluated per candidate row. No UPDATE/DELETE policy --
-- every write goes through fn_cancel_student_bill.
-- ============================================================================
DROP POLICY IF EXISTS billing_bill_cancellations_select ON public.billing_bill_cancellations;
CREATE POLICY billing_bill_cancellations_select
  ON public.billing_bill_cancellations FOR SELECT
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (
      role_has_institution_access(institution_id)
      AND (
        (SELECT user_has_permission('billing.schedule.view'))
        OR (SELECT user_has_permission('billing.bills.view'))
      )
    )
  );

-- ===========================================================================
-- hr_tds_slabs (2026-09-02)
--
-- READ IS DELIBERATELY WIDER THAN WRITE. The register RESOLVES these bands
-- while generating, under the generating user's own session -- and a slab read
-- emptied by RLS is indistinguishable from 'no bands configured', which
-- silently produces a register with no tax on it. Anyone who can see a salary
-- or a register can read the bands; only salary.manage edits them.
-- ===========================================================================
ALTER TABLE public.hr_tds_slabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_tds_slabs_select ON public.hr_tds_slabs
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.view'))
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
    OR (SELECT public.user_has_permission('hr.payroll.register.view'))
    OR (SELECT public.user_has_permission('hr.payroll.register.manage'))
  );

CREATE POLICY hr_tds_slabs_write ON public.hr_tds_slabs
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
  );

CREATE POLICY hr_tds_slabs_service_role ON public.hr_tds_slabs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_tds_slabs TO authenticated;
GRANT ALL ON public.hr_tds_slabs TO service_role;


-- ── Event feedback forms (coordinator-editable questions per event) ──
-- Migration: supabase/migrations/event_feedback_forms.sql
-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.event_feedback_forms     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_feedback_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_feedback_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_feedback_responses ENABLE ROW LEVEL SECURITY;

-- Table privileges, restated explicitly.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon,
-- authenticated, service_role, so these four tables arrive with ANON already
-- holding INSERT and DELETE. Every policy below is `TO authenticated`, so RLS
-- denies anon today regardless — a role with no matching policy is refused.
-- But that safety is one permissive policy away from evaporating, and a
-- feedback table is exactly where a `USING (true)` gets added by someone
-- wiring up a public link later. Revoke the grant rather than rely on the
-- absence of a policy.
--
-- `authenticated` is revoked alongside anon deliberately: it also arrives
-- holding DELETE from those default privileges, so revoking only anon would
-- leave that in place and make the GRANT below a no-op restating privileges
-- already held.
REVOKE ALL ON public.event_feedback_forms     FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.event_feedback_sections  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.event_feedback_questions FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.event_feedback_responses FROM anon, authenticated, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_feedback_forms     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_feedback_sections  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_feedback_questions TO authenticated;
-- Responses: no UPDATE/DELETE restriction at the GRANT level because both are
-- needed — a respondent corrects their own row, a manager moderates one — and
-- the policies above are what separate those two cases.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_feedback_responses TO authenticated;

-- Read: a manager, or a registered participant of the event (who needs the
-- questions in order to answer them). Note this is NOT the registration
-- builder's `visibility IN ('public','all_jkkn')` clause — a feedback form is
-- never anonymous-readable, because only registrants may answer it.
DROP POLICY IF EXISTS "event_feedback_forms_select" ON public.event_feedback_forms;
CREATE POLICY "event_feedback_forms_select" ON public.event_feedback_forms
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
  );

DROP POLICY IF EXISTS "event_feedback_forms_manage" ON public.event_feedback_forms;
CREATE POLICY "event_feedback_forms_manage" ON public.event_feedback_forms
  FOR ALL TO authenticated
  USING (public.fn_can_manage_event_feedback(event_id))
  WITH CHECK (public.fn_can_manage_event_feedback(event_id));

DROP POLICY IF EXISTS "event_feedback_sections_select" ON public.event_feedback_sections;
CREATE POLICY "event_feedback_sections_select" ON public.event_feedback_sections
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
  );

DROP POLICY IF EXISTS "event_feedback_sections_manage" ON public.event_feedback_sections;
CREATE POLICY "event_feedback_sections_manage" ON public.event_feedback_sections
  FOR ALL TO authenticated
  USING (public.fn_can_manage_event_feedback(event_id))
  WITH CHECK (public.fn_can_manage_event_feedback(event_id));

DROP POLICY IF EXISTS "event_feedback_questions_select" ON public.event_feedback_questions;
CREATE POLICY "event_feedback_questions_select" ON public.event_feedback_questions
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR public.fn_my_event_registration(event_id) IS NOT NULL
  );

DROP POLICY IF EXISTS "event_feedback_questions_manage" ON public.event_feedback_questions;
CREATE POLICY "event_feedback_questions_manage" ON public.event_feedback_questions
  FOR ALL TO authenticated
  USING (public.fn_can_manage_event_feedback(event_id))
  WITH CHECK (public.fn_can_manage_event_feedback(event_id));

-- Responses. A participant may read and write ONLY their own row, and only for
-- the registration that is actually theirs — checking registration_id against
-- fn_my_event_registration() rather than trusting the id the client sent is
-- what stops one registrant from answering as another. Managers read every
-- response but never write one: feedback is not editable by the people it is
-- about.
DROP POLICY IF EXISTS "event_feedback_responses_select" ON public.event_feedback_responses;
CREATE POLICY "event_feedback_responses_select" ON public.event_feedback_responses
  FOR SELECT TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
    OR registration_id = public.fn_my_event_registration(event_id)
  );

-- The window is enforced HERE, not only in the UI: a closed form must refuse
-- answers even when the write arrives straight at PostgREST.
DROP POLICY IF EXISTS "event_feedback_responses_insert" ON public.event_feedback_responses;
CREATE POLICY "event_feedback_responses_insert" ON public.event_feedback_responses
  FOR INSERT TO authenticated WITH CHECK (
    registration_id = public.fn_my_event_registration(event_id)
    AND public.fn_event_feedback_form_open(form_id)
  );

-- Update is the respondent's own correction, and only while the form is still
-- open — reopening the edit door after a survey closes would let someone revise
-- an answer the coordinator has already reported on. Deliberately no manager
-- branch either way: feedback is not editable by the people it is about.
DROP POLICY IF EXISTS "event_feedback_responses_update" ON public.event_feedback_responses;
CREATE POLICY "event_feedback_responses_update" ON public.event_feedback_responses
  FOR UPDATE TO authenticated
  USING (
    registration_id = public.fn_my_event_registration(event_id)
    AND public.fn_event_feedback_form_open(form_id)
  )
  WITH CHECK (
    registration_id = public.fn_my_event_registration(event_id)
    AND public.fn_event_feedback_form_open(form_id)
  );

-- Only a manager may delete a response (moderating abuse). A respondent
-- withdrawing their feedback would silently distort the counts.
DROP POLICY IF EXISTS "event_feedback_responses_delete" ON public.event_feedback_responses;
CREATE POLICY "event_feedback_responses_delete" ON public.event_feedback_responses
  FOR DELETE TO authenticated USING (
    public.fn_can_manage_event_feedback(event_id)
  );


-- =====================================================================
-- hr_work_patterns, hr_staff_work_pattern_assignments,
-- hr_work_pattern_leave_entitlements (2026-09-04)
-- Source: 20260904120000_hr_work_patterns.sql
-- =====================================================================

DROP POLICY IF EXISTS hr_work_patterns_select ON public.hr_work_patterns;
CREATE POLICY hr_work_patterns_select ON public.hr_work_patterns
  FOR SELECT USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (((SELECT public.user_has_permission('hr.shift_timings.view'))
         OR (SELECT public.user_has_permission('hr.shift_timings.manage')))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_work_patterns_write ON public.hr_work_patterns;
CREATE POLICY hr_work_patterns_write ON public.hr_work_patterns
  FOR ALL USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  ) WITH CHECK (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- Assignments: HR reads by institution; a staff member reads their own row.
-- Writes are the RPC's job (SECURITY DEFINER, so it is not subject to this);
-- a direct write is left to super admins only.
DROP POLICY IF EXISTS hr_swpa_select ON public.hr_staff_work_pattern_assignments;
CREATE POLICY hr_swpa_select ON public.hr_staff_work_pattern_assignments
  FOR SELECT USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (((SELECT public.user_has_permission('hr.shift_timings.view'))
         OR (SELECT public.user_has_permission('hr.shift_timings.manage')))
        AND public.role_has_institution_access(institution_id))
    OR staff_id = ANY (public.fn_my_staff_ids())
  );

DROP POLICY IF EXISTS hr_swpa_write ON public.hr_staff_work_pattern_assignments;
CREATE POLICY hr_swpa_write ON public.hr_staff_work_pattern_assignments
  FOR ALL USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS hr_wple_select ON public.hr_work_pattern_leave_entitlements;
CREATE POLICY hr_wple_select ON public.hr_work_pattern_leave_entitlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.hr_work_patterns p
       WHERE p.id = work_pattern_id
         AND (   (SELECT public.is_super_admin())
              OR (SELECT public.is_admin())
              OR (((SELECT public.user_has_permission('hr.shift_timings.view'))
                   OR (SELECT public.user_has_permission('hr.shift_timings.manage')))
                  AND public.role_has_institution_access(p.institution_id)))
    )
  );

DROP POLICY IF EXISTS hr_wple_write ON public.hr_work_pattern_leave_entitlements;
CREATE POLICY hr_wple_write ON public.hr_work_pattern_leave_entitlements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.hr_work_patterns p
       WHERE p.id = work_pattern_id
         AND (   (SELECT public.is_super_admin())
              OR (SELECT public.is_admin())
              OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
                  AND public.role_has_institution_access(p.institution_id)))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_work_patterns p
       WHERE p.id = work_pattern_id
         AND (   (SELECT public.is_super_admin())
              OR (SELECT public.is_admin())
              OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
                  AND public.role_has_institution_access(p.institution_id)))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_work_patterns                    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_work_pattern_assignments   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_work_pattern_leave_entitlements  TO authenticated;
GRANT ALL ON public.hr_work_patterns                   TO service_role;
GRANT ALL ON public.hr_staff_work_pattern_assignments  TO service_role;
GRANT ALL ON public.hr_work_pattern_leave_entitlements TO service_role;

-- Updated: 2026-08-21 - AIU evidence trail policies
-- (migration 20260922041500_aiu_prompt_trails.sql — FILE ONLY / NOT APPLIED).
-- Learner reads/inserts/updates ONLY their own rows; admin read for AIU
-- marking; deliberately NO DELETE policy (and no DELETE grant).
ALTER TABLE public.aiu_prompt_trails ENABLE ROW LEVEL SECURITY;

CREATE POLICY aiu_trails_select ON public.aiu_prompt_trails
  FOR SELECT TO authenticated
  USING (
    learner_id = (SELECT auth.uid())
    OR is_super_admin()
    OR is_admin()
  )

CREATE POLICY aiu_trails_insert_own ON public.aiu_prompt_trails
  FOR INSERT TO authenticated
  WITH CHECK (learner_id = (SELECT auth.uid()))

CREATE POLICY aiu_trails_update_own ON public.aiu_prompt_trails
  FOR UPDATE TO authenticated
  USING (learner_id = (SELECT auth.uid()))
  WITH CHECK (learner_id = (SELECT auth.uid()))

-- cl_girls_bc_reconcile_log — read-only evidence table. No INSERT/UPDATE/DELETE
-- policy exists on purpose: only the migrations that own it write to it, as
-- table owner, and nothing in the app should be able to rewrite the record of
-- what a data migration did.
CREATE POLICY cl_girls_bc_reconcile_log_read
  ON public.cl_girls_bc_reconcile_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_has_permission('campus_living.upgrades.manage')
  )
