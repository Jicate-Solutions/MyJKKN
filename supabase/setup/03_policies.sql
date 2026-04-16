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

CREATE POLICY "institutions_select_admission_role" ON institutions
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('organizations.institutions.view')
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

-- DEGREES TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
-- Updated: 2026-03-05 - Added admission role policy
ALTER TABLE degrees ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "degrees_select_admission_role" ON degrees
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
        OR user_has_permission('organizations.degrees.view')
    );

CREATE POLICY "degrees_select_optimized" ON degrees
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "degrees_insert_by_role" ON degrees
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.degrees.create'))
    );

CREATE POLICY "degrees_update_by_role" ON degrees
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.degrees.edit'))
    );

CREATE POLICY "degrees_delete_by_role" ON degrees
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.degrees.delete'))
    );

-- DEPARTMENTS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
-- Updated: 2026-03-05 - Added admission role policy
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "departments_select_admission_role" ON departments
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
        OR user_has_permission('organizations.departments.view')
    );

CREATE POLICY "departments_select_optimized" ON departments
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "departments_insert_by_role" ON departments
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.departments.create'))
    );

CREATE POLICY "departments_update_by_role" ON departments
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.departments.edit'))
    );

CREATE POLICY "departments_delete_by_role" ON departments
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.departments.delete'))
    );

-- PROGRAMS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
-- Updated: 2026-03-05 - Added admission role policy
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "programs_select_admission_role" ON programs
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
        OR user_has_permission('organizations.programs.view')
    );

CREATE POLICY "programs_select_optimized" ON programs
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "programs_insert_by_role" ON programs
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.programs.create'))
    );

CREATE POLICY "programs_update_by_role" ON programs
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.programs.edit'))
    );

CREATE POLICY "programs_delete_by_role" ON programs
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.programs.delete'))
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
ALTER TABLE intake_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_history_select_policy" ON intake_history
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "intake_history_insert_policy" ON intake_history
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "intake_history_update_policy" ON intake_history
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "intake_history_delete_policy" ON intake_history
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
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
CREATE POLICY "student_attendance_select_own_student" ON student_attendance
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM profiles p
            JOIN learners_profiles lp ON p.learner_id = lp.id
            WHERE p.id = auth.uid()
            AND p.role = 'student'
            AND lp.section_id = student_attendance.section_id
            AND lp.lifecycle_status IN ('active', 'graduated')
        )
    );

-- ================================================================================
-- SECTION 8: TIMETABLE MODULE TABLES
-- ================================================================================

-- TIMETABLES TABLE (5 policies)
-- Updated: 2025-12-15 - Optimized SELECT policy using security definer functions
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "timetables_select_optimized" ON timetables
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR institution_id = get_current_user_institution_id()
    );

CREATE POLICY "timetables_insert_admin" ON timetables
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academics.timetables.create'))
    );

CREATE POLICY "timetables_update_admin" ON timetables
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academics.timetables.edit'))
    );

CREATE POLICY "timetables_delete_admin" ON timetables
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('academics.timetables.delete'))
    );

CREATE POLICY "timetables_select_active" ON timetables
    FOR SELECT USING (is_active = true);

-- ================================================================================
-- SECTION 9: BILLING MODULE TABLES
-- ================================================================================

-- BILLING_STUDENT_BILLS TABLE (8 policies)
ALTER TABLE billing_student_bills ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-04-13 - Migrated to dynamic permission-based policies
CREATE POLICY "bills_select_institution" ON billing_student_bills
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.bills.view'))
    );

CREATE POLICY "bills_insert_admin" ON billing_student_bills
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.bills.create'))
    );

CREATE POLICY "bills_update_admin" ON billing_student_bills
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.bills.edit'))
    );

CREATE POLICY "bills_delete_admin" ON billing_student_bills
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.bills.delete'))
    );

CREATE POLICY "bills_select_student" ON billing_student_bills
    FOR SELECT USING (
        student_id IN (
            SELECT id FROM students
            WHERE email = (SELECT email FROM profiles WHERE id = auth.uid())
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

-- BILLING CATEGORIES (4 policies)
-- Updated: 2026-04-15 - Consolidated 3-tier (parent/sub/item) hierarchy into flat billing_categories.
ALTER TABLE billing_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_categories_select" ON billing_categories
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('billing.categories.view')
            AND role_has_institution_access(institution_id))
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

CREATE POLICY "Approvers can view pending requests"
    ON service_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_request_approval_steps sras
            WHERE sras.service_type_id = service_requests.service_type_id
            AND sras.step_order = service_requests.current_approval_step
            AND sras.approver_role = get_my_role()
        )
    );

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

-- Authenticated users can create events for their institution
CREATE POLICY "events_auth_insert" ON public.events
  FOR INSERT TO authenticated WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Authenticated users can update their institution's events
CREATE POLICY "events_auth_update" ON public.events
  FOR UPDATE TO authenticated USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Authenticated users can delete their institution's events
CREATE POLICY "events_auth_delete" ON public.events
  FOR DELETE TO authenticated USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
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

CREATE POLICY "hr_recruitment_candidates_delete_permission"
  ON public.hr_recruitment_candidates FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.delete')
  );

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
