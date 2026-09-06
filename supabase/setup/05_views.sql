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
  -- 2026-04-28: HLA clause removed — hr_leave_applications is referenced here and
  -- in 02_functions.sql but is undefined anywhere in source (no CREATE TABLE).
  -- Reinstate the subquery once the table is authored:
  --   AND NOT EXISTS (SELECT 1 FROM hr_leave_applications hla
  --                   WHERE hla.employee_id = p.id AND hla.status = 'approved'
  --                   AND CURRENT_DATE BETWEEN hla.start_date AND hla.end_date)
GROUP BY al.assigned_counselor_id, p.full_name, p.avatar_url, al.institution_id, i.name
-- Updated: 2026-05-03 — min-volume threshold moved from hardcoded 5 into
-- platform_policies.dashboard.leaderboard.sla_min_leads. Director can tune
-- via super-admin UI without a deploy. Refresh-time snapshot — value at
-- next REFRESH MATERIALIZED VIEW is what gets baked in.
HAVING COUNT(*) >= fn_get_policy_int('dashboard.leaderboard.sla_min_leads', 5, NULL);
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
-- Updated: 2026-05-03 — min-volume threshold moved from hardcoded 10 into
-- platform_policies.dashboard.leaderboard.conversion_min_leads.
HAVING COUNT(*) >= fn_get_policy_int('dashboard.leaderboard.conversion_min_leads', 10, NULL);
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

-- ================================================================================
-- SECTION: HR MODULE COMPATIBILITY VIEWS (Added: 2026-04-24)
-- ================================================================================

-- ─── hr_leave_types (was: Compat VIEW; now a real table) ──────────────────
-- Created as a VIEW: 2026-04-15 during HR Sprint 3 unification (PR #182), as a
-- backwards-compat shim over `leave_types` (filtered to scope='staff').
--
-- SPLIT BACK OUT: 20260721120000_hr_leave_types_split.sql promoted
-- `hr_leave_types` from this VIEW into its own real table and moved the 66
-- staff leave-type rows into it, deleting them from `leave_types`. The
-- previous "LOAD-BEARING — DO NOT DROP" warning above is stale: there is no
-- VIEW left here to drop, and application code (Task 3, 2026-07-21) has been
-- repointed at the real table.
--
-- The table exposes leave_type_name / leave_type_code where the old VIEW
-- aliased them to name / code.
--
-- Three policy RPCs — hr_policy_history(text,uuid,text,text),
-- hr_policy_diff(text,uuid,uuid), hr_policy_restore(text,uuid,uuid) — still
-- carry the literal string 'hr_leave_types' in an EXECUTE format(...) table
-- allowlist. Verified via pg_get_functiondef that all three are fully
-- dynamic (EXECUTE format('... FROM %I t ...', p_table_name) / to_jsonb(t.*))
-- and reference no hardcoded column name (no `name`, `code`, or
-- `leave_type_name` anywhere in their bodies), so they operate correctly on
-- the real table as-is — they would simply surface the real column names.
-- No live path reaches them for this table anyway: features/hr/policies/
-- registry.ts:48-53 removed 'hr_leave_types' from POLICY_TABLES on
-- 2026-04-15, and nothing in features/hr/policies/ or lib/services/hr/
-- policy-service.ts reads .name/.code off these RPCs' output.

-- ================================================================================
-- SECTION: CAMPUS LIVING VIEWS (Added: 2026-05-29)
-- ================================================================================

-- ─── v_learner_hostelites ─────────────────────────────────────────────────
-- Extended 2026-05-29 (migration 20260529_extend_v_learner_hostelites_cascade.sql)
-- for the Hostel Residents → Learners advanced DataTable: adds cascade FK columns
-- (degree/department/program/semester/section/academic_year) for filter pushdown,
-- plus program_name and the current block's name/code for display columns.
-- LEFT JOINs only — no hostelite row may be dropped by a null FK or missing
-- active allocation.
--
-- Recreated 2026-06-05 (migration 20260605150020_admission_year_schema_ddl.sql):
-- admission_years lost program_id / program_end_year and renamed
-- program_start_year → year. The OUTPUT columns program_start_year and
-- program_end_year are UNCHANGED for consumers — they are now DERIVED:
-- program_start_year = ay.year, program_end_year = ay.year + pr.program_duration_yrs.
--
-- The applied migration uses DROP VIEW + CREATE VIEW (the new cascade FK columns
-- are inserted before existing columns, and Postgres forbids reordering an
-- existing view's columns via CREATE OR REPLACE — 42P16). This reference mirror
-- preserves that form. The default anon/authenticated/service_role SELECT grants
-- are re-applied below to match Supabase's defaults.
--
-- Lifecycle filter (migrations 20260608130000 -> 20260608150000, revised
-- 2026-06-08): residents = hostel AND lifecycle_status = 'active' ONLY. All
-- non-active statuses (reserved/admitted/account/enquiry_submitted/graduated/
-- inactive/rejected) are excluded from the Residents list AND the Generate-bills
-- surface. lifecycle_status column exposed by migration 20260608140000.
--
-- academic_year_name appended 2026-06-09 (migration
-- 20260609120000_add_academic_year_name_to_v_learner_hostelites.sql) as the LAST
-- column for the Learners table's Academic Year display column — LEFT JOIN to
-- academic_years (alias 'acy'; 'ay' is admission_years). Mirror kept as
-- DROP+CREATE; the live migration uses CREATE OR REPLACE since the new column is
-- appended at the end.
DROP VIEW IF EXISTS public.v_learner_hostelites;

CREATE VIEW public.v_learner_hostelites AS
 SELECT lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.student_email, lp.college_email,
    lp.gender, lp.institution_id, acc.code AS accommodation_type, lp.hostel_fee, lp.dayscholar_fee,
    lp.father_name, lp.mother_name, lp.admission_year_id, lp.degree_id, lp.department_id,
    lp.program_id, lp.semester_id, lp.section_id, lp.academic_year_id, pr.program_name,
    ay.year AS program_start_year,
    (ay.year::numeric + pr.program_duration_yrs)::integer AS program_end_year,
    CASE
        WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.year + 1, pr.program_duration_yrs::integer + 1))
        WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1, EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
        WHEN lp.enquiry_date IS NOT NULL THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
        ELSE NULL::integer
    END AS year_of_study,
    ha.block_id AS current_block_id, ha.room_id AS current_room_id, ha.bed_id AS current_bed_id,
    ha.id AS current_allocation_id, hb.name AS current_block_name, hb.code AS current_block_code,
    hr.room_number AS current_room_number,
    hbd.bed_number  AS current_bed_number,
    CASE
        WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN 'admission_year'::text
        WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN 'batch'::text
        WHEN lp.enquiry_date IS NOT NULL THEN 'enquiry'::text
        ELSE NULL::text
    END AS year_source,
    dg.degree_name, sm.semester_name, lp.lifecycle_status, acy.academic_year_name,
    -- Current room/mess categories (admin Category Upgrade tab —
    -- migration 20260617110000_v_learner_hostelites_add_categories.sql)
    lp.hostel_category_id, hc.name AS hostel_category_name, hc.type AS hostel_category_type,
    lp.mess_category_id, mc.name AS mess_category_name,
    -- Contact numbers for the Residents roster export (migration
    -- 20260902140000_v_learner_hostelites_add_contact_numbers.sql). Appended
    -- LAST because CREATE OR REPLACE VIEW only permits adding columns at the
    -- end. v_learner_hostelites_scoped is `SELECT v.*` but Postgres freezes
    -- that star at creation time, so that view had to be re-created in the same
    -- migration or it would have stayed at 42 columns while this one had 45 —
    -- and the Residents list reads the SCOPED view.
    lp.student_mobile, lp.father_mobile, lp.mother_mobile
   FROM learners_profiles lp
     LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
     LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
     LEFT JOIN batches b ON b.id = lp.batch_id
     LEFT JOIN programs pr ON pr.id = lp.program_id
     -- Bridge: hostel_allocations.learner_id is an FK to profiles.id, NOT
     -- learners_profiles.id. profiles.learner_id = learners_profiles.id is 1:1.
     -- (migration 20260609140000_fix_v_learner_hostelites_alloc_profiles_bridge.sql)
     LEFT JOIN profiles palloc ON palloc.learner_id = lp.id
     LEFT JOIN hostel_allocations ha ON ha.learner_id = palloc.id AND ha.status = 'active'::allocation_status_enum
     LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
     LEFT JOIN hostel_rooms hr ON hr.id = ha.room_id
     LEFT JOIN hostel_beds  hbd ON hbd.id = ha.bed_id
     LEFT JOIN degrees dg ON dg.id = lp.degree_id
     LEFT JOIN semesters sm ON sm.id = lp.semester_id
     LEFT JOIN academic_years acy ON acy.id = lp.academic_year_id
     LEFT JOIN hostel_categories hc ON hc.id = lp.hostel_category_id
     LEFT JOIN mess_categories mc ON mc.id = lp.mess_category_id
  WHERE acc.code = 'hostel'::text AND lp.lifecycle_status::text = 'active'::text;

