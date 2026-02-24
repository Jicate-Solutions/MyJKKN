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

-- UPDATE policy - prevents infinite recursion
CREATE POLICY "profiles_update_policy" ON profiles
    FOR UPDATE USING (
        -- Users can update their own profile
        id = auth.uid()
        OR
        -- Users with staff management permission can update profiles
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

-- DELETE policy - prevents infinite recursion
CREATE POLICY "profiles_delete_policy" ON profiles
    FOR DELETE USING (
        -- Only super_admin and admin can delete, or users with permission
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        (
            can_user_manage_staff() = true
            AND
            institution_id = get_current_user_institution_id()
            AND
            id != auth.uid()  -- Cannot delete own profile
        )
    );

-- USERS TABLE (1 policy)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_all_authenticated" ON users
    FOR ALL USING (auth.uid() IS NOT NULL);

-- ================================================================================
-- SECTION 2: INSTITUTION & ACCESS TABLES
-- ================================================================================

-- INSTITUTIONS TABLE (4 policies)
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "institutions_select_all" ON institutions
    FOR SELECT USING (true);

CREATE POLICY "institutions_insert_super_admin" ON institutions
    FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "institutions_update_admin" ON institutions
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('organizations.institutions.edit')
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
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

-- Optimized SELECT policy using security definer function
CREATE POLICY "academic_years_select_optimized" ON academic_years
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        institution_id = get_current_user_institution_id()
    );

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

-- DEGREES TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
ALTER TABLE degrees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "degrees_select_optimized" ON degrees
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        institution_id = get_current_user_institution_id()
    );

CREATE POLICY "degrees_insert_by_role" ON degrees
    FOR INSERT WITH CHECK (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

CREATE POLICY "degrees_update_by_role" ON degrees
    FOR UPDATE USING (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

CREATE POLICY "degrees_delete_by_role" ON degrees
    FOR DELETE USING (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

-- DEPARTMENTS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_optimized" ON departments
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        institution_id = get_current_user_institution_id()
    );

CREATE POLICY "departments_insert_by_role" ON departments
    FOR INSERT WITH CHECK (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

CREATE POLICY "departments_update_by_role" ON departments
    FOR UPDATE USING (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

CREATE POLICY "departments_delete_by_role" ON departments
    FOR DELETE USING (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

-- PROGRAMS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "programs_select_optimized" ON programs
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        institution_id = get_current_user_institution_id()
    );

CREATE POLICY "programs_insert_by_role" ON programs
    FOR INSERT WITH CHECK (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

CREATE POLICY "programs_update_by_role" ON programs
    FOR UPDATE USING (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

CREATE POLICY "programs_delete_by_role" ON programs
    FOR DELETE USING (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

-- SEMESTERS TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to use security definer functions
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "semesters_select_optimized" ON semesters
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        institution_id = get_current_user_institution_id()
    );

CREATE POLICY "semesters_insert_by_role" ON semesters
    FOR INSERT WITH CHECK (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

CREATE POLICY "semesters_update_by_role" ON semesters
    FOR UPDATE USING (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

CREATE POLICY "semesters_delete_by_role" ON semesters
    FOR DELETE USING (
        get_current_user_role() IN ('super_admin', 'admin')
        AND institution_id = get_current_user_institution_id()
    );

-- SECTIONS TABLE (4 policies)
-- Updated: 2025-12-15 - Optimized SELECT policy using security definer functions
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- Optimized SELECT policy - prevents performance issues with profiles RLS
CREATE POLICY "sections_select_optimized" ON sections
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        institution_id = get_current_user_institution_id()
    );

CREATE POLICY "sections_insert_admin" ON sections
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('organizations.sections.create')
    );

CREATE POLICY "sections_update_admin" ON sections
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('organizations.sections.edit')
    );

CREATE POLICY "sections_delete_admin" ON sections
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('organizations.sections.delete')
    );

-- COURSES TABLE (4 policies)
-- Updated: 2025-12-15 - Optimized SELECT policy using security definer functions
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Optimized SELECT policy - prevents performance issues with profiles RLS
CREATE POLICY "courses_select_optimized" ON courses
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        institution_id = get_current_user_institution_id()
    );

-- Updated: 2025-12-27 - Added support for custom role permissions
CREATE POLICY "courses_insert_admin" ON courses
    FOR INSERT WITH CHECK (
        -- Check institution access from profiles table
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND
        -- Custom role permission check
        user_has_permission('organizations.courses.create')
    );

-- Updated: 2025-12-27 - Added support for custom role permissions
CREATE POLICY "courses_update_admin" ON courses
    FOR UPDATE USING (
        -- Check institution access from profiles table
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND
        -- Custom role permission check
        user_has_permission('organizations.courses.edit')
    );

-- Updated: 2025-12-27 - Added support for custom role permissions
CREATE POLICY "courses_delete_admin" ON courses
    FOR DELETE USING (
        -- Check institution access from profiles table
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND
        -- Custom role permission check
        user_has_permission('organizations.courses.delete')
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

-- Optimized SELECT policy for staff_plans
CREATE POLICY "staff_plans_select_optimized" ON staff_plans
    FOR SELECT USING (
        -- Super admin and admin can see all
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
        OR
        -- Other users can see staff plans in their institution
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "staff_plans_insert_by_role" ON staff_plans
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR
                (cr.permissions->>'academic.staff.planning.edit')::boolean = true
            )
        )
        AND institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "staff_plans_update_by_role" ON staff_plans
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR
                (cr.permissions->>'academic.staff.planning.edit')::boolean = true
            )
        )
        AND institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "staff_plans_delete_by_role" ON staff_plans
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR
                (cr.permissions->>'academic.staff.planning.delete')::boolean = true
            )
        )
        AND institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

