-- ================================================================================
-- MYJKKN DATABASE TRIGGERS
-- Generated: 2025-01-17
-- Description: All database triggers organized by module
-- ================================================================================

-- ================================================================================
-- SECTION 1: TIMESTAMP UPDATE TRIGGERS
-- ================================================================================

-- Generic updated_at trigger for all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON institutions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_students_updated_at();

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_degrees_updated_at BEFORE UPDATE ON degrees
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON programs
    FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

CREATE TRIGGER update_semesters_updated_at BEFORE UPDATE ON semesters
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON sections
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_course_mappings_updated_at BEFORE UPDATE ON course_mappings
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_academic_years_updated_at BEFORE UPDATE ON academic_years
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_periods_updated_at BEFORE UPDATE ON periods
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_timetables_updated_at BEFORE UPDATE ON timetables
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_student_attendance_updated_at BEFORE UPDATE ON student_attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_plans_updated_at BEFORE UPDATE ON staff_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_plan_courses_updated_at BEFORE UPDATE ON staff_plan_courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================================
-- SECTION 2: ADMISSION MODULE TRIGGERS
-- ================================================================================

-- Set admission updated_at
CREATE TRIGGER set_admissions_updated_at BEFORE UPDATE ON admissions
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Generate institution application ID
CREATE TRIGGER set_institution_application_id_trigger BEFORE INSERT ON admissions
    FOR EACH ROW EXECUTE FUNCTION set_institution_application_id();

-- Auto-populate admission institution
CREATE TRIGGER trigger_auto_populate_admission_institution BEFORE INSERT ON admissions
    FOR EACH ROW EXECUTE FUNCTION auto_populate_admission_institution();

-- Set application ID
CREATE TRIGGER trigger_set_application_id BEFORE INSERT ON admissions
    FOR EACH ROW EXECUTE FUNCTION set_application_id();

-- ================================================================================
-- SECTION 3: BILLING MODULE TRIGGERS
-- ================================================================================

-- Billing updated_at triggers
CREATE TRIGGER trigger_billing_student_bills_updated_at BEFORE UPDATE ON billing_student_bills
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_receipts_updated_at BEFORE UPDATE ON billing_receipts
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_invoices_updated_at BEFORE UPDATE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_discounts_updated_at BEFORE UPDATE ON billing_discounts
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_refunds_updated_at BEFORE UPDATE ON billing_refunds
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_parent_categories_updated_at BEFORE UPDATE ON billing_parent_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_parent_categories_updated_at();

CREATE TRIGGER trigger_billing_sub_categories_updated_at BEFORE UPDATE ON billing_sub_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_sub_categories_updated_at();

CREATE TRIGGER trigger_billing_item_categories_updated_at BEFORE UPDATE ON billing_item_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_item_categories_updated_at();

-- Billing status update triggers
CREATE TRIGGER trigger_update_bill_status_on_payment AFTER INSERT ON billing_receipt_items
    FOR EACH ROW EXECUTE FUNCTION update_bill_status();

CREATE TRIGGER trigger_update_bill_status_on_delete AFTER DELETE ON billing_receipt_items
    FOR EACH ROW EXECUTE FUNCTION update_bill_status_on_delete();

CREATE TRIGGER trigger_update_bill_balance_on_amount_change AFTER UPDATE OF bill_amount ON billing_student_bills
    FOR EACH ROW EXECUTE FUNCTION update_bill_balance_on_amount_change();

CREATE TRIGGER trigger_update_bill_on_refund_status_change AFTER UPDATE OF approval_status ON billing_refunds
    FOR EACH ROW EXECUTE FUNCTION update_bill_on_refund_status_change();

-- Billing summary refresh triggers
CREATE TRIGGER trigger_bills_refresh_summary AFTER INSERT OR UPDATE OR DELETE ON billing_student_bills
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

CREATE TRIGGER trigger_receipts_refresh_summary AFTER INSERT OR UPDATE OR DELETE ON billing_receipts
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

CREATE TRIGGER trigger_refunds_refresh_summary AFTER INSERT OR UPDATE OR DELETE ON billing_refunds
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

