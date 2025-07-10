-- =============================================
-- Database Triggers
-- =============================================

-- Trigger to handle new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Triggers for updated_at column
CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_institution_access_updated_at BEFORE UPDATE ON user_institution_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_roles_updated_at BEFORE UPDATE ON custom_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_activity_logs_updated_at BEFORE UPDATE ON user_activity_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Academic tables triggers
CREATE TRIGGER update_degrees_updated_at BEFORE UPDATE ON degrees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_semesters_updated_at BEFORE UPDATE ON semesters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_mappings_updated_at BEFORE UPDATE ON course_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_academic_years_updated_at BEFORE UPDATE ON academic_years
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Staff & Student triggers
CREATE TRIGGER update_employment_categories_updated_at BEFORE UPDATE ON employment_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admissions_updated_at BEFORE UPDATE ON admissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Billing triggers
CREATE TRIGGER update_billing_parent_categories_updated_at BEFORE UPDATE ON billing_parent_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_sub_categories_updated_at BEFORE UPDATE ON billing_sub_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_item_categories_updated_at BEFORE UPDATE ON billing_item_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_student_bills_updated_at BEFORE UPDATE ON billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_receipts_updated_at BEFORE UPDATE ON billing_receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_invoices_updated_at BEFORE UPDATE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_discounts_updated_at BEFORE UPDATE ON billing_discounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_refunds_updated_at BEFORE UPDATE ON billing_refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Application & Bug Report triggers
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bug_reports_updated_at BEFORE UPDATE ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bug_report_comments_updated_at BEFORE UPDATE ON bug_report_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Resource Management triggers
CREATE TRIGGER update_resource_categories_updated_at BEFORE UPDATE ON resource_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resource_requests_updated_at BEFORE UPDATE ON resource_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sharing_policies_updated_at BEFORE UPDATE ON sharing_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_resource_categories_updated_at BEFORE UPDATE ON digital_resource_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_resources_updated_at BEFORE UPDATE ON digital_resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_reservations_updated_at BEFORE UPDATE ON digital_reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_resource_requests_updated_at BEFORE UPDATE ON digital_resource_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Timetabling triggers
CREATE TRIGGER update_periods_updated_at BEFORE UPDATE ON periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timetables_updated_at BEFORE UPDATE ON timetables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timetable_slots_updated_at BEFORE UPDATE ON timetable_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timetable_periods_updated_at BEFORE UPDATE ON timetable_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timetable_leaves_updated_at BEFORE UPDATE ON timetable_leaves
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_plans_updated_at BEFORE UPDATE ON staff_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Attendance triggers
CREATE TRIGGER update_student_attendance_updated_at BEFORE UPDATE ON student_attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Dashboard triggers
CREATE TRIGGER update_dashboard_widget_types_updated_at BEFORE UPDATE ON dashboard_widget_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_configurations_updated_at BEFORE UPDATE ON dashboard_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_widgets_updated_at BEFORE UPDATE ON dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subcategories_updated_at BEFORE UPDATE ON subcategories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Billing sequence triggers
CREATE TRIGGER generate_receipt_number BEFORE INSERT ON billing_receipts
  FOR EACH ROW WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
  EXECUTE FUNCTION update_receipt_number_sequence();

CREATE TRIGGER generate_invoice_number BEFORE INSERT ON billing_invoices
  FOR EACH ROW WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION update_invoice_number_sequence();

-- Billing balance update triggers
CREATE TRIGGER update_bill_balance_after_payment AFTER INSERT ON billing_receipt_items
  FOR EACH ROW EXECUTE FUNCTION update_bill_balance_on_payment();

CREATE TRIGGER update_bill_balance_after_payment_delete AFTER DELETE ON billing_receipt_items
  FOR EACH ROW EXECUTE FUNCTION update_bill_balance_on_payment_delete();

-- Billing discount approval trigger
CREATE TRIGGER handle_discount_approval_trigger BEFORE UPDATE ON billing_discounts
  FOR EACH ROW WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
  EXECUTE FUNCTION handle_discount_approval();

-- Auto invoice generation trigger
CREATE TRIGGER generate_invoice_on_bill_payment AFTER UPDATE ON billing_student_bills
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION generate_invoice_for_paid_bills(); 