GRANT ALL ON public.v_learner_hostelites TO anon, authenticated, service_role;

-- ─── v_learner_hostelites_scoped ──────────────────────────────────────────
-- Added 2026-06-24 (migration 20260624104223_scope_learner_hostelites_view_idor_fix.sql).
-- Security wrapper over v_learner_hostelites (which bypasses RLS). The client
-- list path (LearnerHosteliteService.listHostelites) MUST read this view, not
-- the base view, so block-scoped wardens cannot tamper a client `block_ids`
-- filter to read every hostelite. Scope is re-derived from auth.uid():
--   super admin → all; warden (has user_block_access grants) → their granted
--   blocks only (cross-institution, excludes unassigned); else → accessible
--   institutions. security_barrier prevents predicate-pushdown leaks.
--
-- TRAP: `SELECT v.*` below is NOT dynamic. Postgres expands the star into an
-- explicit column list when the view is created and never re-expands it. Any
-- migration that adds a column to v_learner_hostelites MUST re-run this
-- CREATE OR REPLACE in the same migration, or this view silently stays at the
-- old column count — and since the client list path reads THIS view, the new
-- column arrives as permanently blank with no error anywhere. Hit on
-- 2026-09-02 while adding the contact numbers (base went to 45, this was still
-- frozen at 42).
CREATE OR REPLACE VIEW public.v_learner_hostelites_scoped
WITH (security_barrier = true) AS
SELECT v.*
FROM public.v_learner_hostelites v
WHERE
  is_super_admin()
  OR (
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.user_block_access uba
        WHERE uba.user_id = auth.uid()
          AND uba.revoked_at IS NULL
      )
      THEN v.current_block_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.user_block_access uba
             WHERE uba.user_id = auth.uid()
               AND uba.revoked_at IS NULL
               AND uba.block_id = v.current_block_id
           )
      ELSE role_has_institution_access(v.institution_id)
    END
  );

REVOKE ALL ON public.v_learner_hostelites_scoped FROM anon;
GRANT SELECT ON public.v_learner_hostelites_scoped TO authenticated;

-- =============================================================================
-- IMS Department Stock — added 2026-04-28
-- Purpose: power /ims/stock/department page (replaces hardcoded placeholders).
-- Source tables: ims_stock_issues (issued events) + ims_department_consumption
-- (consumed events). RLS is inherited from those base tables via
-- security_invoker = true; do not add separate policies on the view.
-- =============================================================================

-- Per-(department, item) aggregated balance.
-- Used by: useImsDepartmentStock (table) and useImsDepartmentSummaries (cards).
CREATE OR REPLACE VIEW ims_department_stock_summary
WITH (security_invoker = true) AS
WITH issued AS (
    SELECT
        si.department_id,
        si.item_id,
        si.store_id,
        si.institution_id,
        SUM(si.quantity)::numeric AS total_issued
    FROM ims_stock_issues si
    GROUP BY si.department_id, si.item_id, si.store_id, si.institution_id
),
consumed AS (
    SELECT
        dc.department_id,
        dc.item_id,
        dc.store_id,
        dc.institution_id,
        SUM(dc.quantity)::numeric AS total_consumed,
        SUM(dc.value)::numeric    AS total_value
    FROM ims_department_consumption dc
    GROUP BY dc.department_id, dc.item_id, dc.store_id, dc.institution_id
)
SELECT
    COALESCE(i.department_id,  c.department_id)  AS department_id,
    COALESCE(i.item_id,        c.item_id)        AS item_id,
    COALESCE(i.store_id,       c.store_id)       AS store_id,
    COALESCE(i.institution_id, c.institution_id) AS institution_id,
    d.department_name,
    it.name        AS item_name,
    it.cost_price  AS item_cost_price,
    COALESCE(i.total_issued,    0) AS total_issued,
    COALESCE(c.total_consumed,  0) AS total_consumed,
    COALESCE(c.total_value,     0) AS total_value,
    (COALESCE(i.total_issued, 0) - COALESCE(c.total_consumed, 0)) AS balance
