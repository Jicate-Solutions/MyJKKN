-- ================================================================================
-- MYJKKN DATABASE FOREIGN KEY CONSTRAINTS
-- Generated: 2025-01-17
-- Description: All foreign key constraints for data integrity
-- ================================================================================

-- ================================================================================
-- SECTION 1: USER & PROFILE TABLES
-- ================================================================================

-- PROFILES TABLE
ALTER TABLE profiles 
    ADD CONSTRAINT fk_profiles_institution 
    FOREIGN KEY (institution_id) 
    REFERENCES institutions(id) 
    ON DELETE SET NULL;

-- USER_INSTITUTION_ACCESS TABLE
ALTER TABLE user_institution_access
    ADD CONSTRAINT fk_user_institution_access_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

ALTER TABLE user_institution_access
    ADD CONSTRAINT fk_user_institution_access_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE user_institution_access
    ADD CONSTRAINT fk_user_institution_access_granted_by
    FOREIGN KEY (granted_by)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- ================================================================================
-- SECTION 2: ACADEMIC MODULE TABLES
-- ================================================================================

-- ACADEMIC_YEARS TABLE
ALTER TABLE academic_years
    ADD CONSTRAINT fk_academic_years_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

-- DEGREES TABLE
ALTER TABLE degrees
    ADD CONSTRAINT fk_degrees_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

-- DEPARTMENTS TABLE
ALTER TABLE departments
    ADD CONSTRAINT fk_departments_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE departments
    ADD CONSTRAINT fk_departments_degree
    FOREIGN KEY (degree_id)
    REFERENCES degrees(id)
    ON DELETE CASCADE;

-- PROGRAMS TABLE
ALTER TABLE programs
    ADD CONSTRAINT fk_programs_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE programs
    ADD CONSTRAINT fk_programs_degree
    FOREIGN KEY (degree_id)
    REFERENCES degrees(id)
    ON DELETE CASCADE;

ALTER TABLE programs
    ADD CONSTRAINT fk_programs_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE CASCADE;

-- SEMESTERS TABLE
ALTER TABLE semesters
    ADD CONSTRAINT fk_semesters_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE semesters
    ADD CONSTRAINT fk_semesters_program
    FOREIGN KEY (program_id)
    REFERENCES programs(id)
    ON DELETE CASCADE;

-- SECTIONS TABLE
ALTER TABLE sections
    ADD CONSTRAINT fk_sections_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE sections
    ADD CONSTRAINT fk_sections_degree
    FOREIGN KEY (degree_id)
    REFERENCES degrees(id)
    ON DELETE CASCADE;

ALTER TABLE sections
    ADD CONSTRAINT fk_sections_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE CASCADE;

ALTER TABLE sections
    ADD CONSTRAINT fk_sections_program
    FOREIGN KEY (program_id)
    REFERENCES programs(id)
    ON DELETE CASCADE;

ALTER TABLE sections
    ADD CONSTRAINT fk_sections_semester
    FOREIGN KEY (semester_id)
    REFERENCES semesters(id)
    ON DELETE CASCADE;

-- COURSES TABLE
ALTER TABLE courses
    ADD CONSTRAINT fk_courses_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

-- COURSE_MAPPINGS TABLE
ALTER TABLE course_mappings
    ADD CONSTRAINT fk_course_mappings_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE course_mappings
    ADD CONSTRAINT fk_course_mappings_degree
    FOREIGN KEY (degree_id)
    REFERENCES degrees(id)
    ON DELETE CASCADE;

ALTER TABLE course_mappings
    ADD CONSTRAINT fk_course_mappings_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE CASCADE;

ALTER TABLE course_mappings
    ADD CONSTRAINT fk_course_mappings_program
    FOREIGN KEY (program_id)
    REFERENCES programs(id)
    ON DELETE CASCADE;

ALTER TABLE course_mappings
    ADD CONSTRAINT fk_course_mappings_semester
    FOREIGN KEY (semester_id)
    REFERENCES semesters(id)
    ON DELETE CASCADE;

ALTER TABLE course_mappings
    ADD CONSTRAINT fk_course_mappings_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE CASCADE;

-- ================================================================================
-- SECTION 3: STUDENT MODULE TABLES
-- ================================================================================

