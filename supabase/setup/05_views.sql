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
-- End of Views File
-- Total Views: 7
-- ================================================================================