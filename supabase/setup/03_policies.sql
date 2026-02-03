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
        )
        AND institution_id = get_current_user_institution_id()
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
        )
        AND institution_id = get_current_user_institution_id()
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
        )
        AND institution_id = get_current_user_institution_id()
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

-- =================================
-- COMPETENCY CATALOG MODULE POLICIES
-- Created: 2026-02-01 - Workshop Transformation Phase 1.2
-- =================================

-- competency_catalog policies
CREATE POLICY "competency_catalog_select" ON public.competency_catalog
    FOR SELECT TO authenticated
    USING (
        institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "competency_catalog_insert" ON public.competency_catalog
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
            AND (institution_id = competency_catalog.institution_id OR is_super_admin = true)
        )
    );

CREATE POLICY "competency_catalog_update" ON public.competency_catalog
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'super_admin'))
    );

CREATE POLICY "competency_catalog_delete" ON public.competency_catalog
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- competency_program_mapping policies
CREATE POLICY "competency_program_mapping_select" ON public.competency_program_mapping
    FOR SELECT TO authenticated
    USING (
        competency_id IN (
            SELECT id FROM public.competency_catalog
            WHERE institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "competency_program_mapping_insert" ON public.competency_program_mapping
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'super_admin')));

CREATE POLICY "competency_program_mapping_update" ON public.competency_program_mapping
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin'))
    );

CREATE POLICY "competency_program_mapping_delete" ON public.competency_program_mapping
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- course_competency_mapping policies
CREATE POLICY "course_competency_mapping_select" ON public.course_competency_mapping
    FOR SELECT TO authenticated
    USING (
        competency_id IN (
            SELECT id FROM public.competency_catalog
            WHERE institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "course_competency_mapping_insert" ON public.course_competency_mapping
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')));

CREATE POLICY "course_competency_mapping_update" ON public.course_competency_mapping
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff'))
    );

CREATE POLICY "course_competency_mapping_delete" ON public.course_competency_mapping
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- learner_competencies policies
CREATE POLICY "learner_competencies_select" ON public.learner_competencies
    FOR SELECT TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff', 'super_admin'))
    );

CREATE POLICY "learner_competencies_insert" ON public.learner_competencies
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')));

CREATE POLICY "learner_competencies_update" ON public.learner_competencies
    FOR UPDATE TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff', 'super_admin'))
    );

CREATE POLICY "learner_competencies_delete" ON public.learner_competencies
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- =================================
-- INDUSTRY INTEGRATION MODULE POLICIES
-- Created: 2026-02-01 - Workshop Transformation Phase 2.1
-- =================================

-- industry_partners policies
CREATE POLICY "industry_partners_select" ON public.industry_partners
    FOR SELECT TO authenticated
    USING (
        institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "industry_partners_insert" ON public.industry_partners
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
            AND (institution_id = industry_partners.institution_id OR is_super_admin = true)
        )
    );

CREATE POLICY "industry_partners_update" ON public.industry_partners
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'super_admin'))
    );

CREATE POLICY "industry_partners_delete" ON public.industry_partners
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- industry_mentors policies
CREATE POLICY "industry_mentors_select" ON public.industry_mentors
    FOR SELECT TO authenticated
    USING (
        institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "industry_mentors_insert" ON public.industry_mentors
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'super_admin')));

CREATE POLICY "industry_mentors_update" ON public.industry_mentors
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin'))
    );

CREATE POLICY "industry_mentors_delete" ON public.industry_mentors
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- industry_projects policies
CREATE POLICY "industry_projects_select" ON public.industry_projects
    FOR SELECT TO authenticated
    USING (
        institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "industry_projects_insert" ON public.industry_projects
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')));

CREATE POLICY "industry_projects_update" ON public.industry_projects
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff'))
    );

CREATE POLICY "industry_projects_delete" ON public.industry_projects
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- learner_industry_engagements policies
CREATE POLICY "learner_engagements_select" ON public.learner_industry_engagements
    FOR SELECT TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff', 'super_admin'))
    );

CREATE POLICY "learner_engagements_insert" ON public.learner_industry_engagements
    FOR INSERT TO authenticated
    WITH CHECK (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff', 'super_admin'))
    );

CREATE POLICY "learner_engagements_update" ON public.learner_industry_engagements
    FOR UPDATE TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff', 'super_admin'))
    );

CREATE POLICY "learner_engagements_delete" ON public.learner_industry_engagements
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ================================================================================
-- SECTION 14: PERSONALIZATION MODULE (Workshop Transformation Phase 3)
-- Added: 2026-02-01
-- Tables: learning_paths, learning_path_steps, parent_portal_access, parent_communications
-- ================================================================================

