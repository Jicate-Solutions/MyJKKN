-- ================================================================================
-- MYJKKN DATABASE VIEWS
-- Generated: 2025-01-17
-- Description: All database views organized by module
-- ================================================================================

-- ================================================================================
-- SECTION 1: BILLING MODULE VIEWS
-- ================================================================================

-- Auto-generated invoices view
-- Shows bills that have auto-generated invoices
CREATE OR REPLACE VIEW auto_generated_invoices AS
SELECT 
    b.id AS bill_id,
    b.student_id,
    s.first_name || ' ' || s.last_name AS student_name,
    s.roll_number,
    b.bill_description,
    b.bill_amount,
    b.due_date,
    b.status AS bill_status,
    i.id AS invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.invoice_type,
    i.total_amount AS invoice_amount,
    CASE 
        WHEN i.id IS NOT NULL THEN 'Generated'
        WHEN b.auto_generate_invoice = true THEN 'Pending'
        ELSE 'Not Required'
    END AS invoice_status
FROM billing_student_bills b
JOIN students s ON b.student_id = s.id
LEFT JOIN billing_invoices i ON i.student_id = s.id 
    AND i.metadata->>'bill_id' = b.id::text
WHERE b.auto_generate_invoice = true
ORDER BY b.created_at DESC;

-- Bill invoice relationships view
-- Shows the relationship between bills, invoices, and receipts
CREATE OR REPLACE VIEW bill_invoice_relationships AS
SELECT 
    b.id AS bill_id,
    b.student_id,
    s.first_name || ' ' || s.last_name AS student_name,
    s.roll_number,
    b.bill_description,
    b.bill_amount,
    b.bill_balance,
    b.status AS bill_status,
    b.due_date,
    -- Invoice information
    i.id AS invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.total_amount AS invoice_amount,
    -- Receipt information through invoice items
    ii.receipt_id,
    r.receipt_number,
    r.receipt_date,
    r.total_amount AS receipt_amount,
    r.payment_method,
    -- Payment summary
    COALESCE(SUM(ri.amount_paid) OVER (PARTITION BY b.id), 0) AS total_paid,
    b.bill_amount - COALESCE(SUM(ri.amount_paid) OVER (PARTITION BY b.id), 0) AS outstanding_amount
FROM billing_student_bills b
JOIN students s ON b.student_id = s.id
LEFT JOIN billing_invoices i ON i.student_id = s.id
LEFT JOIN billing_invoice_items ii ON ii.invoice_id = i.id
LEFT JOIN billing_receipts r ON r.id = ii.receipt_id
LEFT JOIN billing_receipt_items ri ON ri.bill_id = b.id
ORDER BY b.created_at DESC, i.invoice_date DESC, r.receipt_date DESC;

-- Bill details view
CREATE OR REPLACE VIEW v_bill_details AS
SELECT 
    b.id,
    b.student_id,
    b.institution_id,
    b.item_category_id,
    b.bill_description,
    b.due_date,
    b.quantity,
    b.unit_amount,
    b.total_amount,
    b.tax_amount,
    b.final_amount,
    b.status,
    b.payment_date,
    b.balance_amount,
    b.remarks,
    b.is_recurring,
    b.recurrence_pattern,
    b.number_of_recurrences,
    b.created_by,
    b.created_at,
    b.updated_at,
    (s.first_name || ' ' || s.last_name) AS student_name,
    s.roll_number,
    i.name AS institution_name
FROM billing_student_bills b
JOIN students s ON b.student_id = s.id
JOIN institutions i ON b.institution_id = i.id;

-- ================================================================================
-- SECTION 2: BUG REPORT MODULE VIEWS
-- ================================================================================

-- Bug reporters leaderboard view
CREATE OR REPLACE VIEW bug_reporters_leaderboard AS
SELECT 
    p.id AS user_id,
    p.full_name AS user_name,
    p.avatar_url,
    COUNT(br.id) AS resolved_bugs_count
