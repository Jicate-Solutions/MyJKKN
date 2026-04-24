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
-- Updated: 2026-03-20 - Added category, attachment_urls columns required for filtering and BugReport type
-- Updated: 2026-03-23 - Added module_name (appended at end per CREATE OR REPLACE VIEW column-order constraint)
-- Updated: 2026-03-23 - Added sub_module_name for sub-module grouping (e.g. academic/leave-calendar)
CREATE OR REPLACE VIEW bug_reports_with_details AS
SELECT
    br.id,
    br.created_at,
    br.reporter_user_id,
    br.page_url,
    br.description,
    br.category,
    br.screenshot_url,
    br.attachment_urls,
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
    d.department_code,
    br.module_name,
    br.sub_module_name
FROM bug_reports br
LEFT JOIN profiles p ON br.reporter_user_id = p.id
LEFT JOIN institutions i ON br.institution_id = i.id
LEFT JOIN departments d ON br.department_id = d.id;

-- Reporter analytics stats view
-- Updated: 2026-03-20 - New view for per-reporter aggregated statistics in admin analytics tab
-- Updated: 2026-03-20 - Fixed duplicate rows: removed institution_id/department_id from GROUP BY.
--   Previously grouped by (reporter_user_id, institution_id, department_id), causing the same
--   person to appear multiple times if they filed bugs across different departments.
--   Now groups by reporter_user_id only (one row per person).
--   institution_id/department_id are returned via mode() for PostgREST .eq() filtering.
CREATE OR REPLACE VIEW bug_reporter_stats_view AS
SELECT
    br.reporter_user_id,
    COALESCE(p.full_name, 'Deleted User')               AS reporter_name,
    p.email                                              AS reporter_email,
    p.avatar_url,
    COUNT(*)                                             AS total_bugs,
    COUNT(*) FILTER (WHERE br.status = 'resolved')       AS resolved_count,
    COUNT(*) FILTER (WHERE br.status IN ('new', 'seen')) AS pending_count,
    COUNT(*) FILTER (WHERE br.status = 'in_progress')    AS in_progress_count,
    COUNT(*) FILTER (WHERE br.status = 'wont_fix')       AS wont_fix_count,
    ROUND(
        COUNT(*) FILTER (WHERE br.status = 'resolved')::numeric
        / NULLIF(COUNT(*), 0) * 100,
        1
    )                                                    AS resolution_rate,
    mode() WITHIN GROUP (ORDER BY br.category)           AS top_category,
    MAX(br.created_at)                                   AS last_reported_at,
    mode() WITHIN GROUP (ORDER BY br.institution_id)     AS institution_id,
    mode() WITHIN GROUP (ORDER BY br.department_id)      AS department_id
FROM bug_reports br
LEFT JOIN profiles p ON p.id = br.reporter_user_id
WHERE br.reporter_user_id IS NOT NULL
GROUP BY
    br.reporter_user_id,
    p.full_name,
    p.email,
    p.avatar_url;

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
-- Updated: 2026-03-18 - Filter leaderboard to only include teams verified on demo_date.
-- Teams verified on other dates (late/re-evaluations) are excluded from rankings.
-- If demo_date is NULL, all verifications are included (backward compatible).
-- Teams with 0 verified users are excluded — at least 1 user is required to rank.
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
    JOIN startup_events se ON se.id = er.event_id
    LEFT JOIN institutions i ON er.institution_id = i.id
    -- Pick only the single best verification per submission:
    -- Priority: highest total_score, then most recent created_at.
    -- This prevents duplicate leaderboard rows when multiple evaluators verify the same team.
    -- Only consider verifications from the event's demo_date (if set).
    LEFT JOIN LATERAL (
        SELECT av2.*
        FROM appathon_verifications av2
        WHERE av2.submission_id = es.id
          AND (se.demo_date IS NULL OR av2.created_at::date = se.demo_date::date)
        ORDER BY av2.total_score DESC, av2.created_at DESC
        LIMIT 1
    ) av ON true
    LEFT JOIN event_venue_assignments eva ON av.venue_id = eva.id
    WHERE es.submitted_at IS NOT NULL
      -- Only include teams that were actually verified on demo_date (when demo_date is set)
      AND (se.demo_date IS NULL OR av.id IS NOT NULL)
      -- Exclude teams with 0 verified users — at least 1 user required to appear on leaderboard
      AND COALESCE(
        CASE WHEN av.verification_status IN ('verified', 'flagged', 'disqualified')
          THEN av.verified_users ELSE es.user_count END,
        0
      ) >= 1
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
-- SECTION: VAC + CASE Module Views (Added: 2026-04-02)
-- ================================================================================