-- learning_paths policies
CREATE POLICY "learning_paths_select" ON public.learning_paths
    FOR SELECT TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_paths_insert" ON public.learning_paths
    FOR INSERT TO authenticated
    WITH CHECK (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_paths_update" ON public.learning_paths
    FOR UPDATE TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_paths_delete" ON public.learning_paths
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- learning_path_steps policies
CREATE POLICY "learning_path_steps_select" ON public.learning_path_steps
    FOR SELECT TO authenticated
    USING (
        path_id IN (
            SELECT lp.id FROM public.learning_paths lp
            WHERE lp.learner_id IN (
                SELECT lpr.id FROM public.learners_profiles lpr
                JOIN public.profiles p ON LOWER(p.email) = LOWER(lpr.student_email)
                WHERE p.id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_path_steps_insert" ON public.learning_path_steps
    FOR INSERT TO authenticated
    WITH CHECK (
        path_id IN (
            SELECT lp.id FROM public.learning_paths lp
            WHERE lp.learner_id IN (
                SELECT lpr.id FROM public.learners_profiles lpr
                JOIN public.profiles p ON LOWER(p.email) = LOWER(lpr.student_email)
                WHERE p.id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_path_steps_update" ON public.learning_path_steps
    FOR UPDATE TO authenticated
    USING (
        path_id IN (
            SELECT lp.id FROM public.learning_paths lp
            WHERE lp.learner_id IN (
                SELECT lpr.id FROM public.learners_profiles lpr
                JOIN public.profiles p ON LOWER(p.email) = LOWER(lpr.student_email)
                WHERE p.id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_path_steps_delete" ON public.learning_path_steps
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- parent_portal_access policies
CREATE POLICY "parent_portal_access_select" ON public.parent_portal_access
    FOR SELECT TO authenticated
    USING (
        parent_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "parent_portal_access_insert" ON public.parent_portal_access
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "parent_portal_access_update" ON public.parent_portal_access
    FOR UPDATE TO authenticated
    USING (
        parent_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "parent_portal_access_delete" ON public.parent_portal_access
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- parent_communications policies
CREATE POLICY "parent_communications_select" ON public.parent_communications
    FOR SELECT TO authenticated
    USING (
        parent_access_id IN (
            SELECT id FROM public.parent_portal_access WHERE parent_user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "parent_communications_insert" ON public.parent_communications
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "parent_communications_update" ON public.parent_communications
    FOR UPDATE TO authenticated
    USING (
        parent_access_id IN (
            SELECT id FROM public.parent_portal_access WHERE parent_user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "parent_communications_delete" ON public.parent_communications
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ================================================================================
-- SECTION 15: ACCOUNTABILITY MODULE (Workshop Transformation Phase 4)
-- Added: 2026-02-01
-- Tables: alumni_outcomes, outcome_program_correlation, facilitator_development, facilitator_industry_immersion
-- ================================================================================

-- alumni_outcomes policies
CREATE POLICY "alumni_outcomes_select" ON public.alumni_outcomes
    FOR SELECT TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "alumni_outcomes_insert" ON public.alumni_outcomes
    FOR INSERT TO authenticated
    WITH CHECK (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "alumni_outcomes_update" ON public.alumni_outcomes
    FOR UPDATE TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "alumni_outcomes_delete" ON public.alumni_outcomes
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- outcome_program_correlation policies
CREATE POLICY "outcome_correlation_select" ON public.outcome_program_correlation
    FOR SELECT TO authenticated
    USING (
        is_published = true
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "outcome_correlation_insert" ON public.outcome_program_correlation
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "outcome_correlation_update" ON public.outcome_program_correlation
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "outcome_correlation_delete" ON public.outcome_program_correlation
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- facilitator_development policies
CREATE POLICY "facilitator_dev_select" ON public.facilitator_development
    FOR SELECT TO authenticated
    USING (
        staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_dev_insert" ON public.facilitator_development
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_dev_update" ON public.facilitator_development
    FOR UPDATE TO authenticated
    USING (
        staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_dev_delete" ON public.facilitator_development
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- facilitator_industry_immersion policies
CREATE POLICY "facilitator_immersion_select" ON public.facilitator_industry_immersion
    FOR SELECT TO authenticated
    USING (
        is_public = true
        OR staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_immersion_insert" ON public.facilitator_industry_immersion
    FOR INSERT TO authenticated
    WITH CHECK (
        staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_immersion_update" ON public.facilitator_industry_immersion
    FOR UPDATE TO authenticated
    USING (
        staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_immersion_delete" ON public.facilitator_industry_immersion
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ================================================================================
-- SECTION 16: SOLUTIONS HUB MODULE (sh_ tables)
-- Added: 2026-02-03 - Complete RLS for Solutions Hub integration
-- Tables: 30+ tables with sh_ prefix
-- Roles: super_admin, admin, jicate_staff, hod, staff, builder, cohort_member, production_learner, client
-- ================================================================================

-- ================================================================================
-- SOLUTIONS HUB HELPER FUNCTIONS
-- Purpose: Role detection and access control for Solutions Hub
-- ================================================================================

-- sh_is_admin: Check if user is super_admin, admin, or jicate_staff
-- Used by: All admin-level policies
CREATE OR REPLACE FUNCTION public.sh_is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'jicate_staff')
    );
END;
$$;

-- sh_is_jicate_staff: Check if user is JICATE staff specifically
CREATE OR REPLACE FUNCTION public.sh_is_jicate_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role = 'jicate_staff'
    );
END;
$$;

-- sh_is_hod: Check if user is HOD
CREATE OR REPLACE FUNCTION public.sh_is_hod()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role = 'hod'
    );
END;
$$;

-- sh_is_staff: Check if user is department staff (includes HOD)
CREATE OR REPLACE FUNCTION public.sh_is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('hod', 'staff', 'institution_admin')
    );
END;
$$;

-- sh_user_department_id: Get the user's department ID from profiles
CREATE OR REPLACE FUNCTION public.sh_user_department_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN (
        SELECT department_id
        FROM public.profiles
        WHERE id = auth.uid()
    );
END;
$$;

-- sh_user_institution_id: Get the user's institution ID from profiles
CREATE OR REPLACE FUNCTION public.sh_user_institution_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN (
        SELECT institution_id
        FROM public.profiles
        WHERE id = auth.uid()
    );
END;
$$;

-- sh_is_builder: Check if user is an active builder
CREATE OR REPLACE FUNCTION public.sh_is_builder()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.sh_builders
        WHERE user_id = auth.uid()
        AND is_active = true
    );
END;
$$;

-- sh_get_builder_id: Get the builder ID for current user
CREATE OR REPLACE FUNCTION public.sh_get_builder_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN (
        SELECT id
        FROM public.sh_builders
        WHERE user_id = auth.uid()
        AND is_active = true
        LIMIT 1
    );
END;
$$;

-- sh_is_cohort_member: Check if user is an active cohort member
CREATE OR REPLACE FUNCTION public.sh_is_cohort_member()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.sh_cohort_members
        WHERE user_id = auth.uid()
        AND is_active = true
    );
END;
$$;

-- sh_get_cohort_member_id: Get the cohort member ID for current user
CREATE OR REPLACE FUNCTION public.sh_get_cohort_member_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN (
        SELECT id
        FROM public.sh_cohort_members
        WHERE user_id = auth.uid()
        AND is_active = true
        LIMIT 1
    );
END;
$$;

-- sh_is_production_learner: Check if user is an active production learner
CREATE OR REPLACE FUNCTION public.sh_is_production_learner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.sh_production_learners
        WHERE user_id = auth.uid()
        AND is_active = true
    );
END;
$$;

-- sh_get_production_learner_id: Get the production learner ID for current user
CREATE OR REPLACE FUNCTION public.sh_get_production_learner_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN (
        SELECT id
        FROM public.sh_production_learners
        WHERE user_id = auth.uid()
        AND is_active = true
        LIMIT 1
    );
END;
$$;

-- sh_is_client: Check if user is a client
CREATE OR REPLACE FUNCTION public.sh_is_client()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role = 'client'
    );
END;
$$;

-- sh_get_client_id: Get the client ID for current user (by matching email)
CREATE OR REPLACE FUNCTION public.sh_get_client_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN (
        SELECT c.id
        FROM public.sh_clients c
        JOIN public.profiles p ON LOWER(p.email) = LOWER(c.contact_email)
        WHERE p.id = auth.uid()
        AND c.is_active = true
        LIMIT 1
    );
END;
$$;

-- sh_can_access_solution: Check if user can access a specific solution
-- Used for fine-grained access control
CREATE OR REPLACE FUNCTION public.sh_can_access_solution(solution_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_client_id UUID;
    v_lead_dept_id UUID;
BEGIN
    -- Admins can access all
    IF sh_is_admin() THEN
        RETURN true;
    END IF;

    -- Get solution details
    SELECT client_id, lead_department_id INTO v_client_id, v_lead_dept_id
    FROM public.sh_solutions
    WHERE id = solution_id;

    -- HOD/Staff can access if it's their department
    IF (sh_is_hod() OR sh_is_staff()) AND v_lead_dept_id = sh_user_department_id() THEN
        RETURN true;
    END IF;

    -- Clients can access their own solutions
    IF sh_is_client() AND v_client_id = sh_get_client_id() THEN
        RETURN true;
    END IF;

    -- Builders can access if assigned to any phase
    IF sh_is_builder() THEN
        RETURN EXISTS (
            SELECT 1 FROM public.sh_builder_assignments ba
            JOIN public.sh_solution_phases sp ON ba.phase_id = sp.id
            WHERE sp.solution_id = solution_id
            AND ba.builder_id = sh_get_builder_id()
        );
    END IF;

    RETURN false;
END;
$$;

-- ================================================================================
-- SH_CLIENTS TABLE POLICIES
-- External companies/organizations that receive solutions
-- Access: Admin full, HOD/Staff department scope, Clients own data only
-- ================================================================================

ALTER TABLE public.sh_clients ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin sees all, HOD/Staff sees their sourced clients, Clients see own profile
CREATE POLICY "sh_clients_select" ON public.sh_clients
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND source_department_id = sh_user_department_id())
        OR (sh_is_staff() AND source_department_id = sh_user_department_id())
        OR (sh_is_client() AND id = sh_get_client_id())
        -- Builders/Cohort/Production can see clients of solutions they're assigned to
        OR (sh_is_builder() AND id IN (
            SELECT DISTINCT s.client_id FROM public.sh_solutions s
            JOIN public.sh_solution_phases sp ON sp.solution_id = s.id
            JOIN public.sh_builder_assignments ba ON ba.phase_id = sp.id
            WHERE ba.builder_id = sh_get_builder_id()
        ))
    );

-- INSERT: Admin and HOD/Staff can create clients
CREATE POLICY "sh_clients_insert" ON public.sh_clients
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
    );

-- UPDATE: Admin can update all, HOD/Staff can update their sourced clients
CREATE POLICY "sh_clients_update" ON public.sh_clients
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND source_department_id = sh_user_department_id())
        OR created_by = auth.uid()
    );

-- DELETE: Admin only (soft delete preferred)
CREATE POLICY "sh_clients_delete" ON public.sh_clients
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_SOLUTIONS TABLE POLICIES
-- Main solutions tracking (software, training, content)
-- Access: Admin full, HOD/Staff department scope, Clients own solutions, Talent assigned
-- ================================================================================

ALTER TABLE public.sh_solutions ENABLE ROW LEVEL SECURITY;

-- SELECT: Multiple access patterns
CREATE POLICY "sh_solutions_select" ON public.sh_solutions
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND lead_department_id = sh_user_department_id())
        OR (sh_is_staff() AND lead_department_id = sh_user_department_id())
        OR (sh_is_client() AND client_id = sh_get_client_id())
        -- Builders see solutions they're assigned to
        OR (sh_is_builder() AND id IN (
            SELECT sp.solution_id FROM public.sh_solution_phases sp
            JOIN public.sh_builder_assignments ba ON ba.phase_id = sp.id
            WHERE ba.builder_id = sh_get_builder_id()
        ))
        -- Cohort members see solutions with their training programs
        OR (sh_is_cohort_member() AND id IN (
            SELECT tp.solution_id FROM public.sh_training_programs tp
            JOIN public.sh_training_sessions ts ON ts.program_id = tp.id
            JOIN public.sh_cohort_assignments ca ON ca.session_id = ts.id
            WHERE ca.cohort_member_id = sh_get_cohort_member_id()
        ))
        -- Production learners see solutions with their content orders
        OR (sh_is_production_learner() AND id IN (
            SELECT co.solution_id FROM public.sh_content_orders co
            JOIN public.sh_content_deliverables cd ON cd.order_id = co.id
            JOIN public.sh_production_assignments pa ON pa.deliverable_id = cd.id
            WHERE pa.learner_id = sh_get_production_learner_id()
        ))
    );

-- INSERT: Admin and HOD/Staff can create solutions
CREATE POLICY "sh_solutions_insert" ON public.sh_solutions
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
    );

-- UPDATE: Admin can update all, HOD/Staff can update their department's solutions
CREATE POLICY "sh_solutions_update" ON public.sh_solutions
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND lead_department_id = sh_user_department_id())
        OR created_by = auth.uid()
    );

-- DELETE: Admin only
CREATE POLICY "sh_solutions_delete" ON public.sh_solutions
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_SOLUTION_PHASES TABLE POLICIES
-- Phases within solutions (for software projects)
-- Access: Follows solution access + phase owner
-- ================================================================================

ALTER TABLE public.sh_solution_phases ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, department scope, builders assigned to phase
CREATE POLICY "sh_solution_phases_select" ON public.sh_solution_phases
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR owner_department_id = sh_user_department_id()
        -- Builders assigned to this phase
        OR (sh_is_builder() AND id IN (
            SELECT phase_id FROM public.sh_builder_assignments
            WHERE builder_id = sh_get_builder_id()
        ))
        -- Clients see phases of their solutions
        OR (sh_is_client() AND solution_id IN (
            SELECT id FROM public.sh_solutions WHERE client_id = sh_get_client_id()
        ))
        -- Staff can see phases of solutions in their department
        OR ((sh_is_hod() OR sh_is_staff()) AND solution_id IN (
            SELECT id FROM public.sh_solutions WHERE lead_department_id = sh_user_department_id()
        ))
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_solution_phases_insert" ON public.sh_solution_phases
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
    );

-- UPDATE: Admin, owner department
CREATE POLICY "sh_solution_phases_update" ON public.sh_solution_phases
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR owner_department_id = sh_user_department_id()
    );

-- DELETE: Admin only
CREATE POLICY "sh_solution_phases_delete" ON public.sh_solution_phases
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_SOLUTION_MOUS TABLE POLICIES
-- MOU documents for solutions
-- Access: Admin, HOD only (sensitive financial data)
-- ================================================================================

ALTER TABLE public.sh_solution_mous ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin and HOD only
CREATE POLICY "sh_solution_mous_select" ON public.sh_solution_mous
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND solution_id IN (
            SELECT id FROM public.sh_solutions WHERE lead_department_id = sh_user_department_id()
        ))
    );

-- INSERT: Admin and HOD
CREATE POLICY "sh_solution_mous_insert" ON public.sh_solution_mous
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod());

