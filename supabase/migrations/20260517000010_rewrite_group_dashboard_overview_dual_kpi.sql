-- =====================================================================================
-- Rewrite fn_group_dashboard_overview to expose BOTH lead-space and learner-space
-- "seats filled" KPIs side-by-side.
-- =====================================================================================
--
-- WHY:
--   The /admission/group-dashboard page surfaces a single "filled_seats" KPI today.
--   Per Task E3 of the dynamic-admission-statuses initiative, the accounts/admissions
--   teams need to see the gap between:
--     - enrolled_leads          : admission_leads.funnel_stage = 'enrolled'
--                                 (lead-space — "we got them across the line in CRM")
--     - seat_filled_learners    : learners_profiles.lifecycle_status IN
--                                 (SELECT code FROM admission_statuses
--                                   WHERE scope='learner' AND is_active=true
--                                     AND is_seat_filled=true)
--                                 (learner-space — "they actually showed up & became
--                                 active in the learner system")
--   The delta is the drop-off pursuit list (enrolled in CRM but never converted to an
--   active learner record).
--
-- WHAT CHANGES (signature change — ADDITIVE only):
--   filled_seats             — PRESERVED, same semantics (funnel_stage='enrolled').
--                              Kept for backward compatibility during rollout. Equal
--                              to enrolled_leads.
--   enrolled_leads           — NEW. Alias of filled_seats. UI may consume this name
--                              going forward.
--   seat_filled_learners     — NEW. Computed from learners_profiles via the dynamic
--                              admission_statuses catalog. Scoped to the same
--                              institution set, admission_year_id, or program_start_year
--                              filter that the leads side already honours.
--
--   All other return columns, order (up to the inserted ones), search_path, and
--   security context are preserved 1:1 with the 2026-05-10 leads-only rewrite.
--
-- BACKWARD COMPAT:
--   The function signature changes (return TABLE gains two columns). Postgres
--   requires DROP-then-CREATE for that.
--   Consumers selecting specific columns by name (e.g. group-dashboard-service.ts)
--   continue to work. SELECT *-style consumers will see two new columns at the end.
--
-- WHEN: 2026-05-17
--
-- TIER: TIER-3 (DROP/CREATE FUNCTION). No data is mutated.
-- =====================================================================================

DROP FUNCTION IF EXISTS public.fn_group_dashboard_overview(uuid[], uuid, integer);

CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(
  p_institution_ids    uuid[],
  p_admission_year_id  uuid    DEFAULT NULL,
  p_program_start_year integer DEFAULT NULL
)
RETURNS TABLE(
  institution_id        uuid,
  institution_name      text,
  total_leads           bigint,
  active_crm_leads      bigint,
  lost_leads            bigint,
  applied_learners      bigint,
  active_learners       bigint,
  rejected_learners     bigint,
  total_seats           bigint,
  filled_seats          bigint,   -- preserved alias = enrolled_leads
  enrolled_leads        bigint,   -- NEW (lead-space, funnel_stage='enrolled')
  seat_filled_learners  bigint,   -- NEW (learner-space, admission_statuses.is_seat_filled)
  fill_percentage       numeric
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
      -- Leads-only purity: 4 metrics below sourced from admission_leads
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
  seat_filled_codes AS (
    -- Dynamic catalog: which learner-scope statuses count as "seat filled"?
    SELECT code FROM admission_statuses
    WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
  ),
  learner_counts AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (
        WHERE lp.lifecycle_status::text IN (SELECT code FROM seat_filled_codes)
      ) AS seat_filled
    FROM learners_profiles lp
    WHERE lp.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND lp.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND lp.admission_year_id IN (SELECT id FROM ay_scope))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
    GROUP BY lp.institution_id
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
    COALESCE(lc.filled,          0)::bigint,                 -- filled_seats (preserved)
    COALESCE(lc.filled,          0)::bigint,                 -- enrolled_leads (NEW, same value)
    COALESCE(lrn.seat_filled,    0)::bigint,                 -- seat_filled_learners (NEW)
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(lc.filled, 0)::numeric / st.total_seats * 100, 1)
    END
  FROM institutions i
  LEFT JOIN lead_counts     lc  ON lc.institution_id  = i.id
  LEFT JOIN learner_counts  lrn ON lrn.institution_id = i.id
  LEFT JOIN seat_totals     st  ON st.institution_id  = i.id
  WHERE i.id = ANY(p_institution_ids)
    AND role_has_institution_access(i.id)
  ORDER BY i.name;
$function$;