-- STAFF_PLAN_COURSES TABLE (Optimized policies)
-- Updated: 2025-12-15 - Changed to role-based permissions with security definer function
-- Uses get_user_staff_plan_access() function for better performance
ALTER TABLE staff_plan_courses ENABLE ROW LEVEL SECURITY;

-- Optimized SELECT policy using security definer function
CREATE POLICY "staff_plan_courses_select_optimized" ON staff_plan_courses
    FOR SELECT USING (
        -- Super admin and admin can see all
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
        OR
        -- Other users can see courses for staff plans in their institution
        staff_plan_id IN (SELECT staff_plan_id FROM get_user_staff_plan_access())
    );

CREATE POLICY "staff_plan_courses_insert_by_role" ON staff_plan_courses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR
                (cr.permissions->>'academic.staff.planning.edit')::boolean = true
            )
        )
        AND staff_plan_id IN (SELECT staff_plan_id FROM get_user_staff_plan_access())
    );

CREATE POLICY "staff_plan_courses_update_by_role" ON staff_plan_courses
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR
                (cr.permissions->>'academic.staff.planning.edit')::boolean = true
            )
        )
        AND staff_plan_id IN (SELECT staff_plan_id FROM get_user_staff_plan_access())
    );

CREATE POLICY "staff_plan_courses_delete_by_role" ON staff_plan_courses
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR
                (cr.permissions->>'academic.staff.planning.delete')::boolean = true
            )
        )
        AND staff_plan_id IN (SELECT staff_plan_id FROM get_user_staff_plan_access())
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

-- Optimized SELECT policy - prevents performance issues with profiles RLS
CREATE POLICY "timetables_select_optimized" ON timetables
    FOR SELECT USING (
        get_current_user_role() IN ('super_admin', 'admin')
        OR
        institution_id = get_current_user_institution_id()
    );

CREATE POLICY "timetables_insert_admin" ON timetables
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academics.timetables.create')
    );

CREATE POLICY "timetables_update_admin" ON timetables
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academics.timetables.edit')
    );

CREATE POLICY "timetables_delete_admin" ON timetables
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academics.timetables.delete')
    );

CREATE POLICY "timetables_select_active" ON timetables
    FOR SELECT USING (is_active = true);

-- ================================================================================
-- SECTION 9: BILLING MODULE TABLES
-- ================================================================================

-- BILLING_STUDENT_BILLS TABLE (8 policies)
ALTER TABLE billing_student_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bills_select_institution" ON billing_student_bills
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "bills_insert_admin" ON billing_student_bills
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "bills_update_admin" ON billing_student_bills
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "bills_delete_admin" ON billing_student_bills
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
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

CREATE POLICY "receipts_select_institution" ON billing_receipts
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "receipts_insert_admin" ON billing_receipts
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "receipts_update_admin" ON billing_receipts
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "receipts_delete_admin" ON billing_receipts
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
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

CREATE POLICY "invoices_select_institution" ON billing_invoices
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "invoices_insert_admin" ON billing_invoices
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "invoices_update_admin" ON billing_invoices
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "invoices_delete_admin" ON billing_invoices
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
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

CREATE POLICY "receipt_items_all_billing" ON billing_receipt_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM billing_receipts br
            WHERE br.id = billing_receipt_items.receipt_id
            AND br.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
                AND access_type IN ('admin', 'write', 'billing', 'read')
                AND is_active = true
            )
        )
    );

-- BILLING_INVOICE_ITEMS TABLE (1 policy)
ALTER TABLE billing_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items_all_billing" ON billing_invoice_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM billing_invoices bi
            WHERE bi.id = billing_invoice_items.invoice_id
            AND bi.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
                AND access_type IN ('admin', 'write', 'billing', 'read')
                AND is_active = true
            )
        )
    );

-- BILLING_DISCOUNTS TABLE (1 policy)
ALTER TABLE billing_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discounts_all_billing" ON billing_discounts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM billing_student_bills bsb
            WHERE bsb.id = billing_discounts.bill_id
            AND bsb.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
                AND access_type IN ('admin', 'write', 'billing')
                AND is_active = true
            )
        )
    );

