-- =====================================================================================
-- Rewrite fn_group_dashboard_overview to leads-only purity
-- =====================================================================================
--
-- WHY:
--   The /admission/group-dashboard page sits under the Admission CRM module and is
--   intended to be a leads-only view. The existing fn_group_dashboard_overview RPC
--   mixed two cohorts: lead counts (correct) and learner counts (wrong cohort) for
--   the "Applied", "Active", "Rejected", and "Filled" metrics. Per Director directive
--   2026-05-10: "this entire /admission/group-dashboard is for admission leads only".
--
-- WHAT CHANGES (4 columns repointed from learners_profiles to admission_leads):
--   | Column              | OLD source (learners_profiles)               | NEW source (admission_leads)               |
--   |---------------------|----------------------------------------------|--------------------------------------------|
--   | applied_learners    | lifecycle_status IN (admitted,pending,...)   | funnel_stage = 'application_started'       |
--   | active_learners     | lifecycle_status = 'active'                  | funnel_stage = 'enrolled'                  |
--   | rejected_learners   | lifecycle_status = 'rejected'                | funnel_stage = 'declined'                  |
--   | filled_seats        | lifecycle_status IN (admitted,active,...)    | funnel_stage = 'enrolled' (= active)       |
--
--   No change: total_leads, active_crm_leads, lost_leads, total_seats.
--   fill_percentage is recomputed against the new (leads-sourced) filled_seats.
--   Function signature, return columns, return order, security context, and search_path
--   are preserved 1:1 so the consumer in lib/services/admission/group-dashboard-service.ts
--   keeps working without code changes.
--
-- WHEN: 2026-05-10
--
-- ROW SHAPE COMPATIBILITY:
--   Signature  (p_institution_ids uuid[], p_admission_year_id uuid, p_program_start_year integer)  — UNCHANGED
--   Returns    (institution_id, institution_name, total_leads, active_crm_leads, lost_leads,
--               applied_learners, active_learners, rejected_learners,
--               total_seats, filled_seats, fill_percentage)  — UNCHANGED column names and order
--
-- NOTES ON SEMANTIC CHOICES (made explicit so reviewers can challenge):
--   - "rejected_learners" is mapped ONLY to funnel_stage = 'declined' (an explicit reject by
--     the institution or candidate-explicit-no). Other terminal-but-non-reject stages
--     ('lost', 'withdrew', 'expired', 'not_reachable') are NOT counted as rejected because:
--       * 'lost' already feeds the dedicated lost_leads metric — double-counting would mislead
--       * 'withdrew' is candidate-self-pull (different intent than rejection)
--       * 'expired' is timeout-driven (not a reject decision)
--       * 'not_reachable' is an active-CRM operational state, not a terminal reject
--     If Director or reviewer wants a broader "rejected" definition, this is the one line
--     to change — the inverse mapping is intentional and documented.
--   - "filled_seats" equals "active_learners" under leads-only purity because in lead-space
--     the only signal a seat is filled is the lead reaching funnel_stage='enrolled'. The
--     learner-side concept of "graduated/account" lifecycle has no lead-space analog.
--
-- TIER:
--   TIER-3 per ~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_migration_notification_protocol.md
--   (DROP/CREATE FUNCTION). Recovery profile per reference_supabase_recovery_baseline.md:
--   PITR is OFF, daily snapshots only, 7-day retention, ~24-hour worst-case data loss on
--   restore. The function rewrite itself is recoverable by restoring the old definition
--   verbatim from the PR body — no data is changed by this migration.
-- =====================================================================================

DROP FUNCTION IF EXISTS public.fn_group_dashboard_overview(uuid[], uuid, integer);

CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(
  p_institution_ids    uuid[],
  p_admission_year_id  uuid    DEFAULT NULL,
  p_program_start_year integer DEFAULT NULL
)
RETURNS TABLE(
  institution_id     uuid,
  institution_name   text,
  total_leads        bigint,
  active_crm_leads   bigint,
  lost_leads         bigint,
  applied_learners   bigint,
  active_learners    bigint,
  rejected_learners  bigint,
  total_seats        bigint,
  filled_seats       bigint,
  fill_percentage    numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ay_scope AS (
    SELECT ay.id, ay.institution_id, ay.program_id, ay.program_start_year, ay.sanctioned_intake
    FROM admission_years ay
    WHERE ay.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL AND ay.id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ay.program_start_year = p_program_start_year)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL
             AND ay.is_active = true)
          )
  ),
  lead_counts AS (
    SELECT
      al.institution_id,
      COUNT(*)                                                                           AS total,
      COUNT(*) FILTER (WHERE COALESCE(al.is_active, true) AND NOT COALESCE(al.is_lost, false)) AS active_crm,
      COUNT(*) FILTER (WHERE COALESCE(al.is_lost, false) OR al.funnel_stage::text IN ('lost','not_reachable')) AS lost,
      -- Leads-only purity: 4 metrics below repointed from learners_profiles to admission_leads
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'application_started')              AS applied,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'enrolled')                          AS active,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'declined')                          AS rejected,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'enrolled')                          AS filled
    FROM admission_leads al
    WHERE al.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND al.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ( al.admission_year_id IN (SELECT id FROM ay_scope)
                OR (al.admission_year_id IS NULL
                    AND EXTRACT(year FROM al.created_at)::int = p_program_start_year) ))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
    GROUP BY al.institution_id
  ),
  seat_totals AS (
    SELECT institution_id, SUM(sanctioned_intake)::bigint AS total_seats
    FROM ay_scope
    GROUP BY institution_id
  )
  SELECT
    i.id,
    i.name::text,
    COALESCE(lc.total,           0)::bigint,
    COALESCE(lc.active_crm,      0)::bigint,
    COALESCE(lc.lost,            0)::bigint,
    COALESCE(lc.applied,         0)::bigint,
    COALESCE(lc.active,          0)::bigint,
    COALESCE(lc.rejected,        0)::bigint,
    COALESCE(st.total_seats,     0)::bigint,
    COALESCE(lc.filled,          0)::bigint,
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(lc.filled, 0)::numeric / st.total_seats * 100, 1)
    END
  FROM institutions i
  LEFT JOIN lead_counts lc ON lc.institution_id = i.id
  LEFT JOIN seat_totals st ON st.institution_id = i.id
  WHERE i.id = ANY(p_institution_ids)
    AND role_has_institution_access(i.id)
  ORDER BY i.name;
$function$;