-- UPDATE: Admin and creator
CREATE POLICY "sh_solution_mous_update" ON public.sh_solution_mous
    FOR UPDATE TO authenticated
    USING (sh_is_admin());

-- DELETE: Admin only
CREATE POLICY "sh_solution_mous_delete" ON public.sh_solution_mous
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_BUILDERS TABLE POLICIES
-- Software builder talent pool
-- Access: Admin full, HOD department scope, Builders own profile
-- ================================================================================

ALTER TABLE public.sh_builders ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin sees all, HOD sees department builders, Builders see own
CREATE POLICY "sh_builders_select" ON public.sh_builders
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND department_id = sh_user_department_id())
        OR (sh_is_staff() AND department_id = sh_user_department_id())
        OR user_id = auth.uid()
        -- Other builders on same assignment can see each other
        OR (sh_is_builder() AND id IN (
            SELECT DISTINCT ba2.builder_id
            FROM public.sh_builder_assignments ba1
            JOIN public.sh_builder_assignments ba2 ON ba1.phase_id = ba2.phase_id
            WHERE ba1.builder_id = sh_get_builder_id()
        ))
    );

-- INSERT: Admin and HOD
CREATE POLICY "sh_builders_insert" ON public.sh_builders
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod());

-- UPDATE: Admin, HOD, or builder updating own profile
CREATE POLICY "sh_builders_update" ON public.sh_builders
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND department_id = sh_user_department_id())
        OR user_id = auth.uid()
    );