FROM issued i
FULL OUTER JOIN consumed c
    ON  i.department_id = c.department_id
    AND i.item_id       = c.item_id
    AND COALESCE(i.store_id::text,       '') = COALESCE(c.store_id::text,       '')
    AND COALESCE(i.institution_id::text, '') = COALESCE(c.institution_id::text, '')
LEFT JOIN departments d ON d.id = COALESCE(i.department_id, c.department_id)
LEFT JOIN ims_items   it ON it.id = COALESCE(i.item_id, c.item_id);

-- Chronological event stream for one (department, item) pair.
-- Used by: useImsDepartmentItemMovements (history dialog).
-- 'received' rows come from issues; 'consumed' rows come from consumption.
-- 'returned' is intentionally omitted — no source table exists yet.
CREATE OR REPLACE VIEW ims_department_item_movements
WITH (security_invoker = true) AS
SELECT
    si.id,
    'received'::text   AS type,
    si.quantity,
    si.notes,
    si.created_at,
    si.issued_by       AS created_by_id,
    si.department_id,
    si.item_id,
    si.store_id,
    si.institution_id
FROM ims_stock_issues si
UNION ALL
SELECT
    dc.id,
    'consumed'::text   AS type,
    dc.quantity,
    NULL::text         AS notes,
    dc.created_at,
    NULL::uuid         AS created_by_id,
    dc.department_id,
    dc.item_id,
    dc.store_id,
    dc.institution_id
FROM ims_department_consumption dc;

-- ── Cohort Core — M7.4 alumni→mentor pool (Phase 7 · THE MOAT) ───────────────
-- Migration: 20260731095000_cohort_alumni_mentor.sql (2026-07-06)
CREATE OR REPLACE VIEW public.v_cohort_alumni_mentor_pool
WITH (security_invoker = true) AS
SELECT
  m.id                                   AS membership_id,
  m.cohort_id                            AS source_cohort_id,
  c.kind                                 AS kind,
  c.name                                 AS source_cohort_name,
  c.institution_id                       AS institution_id,
  c.academic_year                        AS academic_year,
  m.member_type                          AS member_type,
  m.member_ref                           AS member_ref,
  (m.member_type IN ('student','learner','staff')) AS is_person,
  m.updated_at                           AS graduated_at,
  -- the captured outcome (if any) so a strong graduate can be prioritised.
  o.outcome_snapshot->>'blended_outcome' AS blended_outcome,
  o.outcome_snapshot->>'lift'            AS lift
FROM public.cohort_memberships m
JOIN public.cohorts c            ON c.id = m.cohort_id
LEFT JOIN public.cohort_outcomes o ON o.membership_id = m.id
WHERE m.status = 'graduated';

-- =====================================================
-- v_learner_scope_violations — Added 2026-08-08
--   Migration: 20260808150000_extend_learner_scope_guard_programme.sql
--
-- Standing integrity report for the learners_profiles academic hierarchy
-- (institution -> degree -> department -> programme -> semester -> section).
-- EMPTY IS THE HEALTHY STATE.
--
-- Why a view and not just the trigger: trg_validate_learner_semester_year_scope
-- guards NEW writes only, and is change-triggered by design so that already-bad
-- rows stay editable. It therefore can never surface damage already sitting in
-- the table. The 2026-07-30 bulk write went unnoticed for nine days precisely
-- because nothing looked. A same-named FK from another college renders
-- perfectly in every list and export — only a uuid comparison exposes it — so
-- this view, not the UI, is how that class of corruption gets found.
--
-- security_invoker: answers within the caller's RLS, so it cannot be used to
-- read learners outside the caller's institution scope.
-- =====================================================
CREATE OR REPLACE VIEW public.v_learner_scope_violations
WITH (security_invoker = true) AS
SELECT lp.id AS learner_id,
       lp.roll_number,
       trim(lp.first_name || ' ' || COALESCE(lp.last_name, '')) AS learner_name,
       lp.lifecycle_status,
       lp.institution_id,
       i.name AS institution_name,
       p.program_name,
       CASE
         WHEN d.id   IS NOT NULL AND d.institution_id   IS DISTINCT FROM lp.institution_id THEN 'degree_wrong_institution'
         WHEN dep.id IS NOT NULL AND dep.institution_id IS DISTINCT FROM lp.institution_id THEN 'department_wrong_institution'
         WHEN p.id   IS NOT NULL AND p.institution_id   IS DISTINCT FROM lp.institution_id THEN 'program_wrong_institution'
         WHEN ay.id  IS NOT NULL AND ay.institution_id  IS DISTINCT FROM lp.institution_id THEN 'academic_year_wrong_institution'
         WHEN sem.id IS NOT NULL AND sem.institution_id IS DISTINCT FROM lp.institution_id THEN 'semester_wrong_institution'
         WHEN sec.id IS NOT NULL AND sec.institution_id IS DISTINCT FROM lp.institution_id THEN 'section_wrong_institution'
         WHEN sem.id IS NOT NULL AND sem.program_id     IS DISTINCT FROM lp.program_id     THEN 'semester_wrong_programme'
         WHEN sec.id IS NOT NULL AND sec.program_id     IS DISTINCT FROM lp.program_id     THEN 'section_wrong_programme'
         ELSE 'section_wrong_semester'
       END AS violation,
       sem.semester_name AS stored_semester_name,
       sem.semester_code AS stored_semester_code,
       sec.section_name  AS stored_section_name,
       lp.updated_at