-- ================================================================================
-- SECTION 4: ACADEMIC MODULE TRIGGERS
-- ================================================================================

-- Auto-populate academic year institution
CREATE TRIGGER trigger_auto_populate_academic_year_institution BEFORE INSERT ON academic_years
    FOR EACH ROW EXECUTE FUNCTION auto_populate_academic_year_institution();

-- Institution ID auto-population triggers
CREATE TRIGGER trg_degrees_set_institution_id BEFORE INSERT ON degrees
    FOR EACH ROW EXECUTE FUNCTION set_degree_institution_id();

CREATE TRIGGER trg_departments_set_institution_id BEFORE INSERT ON departments
    FOR EACH ROW EXECUTE FUNCTION set_department_institution_id();

CREATE TRIGGER trg_programs_set_institution_id BEFORE INSERT ON programs
    FOR EACH ROW EXECUTE FUNCTION set_program_institution_id();

CREATE TRIGGER trg_semesters_set_institution_id BEFORE INSERT ON semesters
    FOR EACH ROW EXECUTE FUNCTION set_semester_institution_id();

CREATE TRIGGER trg_sections_set_institution_id BEFORE INSERT ON sections
    FOR EACH ROW EXECUTE FUNCTION set_section_institution_id();

CREATE TRIGGER trg_courses_set_institution_id BEFORE INSERT ON courses
    FOR EACH ROW EXECUTE FUNCTION set_course_institution_id();

CREATE TRIGGER trg_course_mappings_set_institution_id BEFORE INSERT ON course_mappings
    FOR EACH ROW EXECUTE FUNCTION set_course_mapping_institution_id();

-- Program validation triggers
CREATE TRIGGER trigger_validate_program_changes BEFORE UPDATE ON programs
    FOR EACH ROW EXECUTE FUNCTION validate_program_changes();

-- Semester validation triggers
CREATE TRIGGER trigger_validate_semester_program_hierarchy BEFORE INSERT OR UPDATE ON semesters
    FOR EACH ROW EXECUTE FUNCTION validate_semester_program_hierarchy();

-- ================================================================================
-- SECTION 5: STUDENT MODULE TRIGGERS
-- ================================================================================

-- Auto-populate student institution
CREATE TRIGGER trigger_auto_populate_student_institution BEFORE INSERT ON students
    FOR EACH ROW EXECUTE FUNCTION auto_populate_student_institution();

-- Validate student semester consistency
CREATE TRIGGER trigger_validate_student_semester_consistency BEFORE INSERT OR UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION validate_student_semester_consistency();

-- ================================================================================
-- SECTION 6: STAFF MODULE TRIGGERS
-- ================================================================================

-- Sync staff to profiles
CREATE TRIGGER trg_sync_staff_to_profiles AFTER INSERT ON staff
    FOR EACH ROW EXECUTE FUNCTION sync_staff_to_profiles();

-- Lowercase institution email
CREATE TRIGGER trigger_lowercase_institution_email BEFORE INSERT OR UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION lowercase_institution_email();

-- Auto-populate staff plan institution
CREATE TRIGGER trigger_auto_populate_staff_plan_institution BEFORE INSERT ON staff_plans
    FOR EACH ROW EXECUTE FUNCTION auto_populate_staff_plan_institution();

-- ================================================================================
-- SECTION 7: PROFILE MODULE TRIGGERS
-- ================================================================================

-- Profile update triggers
CREATE TRIGGER on_profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ================================================================================
-- SECTION 8: BUG REPORT MODULE TRIGGERS
-- ================================================================================

-- Set bug display ID
CREATE TRIGGER trigger_set_bug_display_id BEFORE INSERT ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION set_bug_display_id();

-- Add bug reporter as participant
CREATE TRIGGER trigger_add_bug_reporter_participant AFTER INSERT ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION add_bug_reporter_as_participant();

-- Create bug status change message
CREATE TRIGGER trigger_bug_status_change_message AFTER UPDATE OF status ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION create_bug_status_change_message();

-- ================================================================================
-- SECTION 9: RESOURCE MANAGEMENT MODULE TRIGGERS
-- ================================================================================

