-- Migration: MBA analyst views — privacy hardening (k>=5 guards must count INDIVIDUALS, not events)
-- Date: 2026-07-26
-- Follow-up to 20260726180000_mba_typea_analyst_views.sql (already applied to prod).
--
-- PROBLEM
--   fn_mba_analyst_views applies small-cell suppression as `WHERE <guard_col> >= 5`,
--   reading guard_col per view from mba_area_analyst_views. Two seeded views guarded on
--   an EVENT count instead of the DISTINCT-INDIVIDUAL count, so a group with >=5 events
--   but <5 people could expose one person's data:
--     * learning_finance_collection_yearly guarded on `receipts`, but the individuals
--       are PAYERS (distinct_payers, already a column). A single payer with >=5 receipts
--       would pass the guard and expose their total collection. (Already hot-fixed on
--       prod as a data UPDATE; this migration RECORDS it so repo == prod — idempotent.)
--     * learning_hr_leave_utilization guarded on `applications`, but the individuals are
--       EMPLOYEES, and the view had NO distinct-employee column. One employee filing >=5
--       leaves would expose their leave pattern.
--
-- AUDIT OF THE OTHER 6 NEW VIEWS  (evidence: live schema + constraints + data, 2026-07-26)
--   * learning_hostel_occupancy — guard `allocations` (events); individuals are
--       residents (hostel_allocations.learner_id, 602/602 populated; resident_id all
--       NULL). No unique constraint stops a learner from holding >1 allocation in one
--       (academic_year, status, allocation_type) group => a smaller individual count is
--       possible => FIXED (add distinct_residents, guard on it).
--   * learning_placement_outcomes — guard `placements` (events); individuals are learners
--       (cdc_placements.learner_id). SENSITIVE (money + individual). No unique constraint
--       on learner => multiple offers/rounds per learner can share one (status, month)
--       group => FIXED (add distinct_learners, guard on it).
--   * learning_academic_assessment_performance — guard `learners_assessed` = count(*).
--       rcltp_assessment_results has UNIQUE(assessment_id) (live: 48 rows / 48 distinct
--       assessments / max 1 learner per assessment), so each (institution, assessment)
--       group is exactly one result = one learner and is always suppressed. count(*) ==
--       distinct learners by construction => NO under-count => LEFT UNCHANGED.
--   * learning_transport_ridership — guard `riders` = count(*). pp_bus_assignments has
--       UNIQUE(learner_profile_id, route_id), so a learner is counted at most once per
--       route => riders == distinct riders => NO under-count => LEFT UNCHANGED.
--   * learning_accreditation_committee_activity — guard_col already NULL; aggregates
--       committee MEETINGS (institution-level documents), no individuals => LEFT UNCHANGED.
--   * learning_procurement_spend — guard_col already NULL; aggregates purchase ORDERS
--       (institution-level financial documents), supplier never selected, no individuals
--       => LEFT UNCHANGED.
--
-- Safe no-op for existing data: records one data UPDATE, appends an aggregate count
-- column to 3 views (CREATE OR REPLACE, new column appended at the end to satisfy the
-- same-column-order rule), re-grants those views to mba_learner_analyst, and repoints 3
-- guard_col values. No new individual-level data is exposed (only DISTINCT counts).
-- Ships DORMANT like its parent — no behaviour changes until an Associate is posted.

BEGIN;

-- ============================================================================
-- 1. finance — RECORD the prod hot-fix: guard on distinct payers, not receipts.
--    The view already exposes distinct_payers; only the guard pointer changes.
--    Idempotent (matches the value already live on prod).
-- ============================================================================
UPDATE public.mba_area_analyst_views
   SET guard_col = 'distinct_payers'
 WHERE view_name = 'learning_finance_collection_yearly';

