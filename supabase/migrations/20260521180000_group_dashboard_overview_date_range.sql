-- ============================================================================
-- 2026-05-21: fn_group_dashboard_overview gains optional date-range filter
-- ============================================================================
-- Adds p_from_date / p_to_date params (default NULL = no filter, preserves
-- existing behaviour). When set, filters created_at on BOTH admission_leads
-- (lead-side counts) AND learners_profiles (lifecycle counts) so the top
-- KPI strip stays internally consistent.
--
-- Dates are interpreted in IST (Asia/Kolkata) — UTC+5:30 — because that's
-- the dashboard's operational timezone. p_to_date is inclusive (end of day);
-- internally translated to `< (to_date + 1) AT TIME ZONE 'Asia/Kolkata'`.
--
-- Drives the new "All time / Today / Custom range" segmented toggle on the
-- Overview tab. URL state via ?from= / ?to=.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(
  p_institution_ids uuid[],
  p_admission_year_id uuid DEFAULT NULL::uuid,
  p_program_start_year integer DEFAULT NULL::integer,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
 RETURNS TABLE(
   institution_id uuid, institution_name text, total_leads bigint,
   active_crm_leads bigint, lost_leads bigint, applied_learners bigint,
   active_learners bigint, rejected_learners bigint, total_seats bigint,
   filled_seats bigint, enrolled_leads bigint, seat_filled_learners bigint,
   fill_percentage numeric, enquiry_count bigint, enquiry_submitted_count bigint,
   account_count bigint, reserved_count bigint, admitted_count bigint,
   rejected_lifecycle_count bigint
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
  date_window AS (
    SELECT
      (p_from_date AT TIME ZONE 'Asia/Kolkata')       AS from_utc,
      ((p_to_date + 1) AT TIME ZONE 'Asia/Kolkata')   AS to_utc_exclusive
  ),
  lead_counts AS (
    SELECT
      al.institution_id,
      COUNT(*)                                                                           AS total,
      COUNT(*) FILTER (WHERE COALESCE(al.is_active, true) AND NOT COALESCE(al.is_lost, false)) AS active_crm,
      COUNT(*) FILTER (WHERE COALESCE(al.is_lost, false) OR al.funnel_stage::text IN ('lost','not_reachable')) AS lost,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'application_started')              AS applied,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'enrolled')                          AS active,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'declined')                          AS rejected,
      COUNT(*) FILTER (WHERE al.funnel_stage::text = 'enrolled')                          AS filled
    FROM admission_leads al
    CROSS JOIN date_window dw
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
      AND (p_from_date IS NULL OR al.created_at >= dw.from_utc)
      AND (p_to_date IS NULL OR al.created_at <  dw.to_utc_exclusive)
    GROUP BY al.institution_id
  ),
  seat_filled_codes AS (
    SELECT code FROM admission_statuses
    WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
  ),
  learner_lifecycle_counts AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN (SELECT code FROM seat_filled_codes))  AS seat_filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'enquiry')                              AS lc_enquiry,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'enquiry_submitted')                    AS lc_enquiry_submitted,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'account')                              AS lc_account,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved')                             AS lc_reserved,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted', 'active'))                AS lc_admitted_plus_active,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'rejected')                             AS lc_rejected
    FROM learners_profiles lp
    CROSS JOIN date_window dw
    WHERE lp.institution_id = ANY(p_institution_ids)
      AND (
            (p_admission_year_id IS NOT NULL
             AND lp.admission_year_id = p_admission_year_id)
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NOT NULL
             AND lp.admission_year_id IN (SELECT id FROM ay_scope))
         OR (p_admission_year_id IS NULL AND p_program_start_year IS NULL)
          )
      AND (p_from_date IS NULL OR lp.created_at >= dw.from_utc)
      AND (p_to_date IS NULL OR lp.created_at <  dw.to_utc_exclusive)
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
    COALESCE(lc.total,                              0)::bigint,
    COALESCE(lc.active_crm,                         0)::bigint,
    COALESCE(lc.lost,                               0)::bigint,
    COALESCE(lc.applied,                            0)::bigint,
    COALESCE(lc.active,                             0)::bigint,
    COALESCE(lc.rejected,                           0)::bigint,
    COALESCE(st.total_seats,                        0)::bigint,
    COALESCE(lc.filled,                             0)::bigint,
    COALESCE(lc.filled,                             0)::bigint,
    COALESCE(lrn.seat_filled,                       0)::bigint,
    CASE WHEN COALESCE(st.total_seats, 0) = 0 THEN 0::numeric
         ELSE ROUND(COALESCE(lc.filled, 0)::numeric / st.total_seats * 100, 1)
    END,
    COALESCE(lrn.lc_enquiry,                        0)::bigint,
    COALESCE(lrn.lc_enquiry_submitted,              0)::bigint,
    COALESCE(lrn.lc_account,                        0)::bigint,
    COALESCE(lrn.lc_reserved,                       0)::bigint,
    COALESCE(lrn.lc_admitted_plus_active,           0)::bigint,
    COALESCE(lrn.lc_rejected,                       0)::bigint
  FROM institutions i
  LEFT JOIN lead_counts             lc  ON lc.institution_id  = i.id
  LEFT JOIN learner_lifecycle_counts lrn ON lrn.institution_id = i.id
  LEFT JOIN seat_totals             st  ON st.institution_id  = i.id
  WHERE i.id = ANY(p_institution_ids)
    AND role_has_institution_access(i.id)
  ORDER BY i.name;
$function$;