-- Resource updated_at triggers
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON resource_reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON resource_approvals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parent_categories_updated_at BEFORE UPDATE ON resource_parent_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sub_categories_updated_at BEFORE UPDATE ON resource_sub_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attribute_definitions_updated_at BEFORE UPDATE ON resource_attribute_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Resource usage logging
CREATE TRIGGER log_resource_usage_trigger AFTER INSERT ON resource_reservations
    FOR EACH ROW EXECUTE FUNCTION log_resource_usage();

-- Update resource reservation count
CREATE TRIGGER update_resource_reservation_count_trigger AFTER INSERT OR UPDATE OR DELETE ON resource_reservations
    FOR EACH ROW EXECUTE FUNCTION update_resource_reservation_count();

-- Update category usage count
CREATE TRIGGER update_category_usage_count_trigger AFTER INSERT OR UPDATE OR DELETE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_category_usage_count();

-- ================================================================================
-- SECTION 10: NOTIFICATION MODULE TRIGGERS
-- ================================================================================

-- Notification timestamps
CREATE TRIGGER set_timestamp_notifications BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_push_subscriptions BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ================================================================================
-- SECTION 11: APPLICATION MODULE TRIGGERS
-- ================================================================================

-- Application timestamps
CREATE TRIGGER update_applications_timestamp BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_applications_timestamp();

-- Set applications created_by
CREATE TRIGGER set_applications_created_by_trigger BEFORE INSERT ON applications
    FOR EACH ROW EXECUTE FUNCTION set_applications_created_by();

-- ================================================================================
-- SECTION 12: CATEGORY MODULE TRIGGERS
-- ================================================================================

-- Category triggers
CREATE TRIGGER set_categories_created_by_trigger BEFORE INSERT ON categories
    FOR EACH ROW EXECUTE FUNCTION set_categories_created_by();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Subcategory triggers
CREATE TRIGGER set_subcategory_updated_at BEFORE UPDATE ON subcategories
    FOR EACH ROW EXECUTE FUNCTION update_subcategory_updated_at();

-- ================================================================================
-- SECTION 13: DASHBOARD MODULE TRIGGERS
-- ================================================================================

-- Dashboard configuration triggers
CREATE TRIGGER update_dashboard_configurations_updated_at BEFORE UPDATE ON dashboard_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_widgets_updated_at BEFORE UPDATE ON dashboard_widgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_widget_types_updated_at BEFORE UPDATE ON dashboard_widget_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================================
-- SECTION 14: API KEY MODULE TRIGGERS
-- ================================================================================

-- API key timestamp triggers
CREATE TRIGGER trigger_update_api_key_timestamp BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_api_key_updated_at();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================================
-- SECTION 15: CUSTOM ROLES MODULE TRIGGERS
-- ================================================================================

-- Custom roles updated_at
CREATE TRIGGER set_custom_roles_updated_at BEFORE UPDATE ON custom_roles
    FOR EACH ROW EXECUTE FUNCTION update_custom_roles_updated_at();

-- ================================================================================
-- SECTION 16: USER INSTITUTION ACCESS TRIGGERS
-- ================================================================================

-- User institution access updated_at
CREATE TRIGGER trigger_update_user_institution_access_updated_at BEFORE UPDATE ON user_institution_access
    FOR EACH ROW EXECUTE FUNCTION update_user_institution_access_updated_at();

-- ================================================================================
-- SECTION 17: AUTH MODULE TRIGGERS (IF NEEDED)
-- ================================================================================

-- Handle new user trigger (for auth.users table if accessible)
-- Note: This trigger would be on auth.users table, not public schema
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================================
-- SECTION 18: STORAGE TRIGGERS (IF NEEDED)
-- ================================================================================

-- Storage object deleted trigger (for storage.objects table if accessible)
-- CREATE TRIGGER on_storage_object_deleted AFTER DELETE ON storage.objects
--     FOR EACH ROW EXECUTE FUNCTION on_storage_object_deleted();

-- ================================================================================
-- End of Triggers File
-- Total Triggers: 71
-- ================================================================================