-- BILLING_REFUNDS TABLE (1 policy)
ALTER TABLE billing_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refunds_all_billing" ON billing_refunds
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM billing_receipts br
            WHERE br.id = billing_refunds.receipt_id
            AND br.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
                AND access_type IN ('admin', 'write', 'billing')
                AND is_active = true
            )
        )
    );

-- BILLING CATEGORY TABLES (4 policies each)
ALTER TABLE billing_parent_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parent_categories_select" ON billing_parent_categories
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "parent_categories_insert" ON billing_parent_categories
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "parent_categories_update" ON billing_parent_categories
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "parent_categories_delete" ON billing_parent_categories
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

ALTER TABLE billing_sub_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_categories_select" ON billing_sub_categories
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "sub_categories_insert" ON billing_sub_categories
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "sub_categories_update" ON billing_sub_categories
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "sub_categories_delete" ON billing_sub_categories
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

ALTER TABLE billing_item_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_categories_select" ON billing_item_categories
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "item_categories_insert" ON billing_item_categories
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "item_categories_update" ON billing_item_categories
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'billing')
            AND is_active = true
        )
    );

CREATE POLICY "item_categories_delete" ON billing_item_categories
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
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

-- Service Types: All authenticated users can view active types
CREATE POLICY "Authenticated users can view active service types"
    ON service_types FOR SELECT
    USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Super admin can manage service types"
    ON service_types FOR ALL
    USING (get_current_user_role() = 'super_admin')
    WITH CHECK (get_current_user_role() = 'super_admin');

CREATE POLICY "Authenticated users can view service type fields"
    ON service_type_fields FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admin can manage service type fields"
    ON service_type_fields FOR ALL
    USING (get_current_user_role() = 'super_admin')
    WITH CHECK (get_current_user_role() = 'super_admin');

CREATE POLICY "Authenticated users can view approval steps"
    ON service_request_approval_steps FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admin can manage approval steps"
    ON service_request_approval_steps FOR ALL
    USING (get_current_user_role() = 'super_admin')
    WITH CHECK (get_current_user_role() = 'super_admin');

CREATE POLICY "Users can view own service requests"
    ON service_requests FOR SELECT
    USING (requester_id = auth.uid());

CREATE POLICY "Admins can view all service requests"
    ON service_requests FOR SELECT
    USING (
        get_current_user_role() IN ('super_admin', 'administrator')
        OR user_has_permission('service_requests.view_all')
    );

CREATE POLICY "Approvers can view pending requests"
    ON service_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_request_approval_steps sras
            WHERE sras.service_type_id = service_requests.service_type_id
            AND sras.step_order = service_requests.current_approval_step
            AND sras.approver_role = get_current_user_role()
        )
    );

CREATE POLICY "Users can create service requests"
    ON service_requests FOR INSERT
    WITH CHECK (requester_id = auth.uid());

-- Updated: 2026-02-24 - Added WITH CHECK so status transitions (draft/returned → submitted/cancelled)
-- are permitted. Without an explicit WITH CHECK, Postgres reuses the USING expression on the
-- *new* row, which blocks submit (status becomes 'submitted') and cancel (status becomes 'cancelled').
-- USING checks the existing row; WITH CHECK checks the row *after* the update.
CREATE POLICY "Users can update own service requests"
    ON service_requests FOR UPDATE
    USING (requester_id = auth.uid() AND status IN ('draft', 'returned', 'submitted'))
    WITH CHECK (requester_id = auth.uid() AND status IN ('draft', 'returned', 'submitted', 'cancelled'));

CREATE POLICY "Approvers can update request status"
    ON service_requests FOR UPDATE
    USING (
        get_current_user_role() IN ('super_admin', 'administrator')
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
                    OR get_current_user_role() IN ('super_admin', 'administrator'))
            )
        )
    );

CREATE POLICY "System can create approval records"
    ON service_request_approvals FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Approvers can update their approvals"
    ON service_request_approvals FOR UPDATE
    USING (approver_id = auth.uid() OR get_current_user_role() IN ('super_admin', 'administrator'));

CREATE POLICY "Users can view timeline for own requests"
    ON service_request_timeline FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_requests sr
            WHERE sr.id = service_request_timeline.service_request_id
            AND (
                sr.requester_id = auth.uid()
                OR get_current_user_role() IN ('super_admin', 'administrator')
                OR user_has_permission('service_requests.approve')
            )
        )
        AND (
            is_internal = false
            OR get_current_user_role() IN ('super_admin', 'administrator')
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
                OR get_current_user_role() IN ('super_admin', 'administrator')
                OR user_has_permission('service_requests.approve'))
        )
    );

CREATE POLICY "Users can upload attachments to own requests"
    ON service_request_attachments FOR INSERT
    WITH CHECK (uploaded_by = auth.uid());