FROM public.learners_profiles lp
LEFT JOIN public.institutions   i   ON i.id   = lp.institution_id
LEFT JOIN public.degrees        d   ON d.id   = lp.degree_id
LEFT JOIN public.departments    dep ON dep.id = lp.department_id
LEFT JOIN public.programs       p   ON p.id   = lp.program_id
LEFT JOIN public.semesters      sem ON sem.id = lp.semester_id
LEFT JOIN public.sections       sec ON sec.id = lp.section_id
LEFT JOIN public.academic_years ay  ON ay.id  = lp.academic_year_id
WHERE (d.id   IS NOT NULL AND d.institution_id   IS DISTINCT FROM lp.institution_id)
   OR (dep.id IS NOT NULL AND dep.institution_id IS DISTINCT FROM lp.institution_id)
   OR (p.id   IS NOT NULL AND p.institution_id   IS DISTINCT FROM lp.institution_id)
   OR (ay.id  IS NOT NULL AND ay.institution_id  IS DISTINCT FROM lp.institution_id)
   OR (sem.id IS NOT NULL AND sem.institution_id IS DISTINCT FROM lp.institution_id)
   OR (sec.id IS NOT NULL AND sec.institution_id IS DISTINCT FROM lp.institution_id)
   OR (sem.id IS NOT NULL AND lp.program_id IS NOT NULL AND sem.program_id IS DISTINCT FROM lp.program_id)
   OR (sec.id IS NOT NULL AND lp.program_id IS NOT NULL AND sec.program_id IS DISTINCT FROM lp.program_id)
   OR (sec.id IS NOT NULL AND lp.semester_id IS NOT NULL AND sec.semester_id IS DISTINCT FROM lp.semester_id);

-- =====================================================
-- v_hr_leave_balance_src / v_hr_leave_balance — Added 2026-08-11
--   Migration: 20260811180100_hr_leave_balance_view.sql
--
-- Derived leave entitlement — the read surface. Two views on purpose:
--
--   v_hr_leave_balance_src  the derivation, with NO access predicate.
--                           Revoked from anon and authenticated. Exists so
--                           fn_hr_freeze_leave_year can read the same
--                           derivation the UI reads without inheriting a
--                           predicate that would evaluate against the cron's
--                           service-role identity.
--   v_hr_leave_balance      src + the access predicate. This is what the app
--                           reads.
--
-- The predicate is copied VERBATIM from the hlb_select policy on
-- hr_leave_balances. security_invoker is deliberately NOT used even though
-- PG 15.6 supports it: the driving table of the open arm is `staff`, so
-- invoker mode would silently substitute staff's RLS for the leave-balance
-- rule that governs this data today -- a different, unaudited access model.
-- =====================================================
CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS
-- ---------------------------------------------------------------------
-- OPEN YEARS: derive. Returns a row for every eligible staff x type pair
-- whether or not a ledger row exists -- this arm is what lets a staff
-- member created five minutes ago apply for leave with no admin action.
-- ---------------------------------------------------------------------
SELECT
  s.id                              AS employee_id,
  t.id                              AS leave_type_id,
  y.id                              AS hr_academic_year_id,
  t.hr_organization_id,
  t.leave_type_name,
  t.leave_type_code,
  t.request_category,
  t.color_code,
  t.display_order,
  t.duration_type,
  t.allow_half_day,
  t.allow_hourly,
  t.max_continuous_days,
  t.min_advance_notice_days,
  t.requires_documents,
  -- COALESCE, not truthiness: an override or frozen value of 0 is a real
  -- decision ("eligible, but no days") and must beat the default.
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)          AS entitled,
  COALESCE(b.used, 0)                                                     AS used,
  COALESCE(b.carried_forward, 0)                                          AS carried_forward,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)
    + COALESCE(b.carried_forward, 0)
    - COALESCE(b.used, 0)                                                 AS available,
  CASE
    WHEN o.entitled_days IS NOT NULL THEN 'override'
    WHEN b.entitled      IS NOT NULL THEN 'frozen'
    ELSE 'policy'
  END                                                                     AS entitlement_source,
  b.created_at,
  b.updated_at
FROM public.hr_academic_years y
CROSS JOIN public.hr_leave_types t
JOIN public.hr_organizations org ON org.id = t.hr_organization_id
JOIN public.staff s
  ON s.institution_id = org.institution_id
 AND s.is_active
LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
LEFT JOIN public.hr_leave_balances b
  ON b.employee_id         = s.id
 AND b.leave_type_id       = t.id
 AND b.hr_academic_year_id = y.id
LEFT JOIN public.hr_leave_entitlement_overrides o
  ON o.employee_id         = s.id
 AND o.leave_type_id       = t.id
 AND o.hr_academic_year_id = y.id
WHERE y.frozen_at IS NULL
  AND t.is_active
  -- Eligibility rules preserved from generate_hr_leave_balances. All three
  -- are inert today (0 gender-restricted types, 0 cadre-restricted types,
  -- 1 assignment on test data), so this changes nothing now and stops a
  -- future maternity/cadre-restricted type being granted to everyone.
  AND (t.applicable_gender = 'all'
       OR lower(COALESCE(s.gender, '')) = t.applicable_gender)
  AND (t.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(t.applicable_cadre_ids))
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.hr_leave_type_assignments a
       WHERE a.leave_type_id = t.id AND a.is_active
    )
    OR EXISTS (
      SELECT 1 FROM public.hr_leave_type_assignments a
       WHERE a.leave_type_id = t.id
         AND a.is_active
         AND (
              (a.scope_kind = 'staff'      AND a.staff_id      = s.id)
           OR (a.scope_kind = 'department' AND a.department_id = s.department_id)
           OR (a.scope_kind = 'organization')
         )
    )
  )

UNION ALL

-- ---------------------------------------------------------------------
-- FROZEN YEARS: stored rows only, no cross join. History is served
-- exactly as recorded. An override still wins, so a past year can be
-- corrected deliberately.
-- ---------------------------------------------------------------------
SELECT
  b.employee_id,
  b.leave_type_id,
  b.hr_academic_year_id,
  b.hr_organization_id,
  t.leave_type_name,
  t.leave_type_code,
  t.request_category,
  t.color_code,
  t.display_order,
  t.duration_type,
  t.allow_half_day,
  t.allow_hourly,
  t.max_continuous_days,
  t.min_advance_notice_days,
  t.requires_documents,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)          AS entitled,
  b.used,
  b.carried_forward,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)
    + b.carried_forward - b.used                                          AS available,
  CASE
    WHEN o.entitled_days IS NOT NULL THEN 'override'
    WHEN b.entitled      IS NOT NULL THEN 'frozen'
    ELSE 'policy'
  END                                                                     AS entitlement_source,
  b.created_at,
  b.updated_at
