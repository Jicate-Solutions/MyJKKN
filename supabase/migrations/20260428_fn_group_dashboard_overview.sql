-- =============================================================================
-- fn_group_dashboard_overview — Admission CRM group dashboard funnel counts
-- Date: 2026-04-28
-- =============================================================================
-- Returns one row per institution with:
--   - lead-side metrics from admission_leads (top of funnel)
--   - learner-side metrics from learners_profiles (post-conversion truth)
--   - seat capacity from admission_years.sanctioned_intake (canonical source)
--
-- Two scoping modes (mutually exclusive in normal usage):
--   p_admission_year_id     — strict filter on the AY UUID (only ~3% of leads
--                             populate this today; will tighten over time as we
--                             backfill).
--   p_program_start_year    — pragmatic fallback: matches admission_year_id
--                             when present, else EXTRACT(year FROM created_at)
--                             on leads / learners_profiles.admission_year int.
--
-- Replaces the JS fan-out in group-dashboard-service.ts:23-174 which suffered
-- from three compounding bugs:
--   (1) no admission_year filter at all → all-time totals
--   (2) "Applied" used funnel_stage IN (...) but production funnel never
--       advances past 'application_started' → always 0
--   (3) "Enrolled" used funnel_stage='enrolled' (rarely written) instead of
--       learners_profiles.lifecycle_status (canonical post-conversion source)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(
  p_institution_ids    uuid[],
  p_admission_year_id  uuid    DEFAULT NULL,
  p_program_start_year integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  total_leads       bigint,
  active_crm_leads  bigint,
  lost_leads        bigint,
  applied_learners  bigint,
  active_learners   bigint,
  rejected_learners bigint,
  total_seats       bigint,
  filled_seats      bigint,
  fill_percentage   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ay_scope AS (
    SELECT id, ay.institution_id, program_id, program_start_year, sanctioned_intake
    FROM admission_years ay
    WHERE ay.is_active = true
      AND ay.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL AND ay.id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ay.program_start_year = p_program_start_year)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
  ),
  lead_counts AS (
    SELECT
      al.institution_id,
      COUNT(*)                                                                 AS total,
      COUNT(*) FILTER (WHERE COALESCE(al.is_active, true) AND NOT COALESCE(al.is_lost, false)) AS active_crm,
      COUNT(*) FILTER (WHERE COALESCE(al.is_lost, false) OR al.funnel_stage::text IN ('lost','not_reachable')) AS lost
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
  learner_counts AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','pending','approved','account','waitlisted')) AS applied,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'active')   AS active,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'rejected') AS rejected,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active','graduated')) AS filled
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND lp.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND ( lp.admission_year_id IN (SELECT id FROM ay_scope)
                OR (lp.admission_year_id IS NULL
                    AND lp.admission_year = p_program_start_year) ))
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
    COALESCE(lpc.applied,        0)::bigint,
    COALESCE(lpc.active,         0)::bigint,
    COALESCE(lpc.rejected,       0)::bigint,
    COALESCE(st.total_seats,     0)::bigint,
    COALESCE(lpc.filled,         0)::bigint,
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(lpc.filled, 0)::numeric / st.total_seats * 100, 1)
    END
  FROM institutions i
  LEFT JOIN lead_counts    lc  ON lc.institution_id  = i.id
  LEFT JOIN learner_counts lpc ON lpc.institution_id = i.id
  LEFT JOIN seat_totals    st  ON st.institution_id  = i.id
  WHERE i.id = ANY(p_institution_ids)
  ORDER BY i.name;
$$;

COMMENT ON FUNCTION public.fn_group_dashboard_overview(uuid[], uuid, integer) IS
  'Group dashboard Overview tab funnel counts. Returns one row per institution with lead/learner/seat metrics scoped by admission year. Pass p_admission_year_id for strict filter, or p_program_start_year for pragmatic fallback that handles sparse admission_year_id population.';

GRANT EXECUTE ON FUNCTION public.fn_group_dashboard_overview(uuid[], uuid, integer) TO authenticated, service_role;