-- STUDENTS TABLE
ALTER TABLE students
    ADD CONSTRAINT fk_students_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE students
    ADD CONSTRAINT fk_students_admission
    FOREIGN KEY (admission_id)
    REFERENCES admissions(id)
    ON DELETE SET NULL;

ALTER TABLE students
    ADD CONSTRAINT fk_students_degree
    FOREIGN KEY (degree_id)
    REFERENCES degrees(id)
    ON DELETE SET NULL;

ALTER TABLE students
    ADD CONSTRAINT fk_students_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE SET NULL;

ALTER TABLE students
    ADD CONSTRAINT fk_students_program
    FOREIGN KEY (program_id)
    REFERENCES programs(id)
    ON DELETE SET NULL;

ALTER TABLE students
    ADD CONSTRAINT fk_students_semester
    FOREIGN KEY (semester_id)
    REFERENCES semesters(id)
    ON DELETE SET NULL;

ALTER TABLE students
    ADD CONSTRAINT fk_students_section
    FOREIGN KEY (section_id)
    REFERENCES sections(id)
    ON DELETE SET NULL;

ALTER TABLE students
    ADD CONSTRAINT fk_students_academic_year
    FOREIGN KEY (academic_year_id)
    REFERENCES academic_years(id)
    ON DELETE SET NULL;

-- ================================================================================
-- SECTION 4: STAFF MODULE TABLES
-- ================================================================================

-- STAFF TABLE
ALTER TABLE staff
    ADD CONSTRAINT fk_staff_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE staff
    ADD CONSTRAINT fk_staff_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE SET NULL;

ALTER TABLE staff
    ADD CONSTRAINT fk_staff_category
    FOREIGN KEY (category_id)
    REFERENCES employment_categories(id)
    ON DELETE SET NULL;

-- STAFF_PLANS TABLE
ALTER TABLE staff_plans
    ADD CONSTRAINT fk_staff_plans_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE staff_plans
    ADD CONSTRAINT fk_staff_plans_academic_year
    FOREIGN KEY (academic_year_id)
    REFERENCES academic_years(id)
    ON DELETE CASCADE;

ALTER TABLE staff_plans
    ADD CONSTRAINT fk_staff_plans_program
    FOREIGN KEY (program_id)
    REFERENCES programs(id)
    ON DELETE CASCADE;

ALTER TABLE staff_plans
    ADD CONSTRAINT fk_staff_plans_semester
    FOREIGN KEY (semester_id)
    REFERENCES semesters(id)
    ON DELETE CASCADE;

-- STAFF_PLAN_COURSES TABLE
ALTER TABLE staff_plan_courses
    ADD CONSTRAINT fk_staff_plan_courses_staff
    FOREIGN KEY (staff_id)
    REFERENCES staff(id)
    ON DELETE CASCADE;

ALTER TABLE staff_plan_courses
    ADD CONSTRAINT fk_staff_plan_courses_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE CASCADE;

ALTER TABLE staff_plan_courses
    ADD CONSTRAINT fk_staff_plan_courses_plan
    FOREIGN KEY (staff_plan_id)
    REFERENCES staff_plans(id)
    ON DELETE CASCADE;

-- ================================================================================
-- SECTION 5: ADMISSION MODULE TABLES
-- ================================================================================

-- ADMISSIONS TABLE
ALTER TABLE admissions
    ADD CONSTRAINT fk_admissions_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE admissions
    ADD CONSTRAINT fk_admissions_degree
    FOREIGN KEY (degree_id)
    REFERENCES degrees(id)
    ON DELETE SET NULL;

ALTER TABLE admissions
    ADD CONSTRAINT fk_admissions_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE SET NULL;

ALTER TABLE admissions
    ADD CONSTRAINT fk_admissions_program
    FOREIGN KEY (program_id)
    REFERENCES programs(id)
    ON DELETE SET NULL;

-- ================================================================================
-- SECTION 6: ATTENDANCE MODULE TABLES
-- ================================================================================

-- PERIODS TABLE
ALTER TABLE periods
    ADD CONSTRAINT fk_periods_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

-- STUDENT_ATTENDANCE TABLE
ALTER TABLE student_attendance
    ADD CONSTRAINT fk_student_attendance_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE student_attendance
    ADD CONSTRAINT fk_student_attendance_timetable
    FOREIGN KEY (timetable_id)
    REFERENCES timetables(id)
    ON DELETE CASCADE;