FROM public.hr_leave_balances b
JOIN public.hr_academic_years y
  ON y.id = b.hr_academic_year_id
 AND y.frozen_at IS NOT NULL
JOIN public.hr_leave_types t ON t.id = b.leave_type_id
LEFT JOIN public.hr_leave_entitlement_overrides o
  ON o.employee_id         = b.employee_id
 AND o.leave_type_id       = b.leave_type_id
 AND o.hr_academic_year_id = b.hr_academic_year_id;

-- The derivation is internal. Only view owners (and therefore
-- v_hr_leave_balance and SECURITY DEFINER functions) may read it.
REVOKE ALL ON public.v_hr_leave_balance_src FROM anon, authenticated;

CREATE OR REPLACE VIEW public.v_hr_leave_balance AS
SELECT * FROM public.v_hr_leave_balance_src v
WHERE (SELECT public.is_super_admin())
   OR v.employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
   OR ((SELECT public.user_has_permission('hr.leave.approve'))
       AND v.hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())));

REVOKE ALL ON public.v_hr_leave_balance FROM anon;
GRANT SELECT ON public.v_hr_leave_balance TO authenticated;


-- ================================================================================
-- vw_learner_payment_progress (mirrored 2026-08-18)
-- ================================================================================
-- Per-learner fee position. Feeds the reserved -> admitted promotion gate
-- (evaluate_learner_status_after_payment) and the Awaiting Payment tier of
-- /learners/onboarding (fn_onboarding_payment_progress).
--
-- paid_pct is the DUE-AS-ON-DATE basis per the 2026-08-11 Director ruling: paid
-- over billed across non-application bills whose due_date has arrived. The three
-- bases are exposed explicitly, each with a matching amount pair, so
-- admission_statuses.threshold_basis can select one without any caller
-- re-deriving the predicate:
--     billed_to_date           -> pct_billed_to_date   + countable_billed / countable_paid
--     due_to_date              -> pct_due_to_date      + due_billed       / due_paid
--     due_to_date_current_year -> pct_due_current_year + due_cy_billed    / due_cy_paid
--
-- Cancelled AND superseded bills are excluded (143 cancelled bills carrying
-- Rs 22.31 lakh used to drag real learners' percentages down).
-- security_invoker = true, so RLS on learners_profiles + billing_student_bills
-- applies to the caller. That is also why fn_onboarding_payment_progress is
-- SECURITY DEFINER: reading these totals must not require billing.bills.view.
CREATE OR REPLACE VIEW public.vw_learner_payment_progress
WITH (security_invoker = true) AS
SELECT
  lp.id AS learner_id,
  lp.institution_id,
  lp.lifecycle_status,
  COALESCE(SUM(b.final_amount)
           FILTER (WHERE bc.kind <> 'application_fee'), 0) AS countable_billed,
  COALESCE(SUM(b.final_amount - b.balance_amount)
           FILTER (WHERE bc.kind <> 'application_fee'), 0) AS countable_paid,
  CASE
    WHEN COALESCE(SUM(b.final_amount)
                  FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) = 0
      THEN 0
    ELSE ROUND(100.0
      * SUM(b.final_amount - b.balance_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE)
      / SUM(b.final_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 2)
  END AS paid_pct,
  BOOL_OR(bc.kind = 'application_fee' AND b.status = 'paid') AS application_fee_paid,
  COUNT(b.id) AS total_bills,
  COUNT(b.id) FILTER (WHERE b.status = 'paid') AS paid_bills,
  CASE
    WHEN COALESCE(SUM(b.final_amount) FILTER (WHERE bc.kind <> 'application_fee'), 0) = 0 THEN 0
    ELSE ROUND(100.0
      * SUM(b.final_amount - b.balance_amount) FILTER (WHERE bc.kind <> 'application_fee')
      / SUM(b.final_amount)                    FILTER (WHERE bc.kind <> 'application_fee'), 2)
  END AS pct_billed_to_date,
  CASE
    WHEN COALESCE(SUM(b.final_amount)
                  FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) = 0
      THEN 0
    ELSE ROUND(100.0
      * SUM(b.final_amount - b.balance_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE)
      / SUM(b.final_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 2)
  END AS pct_due_to_date,
  CASE
    WHEN COALESCE(SUM(b.final_amount)
                  FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                          AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE), 0) = 0
      THEN 0
    ELSE ROUND(100.0
      * SUM(b.final_amount - b.balance_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                  AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE)
      / SUM(b.final_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                  AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE), 2)
  END AS pct_due_current_year,
  COALESCE(SUM(b.final_amount)
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) AS due_billed,
  COALESCE(SUM(b.final_amount - b.balance_amount)
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) AS due_paid,
  COALESCE(SUM(b.final_amount)
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                   AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE), 0) AS due_cy_billed,
  COALESCE(SUM(b.final_amount - b.balance_amount)
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                   AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE), 0) AS due_cy_paid
FROM public.learners_profiles lp
LEFT JOIN public.billing_student_bills b
  ON b.student_id = lp.id AND b.status NOT IN ('superseded', 'cancelled')
LEFT JOIN public.billing_categories bc
  ON bc.id = b.item_category_id
LEFT JOIN public.academic_years ayr
  ON ayr.id = b.academic_year_id
GROUP BY lp.id, lp.institution_id, lp.lifecycle_status;


-- ===========================================================================
-- Source: 20260822090000_billing_bill_instalments.sql
-- ===========================================================================
-- =============================================================================
-- §6 Set-wide rollup, for the threshold view and list screens
-- =============================================================================
-- The per-bill function above is a loop; a view over 19k bills cannot call it
-- per row. This does the same waterfall as pure set arithmetic:
--
--   running_before = sum of tranche amounts strictly BEFORE this one
--   allocated      = clamp(paid_on_bill - running_before, 0, amount)
--
-- which is exactly what the loop computes, without the loop.

