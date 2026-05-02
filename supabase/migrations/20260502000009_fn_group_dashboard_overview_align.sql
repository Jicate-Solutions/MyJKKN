-- Migration: 2026-05-02
-- Phase C-6: Align fn_group_dashboard_overview's filled bucket with the Summary
-- and Daily Pivot tabs. Previously the top-of-page Fill Rate card used the old
-- set ('admitted','active','graduated') and the OR-fallback on lp.admission_year
-- integer; this drove the 0% Fill Rate the user saw in the page header while
-- the Seat Analytics tab Summary card shows ~9%.
--
-- Three changes:
--   1. Add 'account' to the "filled" lifecycle bucket. Other buckets (applied,
--      active, rejected) keep their existing semantics.
--   2. Switch lp.admission_year integer match to admission_year_id FK only.
--      Phase A 2026-05-02 backfill makes the FK sufficient.
--   3. Drop the ay.is_active = true filter on the seat_totals CTE when an
--      explicit cohort year is supplied — historical cohorts (catalogued by
--      Phase A as inactive) must remain queryable.

DROP FUNCTION IF EXISTS public.fn_group_dashboard_overview(uuid[], uuid, integer);

CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(
  p_institution_ids    uuid[],
  p_admission_year_id  uuid    DEFAULT NULL,
  p_program_start_year integer DEFAULT NULL
)
RETURNS TABLE(
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
AS $function$
  WITH ay_scope AS (
    -- All admission_years matching the requested cohort, regardless of is_active.
    -- Falls through to is_active=true only when no year is specified.
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
      COUNT(*)                                                                 AS total,
      COUNT(*) FILTER (WHERE COALESCE(al.is_active, true) AND NOT COALESCE(al.is_lost, false)) AS active_crm,
      COUNT(*) FILTER (WHERE COALESCE(al.is_lost, false) OR al.funnel_stage::text IN ('lost','not_reachable')) AS lost
    FROM admission_leads al
    WHERE al.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND al.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND al.admission_year_id IN (SELECT id FROM ay_scope))
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
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted','active','graduated','account')) AS filled
    FROM learners_profiles lp
    WHERE lp.institution_id IS NOT NULL
      AND lp.institution_id = ANY(p_institution_ids)
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
    AND role_has_institution_access(i.id)
  ORDER BY i.name;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_group_dashboard_overview(uuid[], uuid, integer) TO authenticated;