-- DELETE: Admin only
CREATE POLICY "sh_builders_delete" ON public.sh_builders
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_BUILDER_SKILLS TABLE POLICIES
-- Builder technical skills
-- Access: Follows builder access
-- ================================================================================

ALTER TABLE public.sh_builder_skills ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, department scope, or own skills
CREATE POLICY "sh_builder_skills_select" ON public.sh_builder_skills
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR builder_id IN (
            SELECT id FROM public.sh_builders
            WHERE department_id = sh_user_department_id()
        )
        OR builder_id = sh_get_builder_id()
    );

-- INSERT: Admin, HOD, or builder adding own skills
CREATE POLICY "sh_builder_skills_insert" ON public.sh_builder_skills
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_hod()
        OR builder_id = sh_get_builder_id()
    );

-- UPDATE: Admin, HOD, or builder updating own skills
CREATE POLICY "sh_builder_skills_update" ON public.sh_builder_skills
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR builder_id = sh_get_builder_id()
    );

-- DELETE: Admin, HOD, or builder deleting own skills
CREATE POLICY "sh_builder_skills_delete" ON public.sh_builder_skills
    FOR DELETE TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR builder_id = sh_get_builder_id()
    );

-- ================================================================================
-- SH_BUILDER_ASSIGNMENTS TABLE POLICIES
-- Builder assignments to solution phases
-- Access: Admin full, HOD approve, Builders see own assignments
-- ================================================================================

ALTER TABLE public.sh_builder_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, builder sees own, staff sees department
CREATE POLICY "sh_builder_assignments_select" ON public.sh_builder_assignments
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR builder_id = sh_get_builder_id()
        OR (sh_is_hod() AND phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        ))
        OR (sh_is_staff() AND phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        ))
    );

-- INSERT: Admin, HOD, or builder requesting assignment
CREATE POLICY "sh_builder_assignments_insert" ON public.sh_builder_assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_hod()
        OR (sh_is_builder() AND builder_id = sh_get_builder_id())
    );

-- UPDATE: Admin, HOD (for approval), or builder (for status updates)
CREATE POLICY "sh_builder_assignments_update" ON public.sh_builder_assignments
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        ))
        OR (sh_is_builder() AND builder_id = sh_get_builder_id())
    );

-- DELETE: Admin only
CREATE POLICY "sh_builder_assignments_delete" ON public.sh_builder_assignments
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_PROTOTYPE_ITERATIONS TABLE POLICIES
-- Prototype versions for software phases
-- Access: Follows phase access
-- ================================================================================