FROM profiles p
JOIN bug_reports br ON p.id = br.reporter_user_id
WHERE br.status = 'resolved'
GROUP BY p.id, p.full_name, p.avatar_url
ORDER BY COUNT(br.id) DESC;

-- Bug reports with details view
CREATE OR REPLACE VIEW bug_reports_with_details AS
SELECT 
    br.id,
    br.created_at,
    br.reporter_user_id,
    br.page_url,
    br.description,
    br.screenshot_url,
    br.console_logs,
    br.status,
    br.resolved_at,
    br.metadata,
    br.display_id,
    br.institution_id,
    br.department_id,
    p.full_name AS reporter_name,
    p.email AS reporter_email,
    p.role AS reporter_role,
    i.name AS institution_name,
    d.department_name,
    d.department_code
FROM bug_reports br
LEFT JOIN profiles p ON br.reporter_user_id = p.id
LEFT JOIN institutions i ON br.institution_id = i.id
LEFT JOIN departments d ON br.department_id = d.id;

-- ================================================================================
-- SECTION 3: ACADEMIC MODULE VIEWS
-- ================================================================================

-- Semester hierarchy health view
CREATE OR REPLACE VIEW semester_hierarchy_health AS
SELECT 
    i.name AS institution_name,
    COUNT(DISTINCT s.id) AS total_students,
    COUNT(DISTINCT CASE 
        WHEN s.semester_id IS NOT NULL THEN s.id 
        ELSE NULL 
    END) AS students_with_semester,
    COUNT(DISTINCT CASE 
        WHEN audit.student_id IS NOT NULL THEN s.id 
        ELSE NULL 
    END) AS inconsistent_students,
    ROUND(
        (COUNT(DISTINCT CASE 
            WHEN s.semester_id IS NOT NULL AND audit.student_id IS NULL THEN s.id 
            ELSE NULL 
        END)::numeric / 
        NULLIF(COUNT(DISTINCT CASE 
            WHEN s.semester_id IS NOT NULL THEN s.id 
            ELSE NULL 
        END), 0)::numeric) * 100, 
        2
    ) AS consistency_percentage
FROM institutions i
LEFT JOIN students s ON i.id = s.institution_id
LEFT JOIN LATERAL audit_semester_program_inconsistencies() audit ON s.id = audit.student_id
GROUP BY i.id, i.name
ORDER BY consistency_percentage;

-- Semester program audit view
CREATE OR REPLACE VIEW semester_program_audit_view AS
SELECT 
    student_id,
    student_name,
    roll_number,
    student_program_id,
    student_program_name,
    semester_id,
    semester_name,
    semester_program_id,
    semester_program_name,
    institution_name,
    inconsistency_type
FROM audit_semester_program_inconsistencies();

-- ================================================================================
-- SECTION 4: LEARNER LIFECYCLE COMPATIBILITY VIEWS
-- Created: 2025-01-18
-- Purpose: Backward compatibility layer for admissions and students tables
-- ================================================================================

-- Admissions VIEW - Maps learners in admission pipeline to old admissions table structure
-- Filters: enquiry, pending, approved, rejected, waitlisted
CREATE OR REPLACE VIEW admissions AS
SELECT
    original_admission_id AS id,
    first_name,
    last_name,
    father_name,
    father_occupation,
    father_mobile,
    mother_name,
    mother_occupation,
    mother_mobile,
    date_of_birth,
    gender,
    religion,
    community,
    caste,
    annual_income,
    last_school,
    board_of_study,
    tenth_marks,
    twelfth_marks,
    medical_cutoff_marks,
    engineering_cutoff_marks,
    neet_roll_number,
    counseling_applied,
    counseling_number,
    first_graduate,
    quota,
    category,
    entry_type,
    permanent_address_street,
    permanent_address_taluk,
    permanent_address_district,
    permanent_address_pin_code,
    permanent_address_state,
    student_mobile,
    student_email,
    accommodation_type,
    hostel_type,
    bus_required,
    bus_route,
    bus_pickup_location,
    reference_type,
    reference_name,
    reference_contact,
    -- Map lifecycle_status back to admission status
    CASE lifecycle_status
        WHEN 'enquiry' THEN 'pending'
        WHEN 'pending' THEN 'pending'
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'waitlisted' THEN 'waitlisted'
        WHEN 'active' THEN 'enrolled'
        ELSE 'pending'
    END AS status,
    created_at,
    updated_at,
    created_by,
    updated_by,
    degree_id,
    department_id,
    program_id,
    institution_id,
    application_id
