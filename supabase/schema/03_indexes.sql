-- =============================================
-- Database Indexes
-- =============================================

-- Core Tables Indexes
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_institution_id ON profiles(institution_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_user_activity_logs_created_at ON user_activity_logs(created_at);
CREATE INDEX idx_user_activity_logs_session_id ON user_activity_logs(session_id);
CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX idx_api_keys_key_value ON api_keys(key_value);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_request_logs_api_key_id ON api_request_logs(api_key_id);
CREATE INDEX idx_api_request_logs_timestamp ON api_request_logs(timestamp);

-- Academic Tables Indexes
CREATE INDEX idx_degrees_institution_id ON degrees(institution_id);
CREATE INDEX idx_departments_institution_id ON departments(institution_id);
CREATE INDEX idx_programs_department_id ON programs(department_id);
CREATE INDEX idx_programs_institution_id ON programs(institution_id);
CREATE INDEX idx_sections_institution_id ON sections(institution_id);
CREATE INDEX idx_sections_program_id ON sections(program_id);
CREATE INDEX idx_courses_institution_id ON courses(institution_id);
CREATE INDEX idx_course_mappings_course_id ON course_mappings(course_id);
CREATE INDEX idx_course_mappings_institution_id ON course_mappings(institution_id);
CREATE INDEX idx_academic_years_institution_id ON academic_years(institution_id);
CREATE INDEX idx_academic_years_is_active ON academic_years(is_active);

-- Staff & Student Tables Indexes
CREATE INDEX idx_staff_institution_id ON staff(institution_id);
CREATE INDEX idx_staff_department_id ON staff(department_id);
CREATE INDEX idx_staff_staff_id ON staff(staff_id);
CREATE INDEX idx_admissions_institution_id ON admissions(institution_id);
CREATE INDEX idx_admissions_status ON admissions(status);
CREATE INDEX idx_students_institution_id ON students(institution_id);
CREATE INDEX idx_students_roll_number ON students(roll_number);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_section_id ON students(section_id);

-- Billing Tables Indexes
CREATE INDEX idx_billing_student_bills_student_id ON billing_student_bills(student_id);
CREATE INDEX idx_billing_student_bills_institution_id ON billing_student_bills(institution_id);
CREATE INDEX idx_billing_student_bills_status ON billing_student_bills(status);
CREATE INDEX idx_billing_student_bills_due_date ON billing_student_bills(due_date);
CREATE INDEX idx_billing_receipts_receipt_number ON billing_receipts(receipt_number);
CREATE INDEX idx_billing_receipts_student_id ON billing_receipts(student_id);
CREATE INDEX idx_billing_receipt_items_receipt_id ON billing_receipt_items(receipt_id);
CREATE INDEX idx_billing_receipt_items_bill_id ON billing_receipt_items(bill_id);
CREATE INDEX idx_billing_invoices_invoice_number ON billing_invoices(invoice_number);
CREATE INDEX idx_billing_invoices_student_id ON billing_invoices(student_id);
CREATE INDEX idx_billing_invoice_items_invoice_id ON billing_invoice_items(invoice_id);
CREATE INDEX idx_billing_discounts_student_id ON billing_discounts(student_id);
CREATE INDEX idx_billing_discounts_bill_id ON billing_discounts(bill_id);
CREATE INDEX idx_billing_refunds_receipt_id ON billing_refunds(receipt_id);

-- Application & Bug Reports Indexes
CREATE INDEX idx_applications_category_id ON applications(category_id);
CREATE INDEX idx_applications_is_active ON applications(is_active);
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_reporter_user_id ON bug_reports(reporter_user_id);
CREATE INDEX idx_bug_reports_assignee_id ON bug_reports(assignee_id);
CREATE INDEX idx_bug_report_comments_bug_report_id ON bug_report_comments(bug_report_id);

-- Resource Management Indexes
CREATE INDEX idx_resources_institution_id ON resources(institution_id);
CREATE INDEX idx_resources_category_id ON resources(category_id);
CREATE INDEX idx_resources_is_available ON resources(is_available);
CREATE INDEX idx_resource_requests_requester_id ON resource_requests(requester_id);
CREATE INDEX idx_resource_requests_status ON resource_requests(status);
CREATE INDEX idx_reservations_resource_id ON reservations(resource_id);
CREATE INDEX idx_reservations_reserved_by ON reservations(reserved_by);
CREATE INDEX idx_reservations_start_datetime ON reservations(start_datetime);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_digital_resources_institution_id ON digital_resources(institution_id);
CREATE INDEX idx_digital_resources_is_active ON digital_resources(is_active);
CREATE INDEX idx_digital_resource_usage_resource_id ON digital_resource_usage(resource_id);
CREATE INDEX idx_digital_resource_usage_user_id ON digital_resource_usage(user_id);

-- Timetabling Indexes
CREATE INDEX idx_periods_institution_id ON periods(institution_id);
CREATE INDEX idx_timetables_institution_id ON timetables(institution_id);
CREATE INDEX idx_timetables_academic_year_id ON timetables(academic_year_id);
CREATE INDEX idx_timetables_is_active ON timetables(is_active);
CREATE INDEX idx_timetable_slots_timetable_id ON timetable_slots(timetable_id);
CREATE INDEX idx_timetable_slot_sections_slot_id ON timetable_slot_sections(slot_id);
CREATE INDEX idx_timetable_slot_staff_slot_id ON timetable_slot_staff(slot_id);
CREATE INDEX idx_timetable_periods_timetable_id ON timetable_periods(timetable_id);
CREATE INDEX idx_staff_plans_staff_id ON staff_plans(staff_id);
CREATE INDEX idx_staff_plan_courses_staff_plan_id ON staff_plan_courses(staff_plan_id);

-- Attendance Indexes
CREATE INDEX idx_student_attendance_student_id ON student_attendance(student_id);
CREATE INDEX idx_student_attendance_course_id ON student_attendance(course_id);
CREATE INDEX idx_student_attendance_attendance_date ON student_attendance(attendance_date);
CREATE INDEX idx_student_attendance_section_id ON student_attendance(section_id);

-- Dashboard Indexes
CREATE INDEX idx_dashboard_configurations_user_id ON dashboard_configurations(user_id);
CREATE INDEX idx_dashboard_widgets_configuration_id ON dashboard_widgets(configuration_id);

-- Full Text Search Indexes (using pg_trgm)
CREATE INDEX idx_profiles_full_name_trgm ON profiles USING gin(full_name gin_trgm_ops);
CREATE INDEX idx_staff_staff_name_trgm ON staff USING gin(staff_name gin_trgm_ops);
CREATE INDEX idx_students_student_name_trgm ON students USING gin(student_name gin_trgm_ops);
CREATE INDEX idx_courses_course_name_trgm ON courses USING gin(course_name gin_trgm_ops);
CREATE INDEX idx_applications_name_trgm ON applications USING gin(name gin_trgm_ops);
CREATE INDEX idx_bug_reports_title_trgm ON bug_reports USING gin(title gin_trgm_ops);

-- Composite Indexes for Common Queries
CREATE INDEX idx_students_institution_program ON students(institution_id, program_id);
CREATE INDEX idx_billing_bills_student_status ON billing_student_bills(student_id, status);
CREATE INDEX idx_attendance_student_date ON student_attendance(student_id, attendance_date);
CREATE INDEX idx_timetable_slots_day_period ON timetable_slots(timetable_id, day_of_week, period_id);

-- JSONB Indexes
CREATE INDEX idx_custom_roles_permissions ON custom_roles USING gin(permissions);
CREATE INDEX idx_api_keys_permissions ON api_keys USING gin(permissions);
CREATE INDEX idx_user_activity_logs_details ON user_activity_logs USING gin(details);
CREATE INDEX idx_dashboard_widgets_config ON dashboard_widgets USING gin(widget_config); 