ALTER TABLE public.sh_prototype_iterations ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, department, builders, clients
CREATE POLICY "sh_prototype_iterations_select" ON public.sh_prototype_iterations
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        )
        OR phase_id IN (
            SELECT phase_id FROM public.sh_builder_assignments WHERE builder_id = sh_get_builder_id()
        )
        -- Clients can see iterations of their solutions
        OR (sh_is_client() AND phase_id IN (
            SELECT sp.id FROM public.sh_solution_phases sp
            JOIN public.sh_solutions s ON sp.solution_id = s.id
            WHERE s.client_id = sh_get_client_id()
        ))
    );

-- INSERT: Admin, HOD, Staff, Builders
CREATE POLICY "sh_prototype_iterations_insert" ON public.sh_prototype_iterations
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        OR (sh_is_builder() AND phase_id IN (
            SELECT phase_id FROM public.sh_builder_assignments WHERE builder_id = sh_get_builder_id()
        ))
    );

-- UPDATE: Admin, department, or assigned builders
CREATE POLICY "sh_prototype_iterations_update" ON public.sh_prototype_iterations
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        )
        OR phase_id IN (
            SELECT phase_id FROM public.sh_builder_assignments WHERE builder_id = sh_get_builder_id()
        )
    );

-- DELETE: Admin only
CREATE POLICY "sh_prototype_iterations_delete" ON public.sh_prototype_iterations
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_BUG_REPORTS TABLE POLICIES
-- Bug reports on prototype iterations
-- Access: Wide read (for transparency), restricted write
-- ================================================================================

ALTER TABLE public.sh_bug_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: Anyone with access to the iteration
CREATE POLICY "sh_bug_reports_select" ON public.sh_bug_reports
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR iteration_id IN (
            SELECT id FROM public.sh_prototype_iterations pi
            JOIN public.sh_solution_phases sp ON pi.phase_id = sp.id
            WHERE sp.owner_department_id = sh_user_department_id()
        )
        OR iteration_id IN (
            SELECT pi.id FROM public.sh_prototype_iterations pi
            JOIN public.sh_builder_assignments ba ON ba.phase_id = pi.phase_id
            WHERE ba.builder_id = sh_get_builder_id()
        )
        -- Clients can see bugs on their iterations
        OR (sh_is_client() AND iteration_id IN (
            SELECT pi.id FROM public.sh_prototype_iterations pi
            JOIN public.sh_solution_phases sp ON pi.phase_id = sp.id
            JOIN public.sh_solutions s ON sp.solution_id = s.id
            WHERE s.client_id = sh_get_client_id()
        ))
        OR reported_by = auth.uid()
    );

-- INSERT: Anyone with access to the iteration can report bugs
CREATE POLICY "sh_bug_reports_insert" ON public.sh_bug_reports
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        OR sh_is_builder()
        OR sh_is_client()
    );

-- UPDATE: Admin, department staff, or reporter
CREATE POLICY "sh_bug_reports_update" ON public.sh_bug_reports
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR reported_by = auth.uid()
        OR iteration_id IN (
            SELECT id FROM public.sh_prototype_iterations pi
            JOIN public.sh_solution_phases sp ON pi.phase_id = sp.id
            WHERE sp.owner_department_id = sh_user_department_id()
        )
    );

-- DELETE: Admin only
CREATE POLICY "sh_bug_reports_delete" ON public.sh_bug_reports
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_PHASE_DEPLOYMENTS TABLE POLICIES
-- Deployment records for phases
-- Access: Admin, HOD, Staff only (sensitive infrastructure data)
-- ================================================================================

ALTER TABLE public.sh_phase_deployments ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, Staff
CREATE POLICY "sh_phase_deployments_select" ON public.sh_phase_deployments
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        ))
        OR (sh_is_staff() AND phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        ))
    );

-- INSERT: Admin and HOD only
CREATE POLICY "sh_phase_deployments_insert" ON public.sh_phase_deployments
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod());

-- UPDATE: Admin only
CREATE POLICY "sh_phase_deployments_update" ON public.sh_phase_deployments
    FOR UPDATE TO authenticated
    USING (sh_is_admin());

-- DELETE: Admin only
CREATE POLICY "sh_phase_deployments_delete" ON public.sh_phase_deployments
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_IMPLEMENTATION_USERS TABLE POLICIES
-- End-users trained on implemented solutions
-- Access: Follows phase access
-- ================================================================================

ALTER TABLE public.sh_implementation_users ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, department, clients
CREATE POLICY "sh_implementation_users_select" ON public.sh_implementation_users
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        )
        OR (sh_is_client() AND phase_id IN (
            SELECT sp.id FROM public.sh_solution_phases sp
            JOIN public.sh_solutions s ON sp.solution_id = s.id
            WHERE s.client_id = sh_get_client_id()
        ))
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_implementation_users_insert" ON public.sh_implementation_users
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, department
CREATE POLICY "sh_implementation_users_update" ON public.sh_implementation_users
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR phase_id IN (
            SELECT id FROM public.sh_solution_phases WHERE owner_department_id = sh_user_department_id()
        )
    );

-- DELETE: Admin only
CREATE POLICY "sh_implementation_users_delete" ON public.sh_implementation_users
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_TRAINING_PROGRAMS TABLE POLICIES
-- Training programs for solutions
-- Access: Admin full, HOD/Staff scope, Cohort members see assigned
-- ================================================================================