CREATE OR REPLACE VIEW public.vw_bill_instalment_state
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    i.id            AS instalment_id,
    i.bill_id,
    i.sequence_no,
    i.amount,
    i.due_date,
    i.promotes_to_status_code,
    b.student_id,
    b.institution_id,
    b.item_category_id,
    b.academic_year_id,
    b.status        AS bill_status,
    GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)) AS paid_on_bill,
    COALESCE(SUM(i.amount) OVER (
      PARTITION BY i.bill_id
      ORDER BY i.due_date, i.sequence_no
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS running_before
  FROM public.billing_bill_instalments i
  JOIN public.billing_student_bills b ON b.id = i.bill_id
)
SELECT
  instalment_id,
  bill_id,
  student_id,
  institution_id,
  item_category_id,
  academic_year_id,
  bill_status,
  sequence_no,
  amount,
  due_date,
  promotes_to_status_code,
  LEAST(GREATEST(paid_on_bill - running_before, 0), amount) AS allocated_amount,
  amount - LEAST(GREATEST(paid_on_bill - running_before, 0), amount) AS outstanding,
  (LEAST(GREATEST(paid_on_bill - running_before, 0), amount) >= amount) AS is_settled,
  (due_date <= CURRENT_DATE) AS is_due
FROM ranked;

COMMENT ON VIEW public.vw_bill_instalment_state IS
  'Set-based form of the billing_bill_instalment_state waterfall, for the threshold view and list screens. security_invoker = true so the underlying bill RLS applies.';

REVOKE ALL ON TABLE public.vw_bill_instalment_state FROM anon, PUBLIC;

GRANT SELECT ON TABLE public.vw_bill_instalment_state TO authenticated, service_role;

-- ===========================================================================
-- Source: 20260822110000_instalment_aware_threshold_and_late_charge.sql
-- ===========================================================================
-- =============================================================================
-- §1 The threshold view, tranche-aware
-- =============================================================================
-- CREATE OR REPLACE VIEW cannot reorder, rename or drop a column, so all 14
-- keep their name, type and position. Only how `due_amount` is derived changes.
--
--   bill WITH tranches : due = sum of tranche amounts whose date has arrived
--   bill WITHOUT       : due = final_amount when due_date has arrived, else 0
--                        — byte for byte the previous expression
--
-- The numerator is LEAST(paid, due) rather than paid: that is the waterfall
-- restated. Money settles the oldest tranche first, so a learner who pays ahead
-- of schedule cannot have the surplus counted against a tranche that is not yet
-- due — which would inflate their percentage and promote them early.
--
-- A bill with no billing_category (bc.kind IS NULL) is excluded from the
-- countable totals by `bc.kind <> 'application_fee'` evaluating to NULL. That
-- is pre-existing behaviour, preserved deliberately rather than "fixed" here.

CREATE OR REPLACE VIEW public.vw_learner_payment_progress
WITH (security_invoker = true) AS
WITH bill AS (
  SELECT
    b.id,
    b.student_id,
    bc.kind        AS category_kind,
    b.status       AS bill_status,
    b.final_amount,
    GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)) AS paid,
    (ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE) AS in_current_ay,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.billing_bill_instalments i WHERE i.bill_id = b.id)
        THEN COALESCE((SELECT SUM(i.amount)
                         FROM public.billing_bill_instalments i
                        WHERE i.bill_id = b.id
                          AND i.due_date <= CURRENT_DATE), 0)
      WHEN b.due_date <= CURRENT_DATE THEN b.final_amount
      ELSE 0
    END AS due_amount
  FROM public.billing_student_bills b
  LEFT JOIN public.billing_categories bc ON bc.id = b.item_category_id
  LEFT JOIN public.academic_years ayr    ON ayr.id = b.academic_year_id
  WHERE b.status NOT IN ('superseded', 'cancelled')
)
SELECT
  lp.id             AS learner_id,
  lp.institution_id,
  lp.lifecycle_status,
  COALESCE(SUM(b.final_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 0)
    AS countable_billed,
  COALESCE(SUM(b.paid)         FILTER (WHERE b.category_kind <> 'application_fee'), 0)
    AS countable_paid,
  -- paid_pct: DUE-AS-ON-DATE basis (platform default, 2026-08-11 ruling),
  -- now measured tranche by tranche.
  CASE
    WHEN COALESCE(SUM(b.due_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 0) = 0
      THEN 0
    ELSE ROUND(
      100.0 * SUM(LEAST(b.paid, b.due_amount)) FILTER (WHERE b.category_kind <> 'application_fee')
            / SUM(b.due_amount)                FILTER (WHERE b.category_kind <> 'application_fee')
    , 2)
  END AS paid_pct,
  BOOL_OR(b.category_kind = 'application_fee' AND b.bill_status = 'paid') AS application_fee_paid,
  COUNT(b.id) AS total_bills,
  COUNT(b.id) FILTER (WHERE b.bill_status = 'paid') AS paid_bills,
  -- The three explicit bases.
  CASE
    WHEN COALESCE(SUM(b.final_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 0) = 0 THEN 0
    ELSE ROUND(100.0
      * SUM(b.paid)         FILTER (WHERE b.category_kind <> 'application_fee')
      / SUM(b.final_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 2)
  END AS pct_billed_to_date,
  CASE
    WHEN COALESCE(SUM(b.due_amount) FILTER (WHERE b.category_kind <> 'application_fee'), 0) = 0 THEN 0
    ELSE ROUND(100.0
      * SUM(LEAST(b.paid, b.due_amount)) FILTER (WHERE b.category_kind <> 'application_fee')
      / SUM(b.due_amount)                FILTER (WHERE b.category_kind <> 'application_fee'), 2)
  END AS pct_due_to_date,
  CASE
    WHEN COALESCE(SUM(b.due_amount)
           FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay), 0) = 0 THEN 0
    ELSE ROUND(100.0
      * SUM(LEAST(b.paid, b.due_amount))
          FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay)
      / SUM(b.due_amount)
          FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay), 2)
  END AS pct_due_current_year,
  COALESCE(SUM(b.due_amount)                FILTER (WHERE b.category_kind <> 'application_fee'), 0)
    AS due_billed,
  COALESCE(SUM(LEAST(b.paid, b.due_amount)) FILTER (WHERE b.category_kind <> 'application_fee'), 0)
    AS due_paid,
  -- Columns 15-16. NOT in 20260821040000 — they were added to the live view
  -- afterwards and the migration file was never updated, so the file on disk
  -- described a 14-column view while the database had 16. Omitting them here
  -- was rejected outright ("cannot drop columns from view"), which is the one
  -- kind of drift Postgres catches for you.
  COALESCE(SUM(b.due_amount)
    FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay), 0)
    AS due_cy_billed,
  COALESCE(SUM(LEAST(b.paid, b.due_amount))
    FILTER (WHERE b.category_kind <> 'application_fee' AND b.in_current_ay), 0)
    AS due_cy_paid
