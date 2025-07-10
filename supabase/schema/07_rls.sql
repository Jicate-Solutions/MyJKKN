-- =============================================
-- Row Level Security (RLS) Settings and Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_parent_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_student_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_sub_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widget_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE degrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_resource_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_resource_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_resource_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_resource_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_plan_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_day_order_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slot_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slot_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_sub_slot_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_sub_slot_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Core Table Policies
-- =============================================

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Super admins can view all profiles" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_super_admin = true
        )
    );

-- Institutions policies
CREATE POLICY "Users can view institutions they have access to" ON institutions
    FOR SELECT USING (
        user_has_institution_access(auth.uid(), id)
    );

CREATE POLICY "Super admins can manage all institutions" ON institutions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND is_super_admin = true
        )
    );

-- User activity logs policies
CREATE POLICY "Users can view their own activity logs" ON user_activity_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert activity logs" ON user_activity_logs
    FOR INSERT WITH CHECK (true);

-- API Keys policies
CREATE POLICY "Users can view their own API keys" ON api_keys
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own API keys" ON api_keys
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own API keys" ON api_keys
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own API keys" ON api_keys
    FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- Academic Table Policies
-- =============================================

-- Academic years policies
CREATE POLICY "Users can view academic years of accessible institutions" ON academic_years
    FOR SELECT USING (
        user_has_institution_access(auth.uid(), institution_id)
    );

CREATE POLICY "Admins can manage academic years" ON academic_years
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (role IN ('administrator', 'super_admin') OR is_super_admin = true)
            AND user_has_institution_access(auth.uid(), academic_years.institution_id)
        )
    );

-- Similar patterns for other academic tables
CREATE POLICY "Users can view degrees" ON degrees
    FOR SELECT USING (
        user_has_institution_access(auth.uid(), institution_id)
    );

CREATE POLICY "Users can view departments" ON departments
    FOR SELECT USING (
        user_has_institution_access(auth.uid(), institution_id)
    );

CREATE POLICY "Users can view programs" ON programs
    FOR SELECT USING (
        user_has_institution_access(auth.uid(), institution_id)
    );

CREATE POLICY "Users can view courses" ON courses
    FOR SELECT USING (
        user_has_institution_access(auth.uid(), institution_id)
    );

CREATE POLICY "Users can view sections" ON sections
    FOR SELECT USING (
        user_has_institution_access(auth.uid(), institution_id)
    );

-- =============================================
-- Student & Staff Policies
-- =============================================

-- Students policies
CREATE POLICY "Students can view their own data" ON students
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND email = students.student_email
        )
    );

CREATE POLICY "Staff can view students in their institution" ON students
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('faculty', 'staff', 'administrator', 'super_admin')
            AND user_has_institution_access(auth.uid(), students.institution_id)
        )
    );

CREATE POLICY "Admins can manage students" ON students
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (role IN ('administrator', 'super_admin') OR is_super_admin = true)
            AND user_has_institution_access(auth.uid(), students.institution_id)
        )
    );

-- Staff policies
CREATE POLICY "Staff can view their own data" ON staff
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND email = staff.email
        )
    );

CREATE POLICY "Users can view staff in their institution" ON staff
    FOR SELECT USING (
        user_has_institution_access(auth.uid(), institution_id)
    );

-- =============================================
-- Billing Policies
-- =============================================

-- Billing student bills policies
CREATE POLICY "Students can view their own bills" ON billing_student_bills
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM students s
            JOIN profiles p ON p.email = s.student_email
            WHERE p.id = auth.uid() 
            AND s.id = billing_student_bills.student_id
        )
    );

CREATE POLICY "Billing staff can manage all bills" ON billing_student_bills
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('accounts', 'administrator', 'super_admin')
            AND user_has_institution_access(auth.uid(), billing_student_bills.institution_id)
        )
    );

-- Billing receipts policies
CREATE POLICY "Students can view their own receipts" ON billing_receipts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM students s
            JOIN profiles p ON p.email = s.student_email
            WHERE p.id = auth.uid() 
            AND s.id = billing_receipts.student_id
        )
    );

CREATE POLICY "Billing staff can manage receipts" ON billing_receipts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('accounts', 'administrator', 'super_admin')
            AND user_has_institution_access(auth.uid(), billing_receipts.institution_id)
        )
    );

-- =============================================
-- Application & Bug Report Policies
-- =============================================

-- Applications policies
CREATE POLICY "Anyone can view active applications" ON applications
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage applications" ON applications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (role IN ('administrator', 'super_admin') OR is_super_admin = true)
        )
    );

-- Bug reports policies
CREATE POLICY "Users can view their own bug reports" ON bug_reports
    FOR SELECT USING (reporter_user_id = auth.uid());

CREATE POLICY "Users can create bug reports" ON bug_reports
    FOR INSERT WITH CHECK (reporter_user_id = auth.uid());

CREATE POLICY "Admins can view all bug reports" ON bug_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (role IN ('administrator', 'super_admin') OR is_super_admin = true)
        )
    );

-- =============================================
-- Dashboard Policies
-- =============================================

-- Dashboard configurations policies
CREATE POLICY "Users can view their own dashboard configurations" ON dashboard_configurations
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own dashboard configurations" ON dashboard_configurations
    FOR ALL USING (user_id = auth.uid());

-- Dashboard widgets policies
CREATE POLICY "Users can view their own dashboard widgets" ON dashboard_widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM dashboard_configurations dc
            WHERE dc.id = dashboard_widgets.configuration_id
            AND dc.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their own dashboard widgets" ON dashboard_widgets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM dashboard_configurations dc
            WHERE dc.id = dashboard_widgets.configuration_id
            AND dc.user_id = auth.uid()
        )
    );

-- =============================================
-- Grant necessary permissions
-- =============================================

-- Grant usage on schemas
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Grant permissions on all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- Grant permissions on all sequences
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute on all functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role, authenticated; 