-- 1. Enrollment details with course and user info
CREATE OR REPLACE VIEW vac_enrollments_with_details AS
SELECT
  e.id,
  e.user_id,
  e.course_id,
  e.enrolled_at,
  e.status,
  e.payment_status,
  e.payment_amount,
  e.payment_date,
  e.payment_reference,
  e.completed_at,
  e.expires_at,
  e.created_at,
  e.updated_at,
  c.code AS course_code,
  c.name AS course_name,
  c.institution AS course_institution,
  c.track AS course_track,
  c.duration_hours AS course_duration,
  c.fee AS course_fee,
  c.institution_id AS course_institution_id,
  p.full_name AS user_name,
  p.email AS user_email
FROM vac_enrollments e
JOIN vac_courses c ON e.course_id = c.id
LEFT JOIN profiles p ON e.user_id = p.id;

-- 2. CASE risk calculator — computes risk metrics per learner
CREATE OR REPLACE VIEW case_risk_calculator AS
SELECT
  clp.user_id,
  clp.programme_id,
  clp.institution_id,
  clp.current_semester,
  clp.tracks_completed,
  clp.graduation_ready,
  clp.estimated_exam_date,
  clp.risk_level,
  clp.agency_index,
  cgr.programme_duration_semesters,
  cgr.programme_duration_semesters - clp.current_semester AS semesters_remaining,
  6 - clp.tracks_completed AS tracks_remaining,
  CEIL(
    (6 - clp.tracks_completed)::NUMERIC
    / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)::NUMERIC
  ) AS tracks_per_semester_needed,
  CASE
    WHEN clp.tracks_completed >= 6 THEN 'completed'
    WHEN cgr.programme_duration_semesters - clp.current_semester <= 0
      AND clp.tracks_completed < 6 THEN 'overdue'
    WHEN CEIL((6 - clp.tracks_completed)::NUMERIC
      / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)::NUMERIC) >= 3 THEN 'critical'
    WHEN CEIL((6 - clp.tracks_completed)::NUMERIC
      / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)::NUMERIC) >= 2 THEN 'at_risk'
    ELSE 'on_track'
  END AS calculated_risk_level
FROM case_learner_progress clp
JOIN case_graduation_requirements cgr
  ON cgr.programme_id = clp.programme_id
  AND cgr.institution_id = clp.institution_id
  AND cgr.is_active = true;

-- 3. Graduation readiness — institution-wide aggregation
CREATE OR REPLACE VIEW case_graduation_readiness AS
SELECT
  i.name AS institution_name,
  i.id AS institution_id,
  p.program_name,
  p.id AS programme_id,
  clp.current_semester,
  COUNT(*) AS total_learners,
  COUNT(*) FILTER (WHERE clp.tracks_completed >= 6) AS graduation_ready_count,
  ROUND(
    COUNT(*) FILTER (WHERE clp.tracks_completed >= 6)::NUMERIC
    / GREATEST(COUNT(*), 1)::NUMERIC * 100, 1
  ) AS readiness_percentage,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'at_risk') AS at_risk_count,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'overdue') AS overdue_count,
  ROUND(AVG(clp.tracks_completed), 1) AS avg_tracks_completed,
  ROUND(AVG(clp.total_hours_completed), 1) AS avg_hours_completed