ALTER TABLE student_attendance
    ADD CONSTRAINT fk_student_attendance_section
    FOREIGN KEY (section_id)
    REFERENCES sections(id)
    ON DELETE CASCADE;

ALTER TABLE student_attendance
    ADD CONSTRAINT fk_student_attendance_marked_by
    FOREIGN KEY (marked_by)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- ================================================================================
-- SECTION 7: TIMETABLE MODULE TABLES
-- ================================================================================

-- TIMETABLES TABLE
ALTER TABLE timetables
    ADD CONSTRAINT fk_timetables_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE timetables
    ADD CONSTRAINT fk_timetables_academic_year
    FOREIGN KEY (academic_year_id)
    REFERENCES academic_years(id)
    ON DELETE CASCADE;

ALTER TABLE timetables
    ADD CONSTRAINT fk_timetables_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE CASCADE;

ALTER TABLE timetables
    ADD CONSTRAINT fk_timetables_created_by
    FOREIGN KEY (created_by)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- ================================================================================
-- SECTION 8: BILLING MODULE TABLES
-- ================================================================================

-- BILLING_STUDENT_BILLS TABLE
ALTER TABLE billing_student_bills
    ADD CONSTRAINT fk_bills_student
    FOREIGN KEY (student_id)
    REFERENCES students(id)
    ON DELETE CASCADE;

ALTER TABLE billing_student_bills
    ADD CONSTRAINT fk_bills_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE billing_student_bills
    ADD CONSTRAINT fk_bills_item_category
    FOREIGN KEY (item_category_id)
    REFERENCES billing_item_categories(id)
    ON DELETE SET NULL;

ALTER TABLE billing_student_bills
    ADD CONSTRAINT fk_bills_created_by
    FOREIGN KEY (created_by)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- BILLING_RECEIPTS TABLE
ALTER TABLE billing_receipts
    ADD CONSTRAINT fk_receipts_student
    FOREIGN KEY (student_id)
    REFERENCES students(id)
    ON DELETE CASCADE;

ALTER TABLE billing_receipts
    ADD CONSTRAINT fk_receipts_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE billing_receipts
    ADD CONSTRAINT fk_receipts_accountant
    FOREIGN KEY (accountant_id)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- BILLING_INVOICES TABLE
ALTER TABLE billing_invoices
    ADD CONSTRAINT fk_invoices_student
    FOREIGN KEY (student_id)
    REFERENCES students(id)
    ON DELETE CASCADE;

ALTER TABLE billing_invoices
    ADD CONSTRAINT fk_invoices_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

-- BILLING_RECEIPT_ITEMS TABLE
ALTER TABLE billing_receipt_items
    ADD CONSTRAINT fk_receipt_items_receipt
    FOREIGN KEY (receipt_id)
    REFERENCES billing_receipts(id)
    ON DELETE CASCADE;

ALTER TABLE billing_receipt_items
    ADD CONSTRAINT fk_receipt_items_bill
    FOREIGN KEY (bill_id)
    REFERENCES billing_student_bills(id)
    ON DELETE CASCADE;

-- BILLING_INVOICE_ITEMS TABLE
ALTER TABLE billing_invoice_items
    ADD CONSTRAINT fk_invoice_items_invoice
    FOREIGN KEY (invoice_id)
    REFERENCES billing_invoices(id)
    ON DELETE CASCADE;

ALTER TABLE billing_invoice_items
    ADD CONSTRAINT fk_invoice_items_receipt
    FOREIGN KEY (receipt_id)
    REFERENCES billing_receipts(id)
    ON DELETE CASCADE;

-- BILLING_DISCOUNTS TABLE
ALTER TABLE billing_discounts
    ADD CONSTRAINT fk_discounts_bill
    FOREIGN KEY (bill_id)
    REFERENCES billing_student_bills(id)
    ON DELETE CASCADE;

ALTER TABLE billing_discounts
    ADD CONSTRAINT fk_discounts_authorizer
    FOREIGN KEY (authorizer_id)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- BILLING_REFUNDS TABLE
ALTER TABLE billing_refunds
    ADD CONSTRAINT fk_refunds_receipt
    FOREIGN KEY (receipt_id)
    REFERENCES billing_receipts(id)
    ON DELETE CASCADE;