FROM learners_profiles
WHERE lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted', 'active')
  AND migration_source IN ('admission', 'merged');

-- Students VIEW - Maps active learners to old students table structure
-- Filters: active, inactive, exited, graduated
CREATE OR REPLACE VIEW students AS
SELECT
    original_student_id AS id,
    original_admission_id AS admission_id,
    first_name,
    last_name,
    father_name,
    father_occupation,
    father_mobile,
    mother_name,
    mother_occupation,
    mother_mobile,
    date_of_birth,
    gender,
    religion,
    community,
    caste,
    annual_income,
    last_school,
    board_of_study,
    tenth_marks,
    twelfth_marks,
    medical_cutoff_marks,
    engineering_cutoff_marks,
    neet_roll_number,
    counseling_applied,
    counseling_number,
    first_graduate,
    quota,
    category,
    entry_type,
    permanent_address_street,
    permanent_address_taluk,
    permanent_address_district,
    permanent_address_pin_code,
    permanent_address_state,
    student_mobile,
    student_email,
    accommodation_type,
    hostel_type,
    bus_required,
    bus_route,
    bus_pickup_location,
    reference_type,
    reference_name,
    reference_contact,
    institution_id,
    degree_id,
    department_id,
    program_id,
    semester_id,
    section_id,
    academic_year_id,
    roll_number,
    college_email,
    student_photo_url,
    is_profile_complete,
    -- Map lifecycle_status back to student_status ENUM
    CASE lifecycle_status
        WHEN 'active' THEN 'active'::student_status
        WHEN 'inactive' THEN 'inactive'::student_status
        WHEN 'graduated' THEN 'graduated'::student_status
        WHEN 'exited' THEN 'dropped'::student_status
        ELSE 'active'::student_status
    END AS status,
    created_at,
    updated_at,
    created_by,
    updated_by,
    application_id
FROM learners_profiles
WHERE lifecycle_status IN ('active', 'inactive', 'exited', 'graduated')
  AND migration_source IN ('student', 'merged');

-- ================================================================================
-- SECTION 5: LIFECYCLE ANALYTICS MATERIALIZED VIEW
-- Updated: 2026-02-06
-- ================================================================================

-- mv_lifecycle_dashboard: Refreshed every 5 minutes via pg_cron
-- Dashboard reads from this view, not raw usage_events table
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_lifecycle_dashboard AS
SELECT
    institution_id,
    module,
    COUNT(*) AS event_count_24h,
    COUNT(DISTINCT user_id) AS unique_users_24h,
    SUM(weight) AS weighted_score_24h,
    COUNT(*) FILTER (WHERE event_type IN ('create', 'update', 'delete')) AS crud_count_24h,
    COUNT(*) FILTER (WHERE event_type = 'export') AS export_count_24h,
    jsonb_object_agg(DISTINCT role, true) FILTER (WHERE role IS NOT NULL) AS active_roles
FROM usage_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY institution_id, module;

-- Index on the materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_lifecycle_dashboard_inst_module
    ON mv_lifecycle_dashboard(institution_id, module);

-- ================================================================================
-- End of Views File
-- Total Views: 10 (7 original + 2 compatibility views + 1 lifecycle materialized view)
-- ================================================================================