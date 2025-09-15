-- ================================================================================
-- MYJKKN ROW LEVEL SECURITY POLICIES
-- Generated: 2025-01-17
-- Description: Complete RLS policies for all tables
-- ================================================================================

-- ================================================================================
-- SECTION 1: PROFILE & USER TABLES
-- ================================================================================

-- PROFILES TABLE (10 policies)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_same_institution" ON profiles
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "profiles_select_admin" ON profiles
    FOR SELECT USING (is_super_admin());

CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_update_admin" ON profiles
    FOR UPDATE USING (is_super_admin());

CREATE POLICY "profiles_insert_auth" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_super_admin" ON profiles
    FOR DELETE USING (is_super_admin());

CREATE POLICY "profiles_select_staff" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM staff WHERE email = profiles.email
        )
    );

CREATE POLICY "profiles_select_accessible" ON profiles
    FOR SELECT USING (can_access_profile(auth.uid(), id));

CREATE POLICY "profiles_update_last_login" ON profiles
    FOR UPDATE USING (true)
    WITH CHECK (id = auth.uid() AND NEW.last_login = NOW());

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
        is_super_admin() OR 
        EXISTS (
            SELECT 1 FROM user_institution_access
            WHERE user_id = auth.uid()
            AND institution_id = institutions.id
            AND access_type = 'admin'
        )
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

-- ACADEMIC_YEARS TABLE (11 policies)
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academic_years_select_institution" ON academic_years
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "academic_years_insert_admin" ON academic_years
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() 
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "academic_years_update_admin" ON academic_years
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "academic_years_delete_admin" ON academic_years
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- Additional policies for active year management
CREATE POLICY "academic_years_select_active" ON academic_years
    FOR SELECT USING (is_active = true);

CREATE POLICY "academic_years_update_active_admin" ON academic_years
    FOR UPDATE USING (
        is_active = true AND
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
        )
    );

-- DEGREES TABLE (4 policies)
ALTER TABLE degrees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "degrees_select_institution" ON degrees
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "degrees_insert_admin" ON degrees
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "degrees_update_admin" ON degrees
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "degrees_delete_admin" ON degrees
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- DEPARTMENTS TABLE (4 policies)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_institution" ON departments
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "departments_insert_admin" ON departments
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "departments_update_admin" ON departments
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "departments_delete_admin" ON departments
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- PROGRAMS TABLE (5 policies)
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "programs_select_institution" ON programs
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "programs_insert_admin" ON programs
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "programs_update_admin" ON programs
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "programs_delete_admin" ON programs
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

CREATE POLICY "programs_select_public" ON programs
    FOR SELECT USING (is_active = true);

-- SEMESTERS TABLE (4 policies)
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "semesters_select_institution" ON semesters
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "semesters_insert_admin" ON semesters
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "semesters_update_admin" ON semesters
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "semesters_delete_admin" ON semesters
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- SECTIONS TABLE (4 policies)
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sections_select_institution" ON sections
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "sections_insert_admin" ON sections
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "sections_update_admin" ON sections
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "sections_delete_admin" ON sections
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- COURSES TABLE (4 policies)
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_select_institution" ON courses
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "courses_insert_admin" ON courses
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "courses_update_admin" ON courses
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "courses_delete_admin" ON courses
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- COURSE_MAPPINGS TABLE (4 policies)
ALTER TABLE course_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_mappings_select_institution" ON course_mappings
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "course_mappings_insert_admin" ON course_mappings
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "course_mappings_update_admin" ON course_mappings
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "course_mappings_delete_admin" ON course_mappings
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
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

-- STAFF TABLE (4 policies)
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_institution" ON staff
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "staff_insert_admin" ON staff
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "staff_update_admin" ON staff
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "staff_delete_admin" ON staff
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- STAFF_PLANS TABLE (10 policies)
ALTER TABLE staff_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_plans_select_institution" ON staff_plans
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "staff_plans_insert_admin" ON staff_plans
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "staff_plans_update_admin" ON staff_plans
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "staff_plans_delete_admin" ON staff_plans
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

-- Additional staff plan policies
CREATE POLICY "staff_plans_select_own" ON staff_plans
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM staff_plan_courses spc
            JOIN staff s ON spc.staff_id = s.id
            WHERE spc.staff_plan_id = staff_plans.id
            AND s.email = (SELECT email FROM profiles WHERE id = auth.uid())
        )
    );

-- STAFF_PLAN_COURSES TABLE (8 policies)
ALTER TABLE staff_plan_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_plan_courses_select_institution" ON staff_plan_courses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM staff_plans sp
            WHERE sp.id = staff_plan_courses.staff_plan_id
            AND sp.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid() AND is_active = true
            )
        )
    );

CREATE POLICY "staff_plan_courses_insert_admin" ON staff_plan_courses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_plans sp
            WHERE sp.id = NEW.staff_plan_id
            AND sp.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
                AND access_type IN ('admin', 'write')
                AND is_active = true
            )
        )
    );