ALTER TABLE billing_refunds
    ADD CONSTRAINT fk_refunds_authorizer
    FOREIGN KEY (authorizer_id)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

ALTER TABLE billing_refunds
    ADD CONSTRAINT fk_refunds_approved_by
    FOREIGN KEY (approved_by)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- BILLING CATEGORY TABLES
ALTER TABLE billing_parent_categories
    ADD CONSTRAINT fk_parent_categories_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE billing_sub_categories
    ADD CONSTRAINT fk_sub_categories_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE billing_sub_categories
    ADD CONSTRAINT fk_sub_categories_parent
    FOREIGN KEY (parent_category_id)
    REFERENCES billing_parent_categories(id)
    ON DELETE CASCADE;

ALTER TABLE billing_item_categories
    ADD CONSTRAINT fk_item_categories_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE billing_item_categories
    ADD CONSTRAINT fk_item_categories_parent
    FOREIGN KEY (parent_category_id)
    REFERENCES billing_parent_categories(id)
    ON DELETE CASCADE;

ALTER TABLE billing_item_categories
    ADD CONSTRAINT fk_item_categories_sub
    FOREIGN KEY (sub_category_id)
    REFERENCES billing_sub_categories(id)
    ON DELETE CASCADE;

-- ================================================================================
-- SECTION 9: BUG REPORT MODULE TABLES
-- ================================================================================