ALTER TABLE public.sh_training_programs ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, staff, cohort members (if assigned)
CREATE POLICY "sh_training_programs_select" ON public.sh_training_programs
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        -- Cohort members see programs they're involved in
        OR (sh_is_cohort_member() AND id IN (
            SELECT tp.id FROM public.sh_training_programs tp
            JOIN public.sh_training_sessions ts ON ts.program_id = tp.id
            JOIN public.sh_cohort_assignments ca ON ca.session_id = ts.id
            WHERE ca.cohort_member_id = sh_get_cohort_member_id()
        ))
        -- Clients see programs for their solutions
        OR (sh_is_client() AND solution_id IN (
            SELECT id FROM public.sh_solutions WHERE client_id = sh_get_client_id()
        ))
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_training_programs_insert" ON public.sh_training_programs
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, HOD, Staff
CREATE POLICY "sh_training_programs_update" ON public.sh_training_programs
    FOR UPDATE TO authenticated
    USING (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- DELETE: Admin only
CREATE POLICY "sh_training_programs_delete" ON public.sh_training_programs
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_TRAINING_SESSIONS TABLE POLICIES
-- Individual training sessions
-- Access: Admin full, Staff scope, Cohort members see assigned
-- ================================================================================

ALTER TABLE public.sh_training_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, staff, cohort members
CREATE POLICY "sh_training_sessions_select" ON public.sh_training_sessions
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        -- Cohort members see their sessions
        OR (sh_is_cohort_member() AND id IN (
            SELECT session_id FROM public.sh_cohort_assignments
            WHERE cohort_member_id = sh_get_cohort_member_id()
        ))
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_training_sessions_insert" ON public.sh_training_sessions
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, HOD, Staff
CREATE POLICY "sh_training_sessions_update" ON public.sh_training_sessions
    FOR UPDATE TO authenticated
    USING (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- DELETE: Admin only
CREATE POLICY "sh_training_sessions_delete" ON public.sh_training_sessions
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_COHORT_MEMBERS TABLE POLICIES
-- Training cohort member profiles
-- Access: Admin full, HOD department scope, Members own profile
-- ================================================================================

ALTER TABLE public.sh_cohort_members ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, staff, or own profile
CREATE POLICY "sh_cohort_members_select" ON public.sh_cohort_members
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND department_id = sh_user_department_id())
        OR (sh_is_staff() AND department_id = sh_user_department_id())
        OR user_id = auth.uid()
        -- Other cohort members in same session
        OR (sh_is_cohort_member() AND id IN (
            SELECT DISTINCT ca2.cohort_member_id
            FROM public.sh_cohort_assignments ca1
            JOIN public.sh_cohort_assignments ca2 ON ca1.session_id = ca2.session_id
            WHERE ca1.cohort_member_id = sh_get_cohort_member_id()
        ))
    );

-- INSERT: Admin, HOD
CREATE POLICY "sh_cohort_members_insert" ON public.sh_cohort_members
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod());

-- UPDATE: Admin, HOD, or member updating own profile
CREATE POLICY "sh_cohort_members_update" ON public.sh_cohort_members
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND department_id = sh_user_department_id())
        OR user_id = auth.uid()
    );

-- DELETE: Admin only
CREATE POLICY "sh_cohort_members_delete" ON public.sh_cohort_members
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_COHORT_ASSIGNMENTS TABLE POLICIES
-- Cohort member assignments to training sessions
-- Access: Admin full, HOD approve, Members see own
-- ================================================================================

ALTER TABLE public.sh_cohort_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, Staff, own assignments
CREATE POLICY "sh_cohort_assignments_select" ON public.sh_cohort_assignments
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        OR cohort_member_id = sh_get_cohort_member_id()
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_cohort_assignments_insert" ON public.sh_cohort_assignments
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, HOD, Staff
CREATE POLICY "sh_cohort_assignments_update" ON public.sh_cohort_assignments
    FOR UPDATE TO authenticated
    USING (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- DELETE: Admin only
CREATE POLICY "sh_cohort_assignments_delete" ON public.sh_cohort_assignments
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_CONTENT_ORDERS TABLE POLICIES
-- Content production orders
-- Access: Admin full, Staff scope, Production learners see assigned
-- ================================================================================

ALTER TABLE public.sh_content_orders ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, staff, production learners (assigned), clients
CREATE POLICY "sh_content_orders_select" ON public.sh_content_orders
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        -- Production learners see orders they're assigned to
        OR (sh_is_production_learner() AND id IN (
            SELECT co.id FROM public.sh_content_orders co
            JOIN public.sh_content_deliverables cd ON cd.order_id = co.id
            JOIN public.sh_production_assignments pa ON pa.deliverable_id = cd.id
            WHERE pa.learner_id = sh_get_production_learner_id()
        ))
        -- Clients see orders for their solutions
        OR (sh_is_client() AND solution_id IN (
            SELECT id FROM public.sh_solutions WHERE client_id = sh_get_client_id()
        ))
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_content_orders_insert" ON public.sh_content_orders
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, HOD, Staff
CREATE POLICY "sh_content_orders_update" ON public.sh_content_orders
    FOR UPDATE TO authenticated
    USING (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- DELETE: Admin only
CREATE POLICY "sh_content_orders_delete" ON public.sh_content_orders
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_CONTENT_DELIVERABLES TABLE POLICIES
-- Individual content deliverables
-- Access: Follows order access, production learners see assigned
-- ================================================================================

ALTER TABLE public.sh_content_deliverables ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, staff, production learners, clients
CREATE POLICY "sh_content_deliverables_select" ON public.sh_content_deliverables
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        -- Production learners see their deliverables
        OR (sh_is_production_learner() AND id IN (
            SELECT deliverable_id FROM public.sh_production_assignments
            WHERE learner_id = sh_get_production_learner_id()
        ))
        -- Clients see deliverables for their orders
        OR (sh_is_client() AND order_id IN (
            SELECT co.id FROM public.sh_content_orders co
            JOIN public.sh_solutions s ON co.solution_id = s.id
            WHERE s.client_id = sh_get_client_id()
        ))
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_content_deliverables_insert" ON public.sh_content_deliverables
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, HOD, Staff, assigned production learners
CREATE POLICY "sh_content_deliverables_update" ON public.sh_content_deliverables
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        OR (sh_is_production_learner() AND id IN (
            SELECT deliverable_id FROM public.sh_production_assignments
            WHERE learner_id = sh_get_production_learner_id()
        ))
    );

-- DELETE: Admin only
CREATE POLICY "sh_content_deliverables_delete" ON public.sh_content_deliverables
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_PRODUCTION_LEARNERS TABLE POLICIES
-- Content production learner profiles
-- Access: Admin full, HOD scope, Learners own profile
-- ================================================================================

ALTER TABLE public.sh_production_learners ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, staff, own profile
CREATE POLICY "sh_production_learners_select" ON public.sh_production_learners
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod())
        OR (sh_is_staff())
        OR user_id = auth.uid()
    );