CREATE POLICY "staff_plan_courses_update_admin" ON staff_plan_courses
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM staff_plans sp
            WHERE sp.id = staff_plan_courses.staff_plan_id
            AND sp.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
                AND access_type IN ('admin', 'write')
                AND is_active = true
            )
        )
    );

CREATE POLICY "staff_plan_courses_delete_admin" ON staff_plan_courses
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM staff_plans sp
            WHERE sp.id = staff_plan_courses.staff_plan_id
            AND sp.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
                AND access_type = 'admin'
                AND is_active = true
            )
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
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "periods_insert_admin" ON periods
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "periods_update_admin" ON periods
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "periods_delete_admin" ON periods
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
    );

CREATE POLICY "periods_select_active" ON periods
    FOR SELECT USING (is_active = true);

CREATE POLICY "periods_select_time_range" ON periods
    FOR SELECT USING (
        start_time >= '08:00'::time AND end_time <= '18:00'::time
    );

-- STUDENT_ATTENDANCE TABLE (6 policies)
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_attendance_select_institution" ON student_attendance
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "student_attendance_insert_staff" ON student_attendance
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'staff')
            AND is_active = true
        )
    );

CREATE POLICY "student_attendance_update_staff" ON student_attendance
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write', 'staff')
            AND is_active = true
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

-- ================================================================================
-- SECTION 8: TIMETABLE MODULE TABLES
-- ================================================================================

-- TIMETABLES TABLE (5 policies)
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timetables_select_institution" ON timetables
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "timetables_insert_admin" ON timetables
    FOR INSERT WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "timetables_update_admin" ON timetables
    FOR UPDATE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

CREATE POLICY "timetables_delete_admin" ON timetables
    FOR DELETE USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type = 'admin'
            AND is_active = true
        )
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
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resources_select_institution" ON resources
    FOR SELECT USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "resources_all_admin" ON resources
    FOR ALL USING (
        institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
            AND access_type IN ('admin', 'write')
            AND is_active = true
        )
    );

-- RESOURCE_RESERVATIONS TABLE (4 policies)
ALTER TABLE resource_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations_select_institution" ON resource_reservations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = resource_reservations.resource_id
            AND r.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid() AND is_active = true
            )
        )
    );

CREATE POLICY "reservations_insert_authenticated" ON resource_reservations
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = NEW.resource_id
            AND r.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid() AND is_active = true
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
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid()
                AND access_type = 'admin'
                AND is_active = true
            )
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
ALTER TABLE resource_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_logs_select_institution" ON resource_usage_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.id = resource_usage_logs.resource_id
            AND r.institution_id IN (
                SELECT institution_id FROM user_institution_access
                WHERE user_id = auth.uid() AND is_active = true
            )
        )
    );

CREATE POLICY "usage_logs_insert_system" ON resource_usage_logs
    FOR INSERT WITH CHECK (true);

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

-- DASHBOARD_CONFIGURATIONS TABLE (4 policies)
ALTER TABLE dashboard_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_config_select_own" ON dashboard_configurations
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "dashboard_config_insert_own" ON dashboard_configurations
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "dashboard_config_update_own" ON dashboard_configurations
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "dashboard_config_delete_own" ON dashboard_configurations
    FOR DELETE USING (user_id = auth.uid());

-- DASHBOARD_WIDGETS TABLE (4 policies)
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_widgets_select_own" ON dashboard_widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM dashboard_configurations dc
            WHERE dc.id = dashboard_widgets.configuration_id
            AND dc.user_id = auth.uid()
        )
    );

CREATE POLICY "dashboard_widgets_insert_own" ON dashboard_widgets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM dashboard_configurations dc
            WHERE dc.id = NEW.configuration_id
            AND dc.user_id = auth.uid()
        )
    );

CREATE POLICY "dashboard_widgets_update_own" ON dashboard_widgets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM dashboard_configurations dc
            WHERE dc.id = dashboard_widgets.configuration_id
            AND dc.user_id = auth.uid()
        )
    );

CREATE POLICY "dashboard_widgets_delete_own" ON dashboard_widgets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM dashboard_configurations dc
            WHERE dc.id = dashboard_widgets.configuration_id
            AND dc.user_id = auth.uid()
        )
    );

-- DASHBOARD_WIDGET_TYPES TABLE (1 policy)
ALTER TABLE dashboard_widget_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "widget_types_select_active" ON dashboard_widget_types
    FOR SELECT USING (is_active = true);

-- ================================================================================
-- SECTION 15: API & ACTIVITY LOGGING TABLES
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
        is_super_admin() OR
        EXISTS (
            SELECT 1 FROM user_institution_access
            WHERE user_id = auth.uid()
            AND institution_id = user_activity_logs.institution_id
            AND access_type = 'admin'
            AND is_active = true
        )
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
