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
-- SECTION 6: STARTUP STUDIO / DEMO DAY VIEWS
-- Added: 2026-03-08
-- ================================================================================

-- ─── View: appathon_leaderboard ───────────────────────────────────────────
-- Added: 2026-03-08 - Unified leaderboard using verified scores when available.
-- Updated: 2026-03-18 - Fixed duplicate rows caused by multiple evaluators per submission.
--   Uses LEFT JOIN LATERAL to pick the single best verification (highest score, then most recent)
--   per submission, ensuring exactly one leaderboard row per team.
-- Verified scores are ONLY used when verification_status IN ('verified','flagged','disqualified').
-- A 'pending' verification (score=0 default) falls back to self-reported scores to prevent
-- rank inversions mid-evaluation.
CREATE OR REPLACE VIEW appathon_leaderboard AS
WITH resolved AS (
    SELECT
        es.id                AS submission_id,
        er.id                AS team_id,
        er.team_name,
        er.institution_id,
        i.name               AS institution_name,
        er.event_id,
        es.app_name,
        es.live_app_url,
        es.category,
        av.verification_status,
        av.presented,
        av.evaluator_id,
        av.created_at        AS verified_at,
        eva.manual_name      AS venue_name,
        -- Use verified values only when evaluation is complete (not 'pending')
        CASE WHEN av.verification_status IN ('verified', 'flagged', 'disqualified')
            THEN av.verified_tier      ELSE es.tier_level          END AS verified_tier,
        CASE WHEN av.verification_status IN ('verified', 'flagged', 'disqualified')
            THEN av.revenue_bonus      ELSE es.mrr_bonus_points     END AS revenue_bonus,
        CASE WHEN av.verification_status IN ('verified', 'flagged', 'disqualified')
            THEN av.total_score        ELSE es.total_score          END AS total_score,
        CASE WHEN av.verification_status IN ('verified', 'flagged', 'disqualified')
            THEN av.verified_users     ELSE es.user_count           END AS verified_users,
        CASE WHEN av.verification_status IN ('verified', 'flagged', 'disqualified')
            THEN av.verified_active_users ELSE es.active_users_count END AS verified_active_users,
        CASE WHEN av.verification_status IN ('verified', 'flagged', 'disqualified')
            THEN av.verified_revenue   ELSE es.mrr_amount           END AS verified_revenue
    FROM event_submissions es
    JOIN event_registrations er ON es.registration_id = er.id
    LEFT JOIN institutions i ON er.institution_id = i.id
    -- Pick only the single best verification per submission:
    -- Priority: highest total_score, then most recent created_at.
    -- This prevents duplicate leaderboard rows when multiple evaluators verify the same team.
    LEFT JOIN LATERAL (
        SELECT av2.*
        FROM appathon_verifications av2
        WHERE av2.submission_id = es.id
        ORDER BY av2.total_score DESC, av2.created_at DESC
        LIMIT 1
    ) av ON true
    LEFT JOIN event_venue_assignments eva ON av.venue_id = eva.id
    WHERE es.submitted_at IS NOT NULL
)
SELECT
    submission_id,
    team_id,
    team_name,
    institution_id,
    institution_name,
    event_id,
    app_name,
    live_app_url,
    category,
    verified_tier,
    -- Tier 5 (old self-reported system) maps to 0 intentionally — verified system only uses T1-T4
    CASE verified_tier
        WHEN 4 THEN 50
        WHEN 3 THEN 40
        WHEN 2 THEN 25
        WHEN 1 THEN 10
        ELSE 0
    END                      AS tier_points,
    revenue_bonus,
    total_score,
    verified_users,
    verified_active_users,
    verified_revenue,
    verification_status,
    presented,
    evaluator_id,
    verified_at,
    venue_name,
    -- College rank (within same institution). RANK() returns bigint; PostgREST maps to JSON number.
    RANK() OVER (
        PARTITION BY institution_id
        ORDER BY total_score DESC, verified_active_users DESC, verified_revenue DESC
    ) AS college_rank,
    -- Overall rank (across all institutions)
    RANK() OVER (
        ORDER BY total_score DESC, verified_active_users DESC, verified_revenue DESC
    ) AS overall_rank
FROM resolved;

-- ─── View: evaluator_progress ─────────────────────────────────────────────
-- Added: 2026-03-08 - Tracks verification completion per evaluator per venue.
-- total_teams counts only teams that have a submission (those without cannot be verified).
-- Used by admin on the demo-day page to monitor evaluator progress.
CREATE OR REPLACE VIEW evaluator_progress AS
SELECT
    esa.staff_id,
    s.profile_id                                         AS evaluator_profile_id,
    p.full_name                                          AS evaluator_name,
    esa.venue_assignment_id                              AS venue_id,
    eva.manual_name                                      AS venue_name,
    esa.event_id,
    -- Only count teams that have a submission (teams without submissions can never be verified)
    COUNT(DISTINCT CASE WHEN es.id IS NOT NULL THEN etva.registration_id END) AS total_teams,
    COUNT(DISTINCT av.submission_id)                     AS verified_count,
    COUNT(DISTINCT CASE WHEN es.id IS NOT NULL THEN etva.registration_id END)
        - COUNT(DISTINCT av.submission_id)               AS remaining
FROM event_staff_assignments esa
JOIN staff s ON s.id = esa.staff_id
JOIN profiles p ON p.id = s.profile_id
JOIN event_venue_assignments eva ON eva.id = esa.venue_assignment_id
JOIN event_team_venue_allocations etva
    ON etva.venue_assignment_id = esa.venue_assignment_id
    AND etva.day_type = 'demo_day'
LEFT JOIN event_submissions es ON es.registration_id = etva.registration_id
LEFT JOIN appathon_verifications av
    ON av.submission_id = es.id
    AND av.evaluator_id = s.profile_id
    AND av.verification_status IN ('verified', 'flagged', 'disqualified')
WHERE eva.day_type = 'demo_day'
  AND esa.role IN ('judge', 'panel_chair', 'evaluator')
  AND esa.day_type = 'demo_day'
GROUP BY esa.staff_id, s.profile_id, p.full_name,
         esa.venue_assignment_id, eva.manual_name, esa.event_id;

-- ─── Audience Vote Summary (Demo Day Live Voting) ─────────────────────────
-- Updated: 2026-03-08 - Added audience_vote_summary view for Demo Day live voting
-- Aggregates total votes and average star rating per submission per event.
-- Used by the leaderboard, evaluate table vote columns, and vote page.
CREATE OR REPLACE VIEW audience_vote_summary AS
SELECT
  av.submission_id,
  av.event_id,
  COUNT(*)                          AS total_votes,
  ROUND(AVG(av.rating)::numeric, 1) AS average_rating
FROM audience_votes av
GROUP BY av.submission_id, av.event_id;

-- ================================================================================
-- End of Views File
-- Total Views: 15 (3 billing + 2 bug-report + 2 academic + 2 compatibility
--               + 1 lifecycle materialized + 2 demo-day regular views
--               + 1 audience vote summary)
-- ================================================================================