-- ============================================================================
-- 2. hr — add a distinct-employee count and guard on it.
--    Existing columns kept in identical order; distinct_employees appended at the
--    end (required by CREATE OR REPLACE VIEW). GROUP BY unchanged.
-- ============================================================================
CREATE OR REPLACE VIEW public.learning_hr_leave_utilization AS
 SELECT o.institution_id,
    i.name AS institution,
    lt.leave_type_name AS leave_type,
    date_trunc('month'::text, la.start_date::timestamp with time zone)::date AS leave_month,
    count(*) AS applications,
    count(*) FILTER (WHERE la.status::text = 'approved'::text) AS approved,
    round(sum(la.total_days), 1) AS total_days,
    round(avg(la.total_days), 2) AS avg_days,
    count(DISTINCT la.employee_id) AS distinct_employees
   FROM hr_leave_applications la
     JOIN hr_organizations o ON o.id = la.hr_organization_id
     LEFT JOIN institutions i ON i.id = o.institution_id
     LEFT JOIN hr_leave_types lt ON lt.id = la.leave_type_id
  GROUP BY o.institution_id, i.name, lt.leave_type_name, (date_trunc('month'::text, la.start_date::timestamp with time zone)::date);

-- Re-grant after replace (privileges persist across REPLACE; explicit for the audit trail).
GRANT SELECT ON public.learning_hr_leave_utilization TO mba_learner_analyst;

UPDATE public.mba_area_analyst_views
   SET guard_col = 'distinct_employees'
 WHERE view_name = 'learning_hr_leave_utilization';

-- ============================================================================
-- 3. hostel — add a distinct-resident count (learner_id) and guard on it.
--    Existing columns kept in identical order; distinct_residents appended at end.
-- ============================================================================
CREATE OR REPLACE VIEW public.learning_hostel_occupancy AS
 SELECT ha.institution_id,
    i.name AS institution,
    ha.academic_year_id,
    ha.status::text AS allocation_status,
    ha.allocation_type::text AS allocation_type,
    count(*) AS allocations,
    count(*) FILTER (WHERE ha.actual_vacate_date IS NULL) AS currently_resident,
    count(*) FILTER (WHERE ha.actual_vacate_date IS NOT NULL) AS vacated,
    count(DISTINCT ha.learner_id) AS distinct_residents
   FROM hostel_allocations ha
     LEFT JOIN institutions i ON i.id = ha.institution_id
  GROUP BY ha.institution_id, i.name, ha.academic_year_id, (ha.status::text), (ha.allocation_type::text);

GRANT SELECT ON public.learning_hostel_occupancy TO mba_learner_analyst;

UPDATE public.mba_area_analyst_views
   SET guard_col = 'distinct_residents'
 WHERE view_name = 'learning_hostel_occupancy';

-- ============================================================================
-- 4. placement (SENSITIVE) — add a distinct-learner count and guard on it.
--    Existing columns kept in identical order; distinct_learners appended at end.
-- ============================================================================
CREATE OR REPLACE VIEW public.learning_placement_outcomes AS
 SELECT lp.institution_id,
    i.name AS institution,
    p.status::text AS placement_status,
    date_trunc('month'::text, p.offered_at)::date AS offer_month,
    count(*) AS placements,
    round(avg(p.package_lpa), 2) AS avg_package_lpa,
    round(avg(p.package_inr_total), 0) AS avg_package_inr,
    count(DISTINCT p.learner_id) AS distinct_learners
   FROM cdc_placements p
     JOIN learners_profiles lp ON lp.id = p.learner_id
     LEFT JOIN institutions i ON i.id = lp.institution_id
  GROUP BY lp.institution_id, i.name, (p.status::text), (date_trunc('month'::text, p.offered_at)::date);

GRANT SELECT ON public.learning_placement_outcomes TO mba_learner_analyst;

UPDATE public.mba_area_analyst_views
   SET guard_col = 'distinct_learners'
 WHERE view_name = 'learning_placement_outcomes';

COMMIT;