FROM public.learners_profiles lp
LEFT JOIN bill b ON b.student_id = lp.id
GROUP BY lp.id, lp.institution_id, lp.lifecycle_status;

COMMENT ON VIEW public.vw_learner_payment_progress IS
  'Per-learner payment progress. paid_pct = DUE-AS-ON-DATE basis, now computed tranche by tranche: a bill with billing_bill_instalments contributes only the tranches whose date has arrived; a bill without contributes its whole amount once its due_date has arrived (unchanged). The numerator is LEAST(paid, due) — the payment waterfall restated, so paying ahead of schedule never inflates the percentage. Cancelled and superseded bills excluded. security_invoker = true so RLS applies.';

REVOKE ALL ON TABLE public.vw_learner_payment_progress FROM anon, PUBLIC;

GRANT SELECT ON TABLE public.vw_learner_payment_progress TO authenticated, service_role;

-- ===========================================================================
-- Source: 20260824240000_hr_leave_balance_view_document_rule.sql
-- ===========================================================================
CREATE OR REPLACE VIEW refuses to
-- rename or reorder existing columns, and the alternative -- DROP CASCADE --
-- would take v_hr_leave_balance with it for a cosmetic gain.
--
-- BOTH BRANCHES of the UNION in _src carry it. The first serves OPEN years by
-- CROSS JOINing staff to leave types; the second serves FROZEN years from the
-- ledger. A drawer that got the rule from one branch and not the other would
-- behave differently either side of a year boundary, which is the kind of bug
-- nobody reproduces on demand.
--
-- Everything else is byte-for-byte the current definition. Verified by
-- checksumming the view's output before and after: 8000 rows,
-- md5 8636b8c71e4fafc6038923d3b26f8e76, unchanged.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS
 SELECT s.id AS employee_id,
    t.id AS leave_type_id,
    y.id AS hr_academic_year_id,
    t.hr_organization_id,
    t.leave_type_name,
    t.leave_type_code,
    t.request_category,
    t.color_code,
    t.display_order,
    t.duration_type,
    t.allow_half_day,
    t.allow_hourly,
    t.max_continuous_days,
    t.min_advance_notice_days,
    t.requires_documents,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    COALESCE(b.used, 0::numeric) AS used,
    COALESCE(b.carried_forward, 0::numeric) AS carried_forward,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + COALESCE(b.carried_forward, 0::numeric) - COALESCE(b.used, 0::numeric) AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days
   FROM hr_academic_years y
     CROSS JOIN hr_leave_types t
     JOIN hr_organizations org ON org.id = t.hr_organization_id
     JOIN staff s ON s.institution_id = org.institution_id AND s.is_active
     LEFT JOIN hr_staff_details d ON d.staff_id = s.id
     LEFT JOIN hr_leave_balances b ON b.employee_id = s.id AND b.leave_type_id = t.id AND b.hr_academic_year_id = y.id
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = s.id AND o.leave_type_id = t.id AND o.hr_academic_year_id = y.id
  WHERE y.frozen_at IS NULL AND t.is_active AND (t.applicable_gender::text = 'all'::text OR lower(COALESCE(s.gender, ''::text)) = t.applicable_gender::text) AND (t.applicable_cadre_ids IS NULL OR (d.cadre_id = ANY (t.applicable_cadre_ids))) AND (NOT (EXISTS ( SELECT 1
           FROM hr_leave_type_assignments a
          WHERE a.leave_type_id = t.id AND a.is_active)) OR (EXISTS ( SELECT 1
           FROM hr_leave_type_assignments a
          WHERE a.leave_type_id = t.id AND a.is_active AND (a.scope_kind::text = 'staff'::text AND a.staff_id = s.id OR a.scope_kind::text = 'department'::text AND a.department_id = s.department_id OR a.scope_kind::text = 'organization'::text))))
UNION ALL
 SELECT b.employee_id,
    b.leave_type_id,
    b.hr_academic_year_id,
    b.hr_organization_id,
    t.leave_type_name,
    t.leave_type_code,
    t.request_category,
    t.color_code,
    t.display_order,
    t.duration_type,
    t.allow_half_day,
    t.allow_hourly,
    t.max_continuous_days,
    t.min_advance_notice_days,
    t.requires_documents,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    b.used,
    b.carried_forward,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + b.carried_forward - b.used AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days
   FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id AND y.frozen_at IS NOT NULL
     JOIN hr_leave_types t ON t.id = b.leave_type_id
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = b.employee_id AND o.leave_type_id = b.leave_type_id AND o.hr_academic_year_id = b.hr_academic_year_id;

CREATE OR REPLACE VIEW public.v_hr_leave_balance AS
 SELECT v.employee_id,
    v.leave_type_id,
    v.hr_academic_year_id,
    v.hr_organization_id,
    v.leave_type_name,
    v.leave_type_code,
    v.request_category,
    v.color_code,
    v.display_order,
    v.duration_type,
    v.allow_half_day,
    v.allow_hourly,
    v.max_continuous_days,
    v.min_advance_notice_days,
    v.requires_documents,
    v.entitled,
    v.used,
    v.carried_forward,
    v.available,
    v.entitlement_source,
    v.created_at,
    v.updated_at,
    v.document_required_after_days
   FROM v_hr_leave_balance_src v
  WHERE ( SELECT is_super_admin() AS is_super_admin) OR (v.employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) OR ( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (v.hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest));