FROM case_learner_progress clp
JOIN institutions i ON i.id = clp.institution_id
JOIN programs p ON p.id = clp.programme_id
LEFT JOIN case_risk_calculator rc
  ON rc.user_id = clp.user_id
  AND rc.programme_id = clp.programme_id
GROUP BY i.name, i.id, p.program_name, p.id, clp.current_semester
ORDER BY i.name, p.program_name, clp.current_semester;

-- ================================================================================
-- MARATHON COMPATIBILITY VIEWS
-- Added: 2026-04-09
-- Purpose: The external kbm-marathon-public site queries marathon_events,
-- marathon_categories, and marathon_registrations. These don't exist as tables.
-- These views map the legacy names to the real shared tables (events,
-- event_categories, events_registrations).
-- The marathon_registrations view has an INSTEAD OF INSERT trigger
-- (see 04_triggers.sql) to allow public site registration inserts.
-- Post-race, the public site should be refactored to use /api/events/marathon/
-- REST endpoints; after that, these views can be dropped.
-- ================================================================================

CREATE OR REPLACE VIEW public.marathon_events AS
  SELECT * FROM public.events WHERE event_type = 'marathon';

CREATE OR REPLACE VIEW public.marathon_categories AS
  SELECT ec.*
  FROM public.event_categories ec
  JOIN public.events e ON e.id = ec.event_id
  WHERE e.event_type = 'marathon';

CREATE OR REPLACE VIEW public.marathon_registrations AS
  SELECT
    id,
    event_id,
    category_id,
    participant_name,
    participant_phone,
    participant_email,
    participant_age,
    participant_gender,
    institution_id,
    institution_name,
    department,
    bib_number,
    status,
    checked_in,
    checked_in_at,
    payment_status,
    payment_amount,
    payment_method,
    payment_reference,
    discount_code,
    discount_amount,
    custom_data,
    source,
    referral_source,
    created_at,
    updated_at
  FROM public.events_registrations;

GRANT SELECT ON public.marathon_events TO anon, authenticated;
GRANT SELECT ON public.marathon_categories TO anon, authenticated;
GRANT SELECT, INSERT ON public.marathon_registrations TO anon, authenticated;

-- ================================================================================
-- End of Views File
-- Total Views: 22 (3 billing + 3 bug-report + 2 academic + 2 compatibility
--               + 1 lifecycle materialized + 2 demo-day regular views
--               + 1 audience vote summary + 3 VAC/CASE views
--               + 3 marathon compat views NEW 2026-04-09)
-- ================================================================================

-- =====================================================
-- Dashboard v2 — Leaderboard Materialized Views
-- Added: 2026-04-15 - Day 1 migration
-- Decisions: Round 1.1 (Calendar day IST), Round 1.2 (median + compliance %),
-- Round 1.4 (frozen lineage), Round 4.13 (min 5 leads, on-leave excluded)
-- Refresh: sla_daily every 5 min, conversion_monthly daily at midnight IST (Phase 2 cron)
-- =====================================================

DROP MATERIALIZED VIEW IF EXISTS v_dashboard_sla_daily;
CREATE MATERIALIZED VIEW v_dashboard_sla_daily AS
SELECT
  al.assigned_counselor_id AS counselor_id,
  p.full_name,
  p.avatar_url,
  al.institution_id,
  i.name AS institution_name,
  COUNT(*) AS lead_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (al.first_touch_at - al.created_at)) / 60.0
  )::numeric(10,1) AS median_minutes_to_first_touch,
  ROUND(
    (COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (al.first_touch_at - al.created_at)) / 3600.0 <= 4))::numeric
    * 100.0 / NULLIF(COUNT(*), 0),
    1
  ) AS compliance_pct,
  DENSE_RANK() OVER (
    ORDER BY PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (al.first_touch_at - al.created_at)) / 60.0
    ) ASC
  ) AS rank_global