-- INSERT: Admin, HOD
CREATE POLICY "sh_production_learners_insert" ON public.sh_production_learners
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod());

-- UPDATE: Admin, HOD, or learner updating own profile
CREATE POLICY "sh_production_learners_update" ON public.sh_production_learners
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR user_id = auth.uid()
    );

-- DELETE: Admin only
CREATE POLICY "sh_production_learners_delete" ON public.sh_production_learners
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_PRODUCTION_ASSIGNMENTS TABLE POLICIES
-- Production learner assignments to deliverables
-- Access: Admin full, HOD/Staff approve, Learners see own
-- ================================================================================

ALTER TABLE public.sh_production_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, Staff, own assignments
CREATE POLICY "sh_production_assignments_select" ON public.sh_production_assignments
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        OR learner_id = sh_get_production_learner_id()
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_production_assignments_insert" ON public.sh_production_assignments
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, HOD, Staff
CREATE POLICY "sh_production_assignments_update" ON public.sh_production_assignments
    FOR UPDATE TO authenticated
    USING (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- DELETE: Admin only
CREATE POLICY "sh_production_assignments_delete" ON public.sh_production_assignments
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_DISCOVERY_VISITS TABLE POLICIES
-- Client site discovery visits
-- Access: Admin, HOD, Staff
-- ================================================================================

ALTER TABLE public.sh_discovery_visits ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, Staff, clients (own visits)
CREATE POLICY "sh_discovery_visits_select" ON public.sh_discovery_visits
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        OR (department_id = sh_user_department_id())
        OR (sh_is_client() AND client_id = sh_get_client_id())
        OR created_by = auth.uid()
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_discovery_visits_insert" ON public.sh_discovery_visits
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, creator, or department
CREATE POLICY "sh_discovery_visits_update" ON public.sh_discovery_visits
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR created_by = auth.uid()
        OR department_id = sh_user_department_id()
    );

-- DELETE: Admin only
CREATE POLICY "sh_discovery_visits_delete" ON public.sh_discovery_visits
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_CLIENT_COMMUNICATIONS TABLE POLICIES
-- Client communication history
-- Access: Admin, HOD, Staff (department scope)
-- ================================================================================

ALTER TABLE public.sh_client_communications ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, Staff, clients (own communications)
CREATE POLICY "sh_client_communications_select" ON public.sh_client_communications
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        OR (sh_is_client() AND client_id = sh_get_client_id())
        OR created_by = auth.uid()
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_client_communications_insert" ON public.sh_client_communications
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, creator
CREATE POLICY "sh_client_communications_update" ON public.sh_client_communications
    FOR UPDATE TO authenticated
    USING (sh_is_admin() OR created_by = auth.uid());

-- DELETE: Admin only
CREATE POLICY "sh_client_communications_delete" ON public.sh_client_communications
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_REVENUE_SPLIT_MODELS TABLE POLICIES
-- Revenue split configurations
-- Access: Admin only for write, HOD can read
-- ================================================================================

ALTER TABLE public.sh_revenue_split_models ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin and HOD
CREATE POLICY "sh_revenue_split_models_select" ON public.sh_revenue_split_models
    FOR SELECT TO authenticated
    USING (sh_is_admin() OR sh_is_hod());

-- INSERT: Admin only
CREATE POLICY "sh_revenue_split_models_insert" ON public.sh_revenue_split_models
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin());

-- UPDATE: Admin only
CREATE POLICY "sh_revenue_split_models_update" ON public.sh_revenue_split_models
    FOR UPDATE TO authenticated
    USING (sh_is_admin());

-- DELETE: Admin only
CREATE POLICY "sh_revenue_split_models_delete" ON public.sh_revenue_split_models
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_PAYMENTS TABLE POLICIES
-- Payment records for solutions
-- Access: Admin full, HOD restricted, Clients own payments
-- ================================================================================

ALTER TABLE public.sh_payments ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, clients (own payments)
CREATE POLICY "sh_payments_select" ON public.sh_payments
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        -- Clients see payments for their solutions
        OR (sh_is_client() AND solution_id IN (
            SELECT id FROM public.sh_solutions WHERE client_id = sh_get_client_id()
        ))
    );

-- INSERT: Admin, HOD
CREATE POLICY "sh_payments_insert" ON public.sh_payments
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod());

-- UPDATE: Admin only
CREATE POLICY "sh_payments_update" ON public.sh_payments
    FOR UPDATE TO authenticated
    USING (sh_is_admin());

-- DELETE: Admin only
CREATE POLICY "sh_payments_delete" ON public.sh_payments
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_EARNINGS_LEDGER TABLE POLICIES
-- Earnings distribution records
-- Access: Admin full, Recipients see own earnings
-- ================================================================================

ALTER TABLE public.sh_earnings_ledger ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, HOD, own earnings
CREATE POLICY "sh_earnings_ledger_select" ON public.sh_earnings_ledger
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        -- Department sees their earnings
        OR department_id = sh_user_department_id()
        -- Builders see their earnings
        OR (recipient_type = 'builder' AND recipient_id = sh_get_builder_id())
        -- Cohort members see their earnings
        OR (recipient_type = 'cohort_member' AND recipient_id = sh_get_cohort_member_id())
        -- Production learners see their earnings
        OR (recipient_type = 'production_learner' AND recipient_id = sh_get_production_learner_id())
    );

-- INSERT: Admin only
CREATE POLICY "sh_earnings_ledger_insert" ON public.sh_earnings_ledger
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin());

-- UPDATE: Admin only
CREATE POLICY "sh_earnings_ledger_update" ON public.sh_earnings_ledger
    FOR UPDATE TO authenticated
    USING (sh_is_admin());

-- DELETE: Admin only
CREATE POLICY "sh_earnings_ledger_delete" ON public.sh_earnings_ledger
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_CLIENT_REFERRALS TABLE POLICIES
-- Client referral tracking for bonuses
-- Access: Admin full, involved departments
-- ================================================================================