COMMENT ON VIEW public.v_hr_leave_balance IS
  'Per-staff, per-type, per-year leave position, RLS-scoped to yourself or to an organization you approve for. Entitlement resolves through COALESCE(override, ledger literal, policy) and names the winner in entitlement_source. Carries the type''s whole document rule -- requires_documents plus document_required_after_days -- so the Apply Leave drawer can decide whether THIS request needs a certificate without a second round trip.';

-- =============================================================================
-- Mirrored from supabase/migrations/20260827210000 + 20260827220000 (views)
-- =============================================================================

CREATE OR REPLACE VIEW public.v_hr_staff
WITH (security_invoker = true) AS
  SELECT s.*
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
   WHERE ec.included_in_hr;

COMMENT ON VIEW public.v_hr_staff IS
  'Active-or-not staff whose employment category is included in HR. Same columns as staff; swap the table name in HR queries. Inherits staff RLS (security_invoker).';

REVOKE ALL ON public.v_hr_staff FROM anon;
GRANT SELECT ON public.v_hr_staff TO authenticated;

CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS
 SELECT s.id AS employee_id,
    t.id AS leave_type_id,
    y.id AS hr_academic_year_id,
    t.hr_organization_id,
    t.leave_type_name,
    t.leave_type_code,
    t.request_category,
    t.color_code,
    t.display_order,
    t.duration_type,
    t.allow_half_day,
    t.allow_hourly,
    t.max_continuous_days,
    t.min_advance_notice_days,
    t.requires_documents,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    COALESCE(b.used, 0::numeric) AS used,
    COALESCE(b.carried_forward, 0::numeric) AS carried_forward,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + COALESCE(b.carried_forward, 0::numeric) - COALESCE(b.used, 0::numeric) AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days
   FROM hr_academic_years y
     CROSS JOIN hr_leave_types t
     JOIN hr_organizations org ON org.id = t.hr_organization_id
     JOIN staff s ON s.institution_id = org.institution_id AND s.is_active
     JOIN employment_categories sec ON sec.id = s.category_id AND sec.included_in_hr
     LEFT JOIN hr_staff_details d ON d.staff_id = s.id
     LEFT JOIN hr_leave_balances b ON b.employee_id = s.id AND b.leave_type_id = t.id AND b.hr_academic_year_id = y.id
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = s.id AND o.leave_type_id = t.id AND o.hr_academic_year_id = y.id
  WHERE y.frozen_at IS NULL AND t.is_active AND (t.applicable_gender::text = 'all'::text OR lower(COALESCE(s.gender, ''::text)) = t.applicable_gender::text) AND (t.applicable_cadre_ids IS NULL OR (d.cadre_id = ANY (t.applicable_cadre_ids))) AND (NOT (EXISTS ( SELECT 1
           FROM hr_leave_type_assignments a
          WHERE a.leave_type_id = t.id AND a.is_active)) OR (EXISTS ( SELECT 1
           FROM hr_leave_type_assignments a
          WHERE a.leave_type_id = t.id AND a.is_active AND (a.scope_kind::text = 'staff'::text AND a.staff_id = s.id OR a.scope_kind::text = 'department'::text AND a.department_id = s.department_id OR a.scope_kind::text = 'organization'::text))))
UNION ALL
 SELECT b.employee_id,
    b.leave_type_id,
    b.hr_academic_year_id,
    b.hr_organization_id,
    t.leave_type_name,
    t.leave_type_code,
    t.request_category,
    t.color_code,
    t.display_order,
    t.duration_type,
    t.allow_half_day,
    t.allow_hourly,
    t.max_continuous_days,
    t.min_advance_notice_days,
    t.requires_documents,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    b.used,
    b.carried_forward,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + b.carried_forward - b.used AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days
   FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id AND y.frozen_at IS NOT NULL
     JOIN hr_leave_types t ON t.id = b.leave_type_id
     -- Frozen years too: an excluded category should disappear from HR
     -- everywhere, not linger in history screens.
     JOIN staff fs ON fs.id = b.employee_id
     JOIN employment_categories fec ON fec.id = fs.category_id AND fec.included_in_hr
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = b.employee_id AND o.leave_type_id = b.leave_type_id AND o.hr_academic_year_id = b.hr_academic_year_id;

-- =============================================================================
-- Mirrored from supabase/migrations/20260828130000_staff_id_backfill.sql (views)
-- =============================================================================

CREATE OR REPLACE VIEW public.v_staff_id_crosswalk
WITH (security_invoker = true) AS
SELECT full_name,
       institution_name,
       CASE WHEN is_teaching THEN 'Teaching' ELSE 'Non-teaching' END AS staff_type,
       CASE WHEN is_active   THEN 'Active'   ELSE 'Inactive'     END AS status,
       old_staff_id,
       new_staff_id,
       migrated_at
FROM public.staff_id_crosswalk;

COMMENT ON VIEW public.v_staff_id_crosswalk IS
  'Readable old -> new staff ID mapping for HR to export and circulate.';

-- Explicit, even though the view is security_invoker and the table beneath it is
-- locked: a view does NOT inherit the underlying table's RLS, so if the
-- security_invoker option is ever dropped this becomes an anon-readable dump of
-- every staff member's name, institution and old/new ID.
REVOKE ALL ON TABLE public.v_staff_id_crosswalk FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.v_staff_id_crosswalk TO authenticated;

-- ===========================================================================
-- v_hr_leave_balance / _src gained `accrued` and `pending` (2026-09-02)
-- Source: 20260902160000_hr_leave_accrual_and_pending_reservation.sql
--
--   available = accrued + carried_forward - used - pending
--
-- `entitled` and `used` keep their old meanings -- the ledger is NOT rewritten,
-- which is what keeps existing reports honest. New columns are appended because
-- CREATE OR REPLACE VIEW can only add at the end, and BOTH views move together
-- since the outer one lists its columns explicitly.
--
-- Pending arrives from ONE pre-aggregated LEFT JOIN over the unapproved rows,
-- and accrual from the IMMUTABLE kernel called inline: a querying function per
-- row would have turned a 12 ms view into thousands of queries.
--
-- The FROZEN-year branch does not accrue and takes no new requests, so its
-- available stays the arithmetic it always was.
--
-- Full definitions in the migration.
-- ===========================================================================