FROM admission_leads al
JOIN profiles p ON p.id = al.assigned_counselor_id
JOIN institutions i ON i.id = al.institution_id
WHERE al.first_touch_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::timestamptz
  AND al.first_touch_at IS NOT NULL
  AND al.assigned_counselor_id IS NOT NULL
  AND p.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM hr_leave_applications hla
    WHERE hla.employee_id = p.id
      AND hla.status = 'approved'
      AND CURRENT_DATE BETWEEN hla.start_date AND hla.end_date
  )
GROUP BY al.assigned_counselor_id, p.full_name, p.avatar_url, al.institution_id, i.name
HAVING COUNT(*) >= 5;
CREATE UNIQUE INDEX idx_v_dashboard_sla_daily_counselor ON v_dashboard_sla_daily (counselor_id);
CREATE INDEX idx_v_dashboard_sla_daily_institution ON v_dashboard_sla_daily (institution_id);

DROP MATERIALIZED VIEW IF EXISTS v_dashboard_conversion_monthly;
CREATE MATERIALIZED VIEW v_dashboard_conversion_monthly AS
SELECT
  al.assigned_counselor_id AS counselor_id,
  p.full_name,
  p.avatar_url,
  al.institution_id,
  i.name AS institution_name,
  COUNT(*) AS lead_count,
  COUNT(*) FILTER (
    WHERE al.funnel_stage::text IN ('enrolled', 'offer_accepted', 'token_paid', 'confirmed')
  ) AS converted_count,
  ROUND(
    (COUNT(*) FILTER (
      WHERE al.funnel_stage::text IN ('enrolled', 'offer_accepted', 'token_paid', 'confirmed')
    ))::numeric * 100.0 / NULLIF(COUNT(*), 0),
    1
  ) AS conversion_pct,
  DENSE_RANK() OVER (
    ORDER BY
      (COUNT(*) FILTER (
        WHERE al.funnel_stage::text IN ('enrolled', 'offer_accepted', 'token_paid', 'confirmed')
      ))::numeric * 100.0 / NULLIF(COUNT(*), 0) DESC NULLS LAST
  ) AS rank_global
FROM admission_leads al
JOIN profiles p ON p.id = al.assigned_counselor_id
JOIN institutions i ON i.id = al.institution_id
WHERE al.created_at >= (NOW() - INTERVAL '30 days')
  AND al.assigned_counselor_id IS NOT NULL
  AND p.is_active = TRUE
GROUP BY al.assigned_counselor_id, p.full_name, p.avatar_url, al.institution_id, i.name
HAVING COUNT(*) >= 10;
CREATE UNIQUE INDEX idx_v_dashboard_conversion_monthly_counselor ON v_dashboard_conversion_monthly (counselor_id);
CREATE INDEX idx_v_dashboard_conversion_monthly_institution ON v_dashboard_conversion_monthly (institution_id);

-- END Dashboard v2 views

-- Updated: 2026-04-24 - Institutions that need counselor staffing
-- Surfaces which colleges have no admission_counselors rows, so Director
-- can see the staffing gap that causes lead auto-assignment to fail.
-- Uses security_invoker so RLS applies to the caller (super_admin sees all).
CREATE OR REPLACE VIEW v_institutions_needing_admission_counselors
WITH (security_invoker = true) AS
SELECT
  i.id AS institution_id,
  i.name AS institution_name,
  COALESCE(cc.active_counselors, 0) AS active_counselors,
  COALESCE(pl.pending_leads, 0) AS pending_leads_awaiting_counselor
FROM institutions i
LEFT JOIN (
  SELECT institution_id, COUNT(*) AS active_counselors
  FROM admission_counselors
  WHERE is_active = TRUE
  GROUP BY institution_id
) cc ON cc.institution_id = i.id
LEFT JOIN (
  SELECT institution_id, COUNT(*) AS pending_leads
  FROM admission_leads
  WHERE counselor_id IS NULL
    AND funnel_stage = 'new'
    AND source IN ('inbound_call','walk_in','referral','website','other')
  GROUP BY institution_id
) pl ON pl.institution_id = i.id
WHERE i.is_active = TRUE
  AND COALESCE(cc.active_counselors, 0) = 0
ORDER BY pl.pending_leads DESC NULLS LAST, i.name;