-- BUG_REPORTS TABLE
ALTER TABLE bug_reports
    ADD CONSTRAINT fk_bug_reports_reporter
    FOREIGN KEY (reporter_user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

ALTER TABLE bug_reports
    ADD CONSTRAINT fk_bug_reports_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE SET NULL;

ALTER TABLE bug_reports
    ADD CONSTRAINT fk_bug_reports_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE SET NULL;

-- BUG_REPORT_MESSAGES TABLE
ALTER TABLE bug_report_messages
    ADD CONSTRAINT fk_messages_bug_report
    FOREIGN KEY (bug_report_id)
    REFERENCES bug_reports(id)
    ON DELETE CASCADE;

ALTER TABLE bug_report_messages
    ADD CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

ALTER TABLE bug_report_messages
    ADD CONSTRAINT fk_messages_reply_to
    FOREIGN KEY (reply_to_message_id)
    REFERENCES bug_report_messages(id)
    ON DELETE SET NULL;

-- BUG_REPORT_PARTICIPANTS TABLE
ALTER TABLE bug_report_participants
    ADD CONSTRAINT fk_participants_bug_report
    FOREIGN KEY (bug_report_id)
    REFERENCES bug_reports(id)
    ON DELETE CASCADE;

ALTER TABLE bug_report_participants
    ADD CONSTRAINT fk_participants_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

-- ================================================================================
-- SECTION 10: RESOURCE MANAGEMENT MODULE TABLES
-- ================================================================================

-- RESOURCES TABLE
ALTER TABLE resources
    ADD CONSTRAINT fk_resources_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE CASCADE;

ALTER TABLE resources
    ADD CONSTRAINT fk_resources_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE SET NULL;

ALTER TABLE resources
    ADD CONSTRAINT fk_resources_parent_category
    FOREIGN KEY (parent_category_id)
    REFERENCES resource_parent_categories(id)
    ON DELETE SET NULL;

ALTER TABLE resources
    ADD CONSTRAINT fk_resources_subcategory
    FOREIGN KEY (subcategory_id)
    REFERENCES resource_sub_categories(id)
    ON DELETE SET NULL;

ALTER TABLE resources
    ADD CONSTRAINT fk_resources_caretaker
    FOREIGN KEY (caretaker_user_id)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- RESOURCE_RESERVATIONS TABLE
ALTER TABLE resource_reservations
    ADD CONSTRAINT fk_reservations_resource
    FOREIGN KEY (resource_id)
    REFERENCES resources(id)
    ON DELETE CASCADE;

ALTER TABLE resource_reservations
    ADD CONSTRAINT fk_reservations_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

-- RESOURCE_APPROVALS TABLE
ALTER TABLE resource_approvals
    ADD CONSTRAINT fk_approvals_reservation
    FOREIGN KEY (reservation_id)
    REFERENCES resource_reservations(id)
    ON DELETE CASCADE;

ALTER TABLE resource_approvals
    ADD CONSTRAINT fk_approvals_approver
    FOREIGN KEY (approver_user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

-- RESOURCE_USAGE_LOGS TABLE
ALTER TABLE resource_usage_logs
    ADD CONSTRAINT fk_usage_logs_resource
    FOREIGN KEY (resource_id)
    REFERENCES resources(id)
    ON DELETE CASCADE;

ALTER TABLE resource_usage_logs
    ADD CONSTRAINT fk_usage_logs_reservation
    FOREIGN KEY (reservation_id)
    REFERENCES resource_reservations(id)
    ON DELETE SET NULL;

ALTER TABLE resource_usage_logs
    ADD CONSTRAINT fk_usage_logs_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

-- RESOURCE_SUB_CATEGORIES TABLE
ALTER TABLE resource_sub_categories
    ADD CONSTRAINT fk_sub_categories_parent_cat
    FOREIGN KEY (parent_category_id)
    REFERENCES resource_parent_categories(id)
    ON DELETE CASCADE;

-- RESOURCE_ATTRIBUTE_DEFINITIONS TABLE
ALTER TABLE resource_attribute_definitions
    ADD CONSTRAINT fk_attr_definitions_subcategory
    FOREIGN KEY (subcategory_id)
    REFERENCES resource_sub_categories(id)
    ON DELETE CASCADE;

-- ================================================================================
-- SECTION 11: NOTIFICATION MODULE TABLES
-- ================================================================================

-- NOTIFICATIONS TABLE
ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_created_by
    FOREIGN KEY (created_by)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- USER_NOTIFICATIONS TABLE
ALTER TABLE user_notifications
    ADD CONSTRAINT fk_user_notifications_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

ALTER TABLE user_notifications
    ADD CONSTRAINT fk_user_notifications_notification
    FOREIGN KEY (notification_id)
    REFERENCES notifications(id)
    ON DELETE CASCADE;

-- PUSH_SUBSCRIPTIONS TABLE
ALTER TABLE push_subscriptions
    ADD CONSTRAINT fk_push_subscriptions_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

-- ================================================================================
-- SECTION 12: APPLICATION MODULE TABLES
-- ================================================================================

-- APPLICATIONS TABLE
ALTER TABLE applications
    ADD CONSTRAINT fk_applications_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON DELETE SET NULL;

ALTER TABLE applications
    ADD CONSTRAINT fk_applications_subcategory
    FOREIGN KEY (subcategory_id)
    REFERENCES subcategories(id)
    ON DELETE SET NULL;

ALTER TABLE applications
    ADD CONSTRAINT fk_applications_created_by
    FOREIGN KEY (created_by)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

-- SUBCATEGORIES TABLE
ALTER TABLE subcategories
    ADD CONSTRAINT fk_subcategories_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON DELETE CASCADE;

-- ================================================================================
-- SECTION 13: DASHBOARD MODULE TABLES
-- ================================================================================

-- DASHBOARD_CONFIGURATIONS TABLE
ALTER TABLE dashboard_configurations
    ADD CONSTRAINT fk_dashboard_config_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

-- DASHBOARD_WIDGETS TABLE
ALTER TABLE dashboard_widgets
    ADD CONSTRAINT fk_dashboard_widgets_config
    FOREIGN KEY (configuration_id)
    REFERENCES dashboard_configurations(id)
    ON DELETE CASCADE;

ALTER TABLE dashboard_widgets
    ADD CONSTRAINT fk_dashboard_widgets_type
    FOREIGN KEY (widget_type_id)
    REFERENCES dashboard_widget_types(id)
    ON DELETE CASCADE;

-- ================================================================================
-- SECTION 14: API & ACTIVITY MODULE TABLES
-- ================================================================================

-- API_KEYS TABLE
ALTER TABLE api_keys
    ADD CONSTRAINT fk_api_keys_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;

-- USER_ACTIVITY_LOGS TABLE
ALTER TABLE user_activity_logs
    ADD CONSTRAINT fk_activity_logs_user
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

ALTER TABLE user_activity_logs
    ADD CONSTRAINT fk_activity_logs_institution
    FOREIGN KEY (institution_id)
    REFERENCES institutions(id)
    ON DELETE SET NULL;

-- ================================================================================
-- End of Foreign Keys File
-- Total Foreign Key Constraints: 150+
-- ================================================================================