ALTER TABLE public.sh_client_referrals ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, involved departments
CREATE POLICY "sh_client_referrals_select" ON public.sh_client_referrals
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_hod()
        OR referring_dept_id = sh_user_department_id()
        OR executing_dept_id = sh_user_department_id()
    );

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_client_referrals_insert" ON public.sh_client_referrals
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin only
CREATE POLICY "sh_client_referrals_update" ON public.sh_client_referrals
    FOR UPDATE TO authenticated
    USING (sh_is_admin());

-- DELETE: Admin only
CREATE POLICY "sh_client_referrals_delete" ON public.sh_client_referrals
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_PUBLICATIONS TABLE POLICIES
-- Academic publications from solutions
-- Access: Wide read, restricted write
-- ================================================================================

ALTER TABLE public.sh_publications ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated (publications are public knowledge)
CREATE POLICY "sh_publications_select" ON public.sh_publications
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

-- INSERT: Admin, HOD, Staff, Builders (own publications)
CREATE POLICY "sh_publications_insert" ON public.sh_publications
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_hod()
        OR sh_is_staff()
        OR sh_is_builder()
    );

-- UPDATE: Admin, creator
CREATE POLICY "sh_publications_update" ON public.sh_publications
    FOR UPDATE TO authenticated
    USING (sh_is_admin() OR sh_is_hod());

-- DELETE: Admin only
CREATE POLICY "sh_publications_delete" ON public.sh_publications
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_PUBLICATION_CONTRIBUTORS TABLE POLICIES
-- Contributors to publications
-- Access: Follows publication access
-- ================================================================================

ALTER TABLE public.sh_publication_contributors ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated
CREATE POLICY "sh_publication_contributors_select" ON public.sh_publication_contributors
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

-- INSERT: Admin, HOD, Staff
CREATE POLICY "sh_publication_contributors_insert" ON public.sh_publication_contributors
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin() OR sh_is_hod() OR sh_is_staff());

-- UPDATE: Admin, HOD
CREATE POLICY "sh_publication_contributors_update" ON public.sh_publication_contributors
    FOR UPDATE TO authenticated
    USING (sh_is_admin() OR sh_is_hod());

-- DELETE: Admin only
CREATE POLICY "sh_publication_contributors_delete" ON public.sh_publication_contributors
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_ACCREDITATION_METRICS TABLE POLICIES
-- NIRF/NAAC metric definitions
-- Access: Admin write, all authenticated read
-- ================================================================================

ALTER TABLE public.sh_accreditation_metrics ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated
CREATE POLICY "sh_accreditation_metrics_select" ON public.sh_accreditation_metrics
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

-- INSERT: Admin only
CREATE POLICY "sh_accreditation_metrics_insert" ON public.sh_accreditation_metrics
    FOR INSERT TO authenticated
    WITH CHECK (sh_is_admin());

-- UPDATE: Admin only
CREATE POLICY "sh_accreditation_metrics_update" ON public.sh_accreditation_metrics
    FOR UPDATE TO authenticated
    USING (sh_is_admin());

-- DELETE: Admin only
CREATE POLICY "sh_accreditation_metrics_delete" ON public.sh_accreditation_metrics
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_JICATE_SESSIONS TABLE POLICIES
-- JICATE facilitation sessions
-- Access: Admin full, HOD/Staff book and view
-- ================================================================================

ALTER TABLE public.sh_jicate_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin, JICATE staff, HOD, Staff
CREATE POLICY "sh_jicate_sessions_select" ON public.sh_jicate_sessions
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_jicate_staff()
        OR sh_is_hod()
        OR sh_is_staff()
        OR booked_by_dept_id = sh_user_department_id()
    );

-- INSERT: Admin, JICATE, HOD, Staff
CREATE POLICY "sh_jicate_sessions_insert" ON public.sh_jicate_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR sh_is_jicate_staff()
        OR sh_is_hod()
        OR sh_is_staff()
    );

-- UPDATE: Admin, JICATE, booking department
CREATE POLICY "sh_jicate_sessions_update" ON public.sh_jicate_sessions
    FOR UPDATE TO authenticated
    USING (
        sh_is_admin()
        OR sh_is_jicate_staff()
        OR booked_by_dept_id = sh_user_department_id()
    );

-- DELETE: Admin only
CREATE POLICY "sh_jicate_sessions_delete" ON public.sh_jicate_sessions
    FOR DELETE TO authenticated
    USING (sh_is_admin());

-- ================================================================================
-- SH_NOTIFICATIONS TABLE POLICIES
-- User notifications
-- Access: Users see own notifications
-- ================================================================================

ALTER TABLE public.sh_notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: Own notifications
CREATE POLICY "sh_notifications_select" ON public.sh_notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- INSERT: Admin, system (anyone can send to self)
CREATE POLICY "sh_notifications_insert" ON public.sh_notifications
    FOR INSERT TO authenticated
    WITH CHECK (
        sh_is_admin()
        OR user_id = auth.uid()
    );

-- UPDATE: Own notifications (for marking read)
CREATE POLICY "sh_notifications_update" ON public.sh_notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- DELETE: Own notifications or admin
CREATE POLICY "sh_notifications_delete" ON public.sh_notifications
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR sh_is_admin());

-- ================================================================================
-- SH_AUDIT_LOGS TABLE POLICIES
-- System audit logs
-- Access: Admin only
-- ================================================================================

ALTER TABLE public.sh_audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin only
CREATE POLICY "sh_audit_logs_select" ON public.sh_audit_logs
    FOR SELECT TO authenticated
    USING (sh_is_admin());

-- INSERT: System/service role (all users generate logs, but via triggers)
CREATE POLICY "sh_audit_logs_insert" ON public.sh_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- No UPDATE or DELETE allowed on audit logs (immutable)
-- Handled by not creating UPDATE/DELETE policies

-- ================================================================================
-- END OF SOLUTIONS HUB RLS POLICIES
-- Total: 30 tables, 120+ policies, 15 helper functions
-- ================================================================================
