-- =====================================================================================
-- Group Dashboard: switch KPIs + analytics to lifecycle-status-based counts
-- =====================================================================================
--
-- WHY:
--   After the 2026-05-20 workflow realignment (enquiry → enquiry_submitted → account →
--   reserved → admitted → active), the group dashboard's "Applied" + "Enrolled Leads"
--   KPIs still sourced from admission_leads.funnel_stage. Users want lead counts
--   analytics driven by learners_profiles.lifecycle_status across all tabs.
--
-- WHAT CHANGES:
--   fn_group_dashboard_overview: ADDITIVE — six new return columns sourced from
--     learners_profiles.lifecycle_status, scoped by the same admission_year_id /
--     program_start_year filter the leads side uses.
--       enquiry_count, enquiry_submitted_count, account_count, reserved_count,
--       admitted_count (= 'admitted' + 'active' per spec), rejected_lifecycle_count.
--     Legacy columns (applied_learners / active_learners / etc.) preserved so any
--     SELECT-by-name consumer that hasn't been updated keeps reading.
--
--   fn_source_analytics: enrolled_count formula narrows from
--     ('admitted','active','graduated','account') → ('admitted','active'). New
--     column 'admitted_count' added as a clearer alias. Together with the KPI
--     redefinition, every analytic now reflects "the people who got admitted
--     (and either still are, or progressed to active)".
--
--   fn_geography_analytics: UNCHANGED. Geography shows "where learners came from"
--     and includes graduated cohorts intentionally (historic-cohort retention).
--
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- fn_group_dashboard_overview — additive extension
-- ─────────────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_group_dashboard_overview(uuid[], uuid, integer);

CREATE OR REPLACE FUNCTION public.fn_group_dashboard_overview(
  p_institution_ids    uuid[],
  p_admission_year_id  uuid    DEFAULT NULL,
  p_program_start_year integer DEFAULT NULL
)
RETURNS TABLE(
  institution_id              uuid,
  institution_name            text,
  total_leads                 bigint,
  active_crm_leads            bigint,
  lost_leads                  bigint,
  applied_learners            bigint,
  active_learners             bigint,
  rejected_learners           bigint,
  total_seats                 bigint,
  filled_seats                bigint,
  enrolled_leads              bigint,
  seat_filled_learners        bigint,
  fill_percentage             numeric,
  -- NEW lifecycle-status-based counts (2026-05-20)
  enquiry_count               bigint,
  enquiry_submitted_count     bigint,
  account_count               bigint,
  reserved_count              bigint,
  admitted_count              bigint,   -- 'admitted' + 'active' per workflow spec
  rejected_lifecycle_count    bigint
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
    SELECT code FROM admission_statuses
    WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
  ),
  -- NEW: lifecycle-status counts per institution, same scope as lead_counts.
  learner_lifecycle_counts AS (
    SELECT
      lp.institution_id,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN (SELECT code FROM seat_filled_codes))  AS seat_filled,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'enquiry')                              AS lc_enquiry,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'enquiry_submitted')                    AS lc_enquiry_submitted,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'account')                              AS lc_account,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'reserved')                             AS lc_reserved,
      -- Per workflow spec: Admitted KPI sums both admitted and active because
      -- anyone currently 'active' was previously at 'admitted' (sequential gate).
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text IN ('admitted', 'active'))                AS lc_admitted_plus_active,
      COUNT(*) FILTER (WHERE lp.lifecycle_status::text = 'rejected')                             AS lc_rejected
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
    -- NEW lifecycle columns
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

GRANT EXECUTE ON FUNCTION public.fn_group_dashboard_overview(uuid[], uuid, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- fn_source_analytics — narrow enrolled_count semantics, add admitted_count alias
-- ─────────────────────────────────────────────────────────────────────────────────────
-- 2026-05-20: 'enrolled_count' formula was {admitted,active,graduated,account} per
-- the 2026-05-02 dashboard-wide cohort definition. The new workflow makes 'admitted'
-- the canonical "got across the finish line" status (auto-applied at 50% fees
-- threshold, then auto-promoted to active on profile-complete). enrolled_count now
-- means the same as admitted_count: lifecycle_status IN ('admitted','active').

DROP FUNCTION IF EXISTS public.fn_source_analytics(uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_source_analytics(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE(
  institution_id    uuid,
  institution_name  text,
  source            text,
  referral_type     text,
  lead_count        integer,
  enrolled_count    integer,    -- preserved alias for back-compat (= admitted_count)
  admitted_count    integer,    -- NEW: clearer name for new workflow
  conversion_rate   numeric,
  last_enrolled_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  WITH eligible_institutions AS (
    SELECT id FROM institutions
    WHERE id = ANY(p_institution_ids) AND role_has_institution_access(id)
  ),
  cohort_ay_ids AS (
    SELECT id FROM admission_years
    WHERE p_admission_year IS NOT NULL AND program_start_year = p_admission_year
  ),
  scoped_leads AS (
    SELECT al.id, al.institution_id, al.source::text AS source,
           COALESCE(NULLIF(TRIM(al.referral_type), ''), '') AS referral_type,
           al.learner_profile_id
    FROM admission_leads al
    WHERE al.institution_id IN (SELECT id FROM eligible_institutions)
      AND (p_admission_year IS NULL OR al.admission_year_id IN (SELECT id FROM cohort_ay_ids))
  ),
  per_lead_status AS (
    SELECT sl.id, sl.institution_id, sl.source, sl.referral_type,
           lp.lifecycle_status::text AS lp_status, lp.activated_at
    FROM scoped_leads sl
    LEFT JOIN learners_profiles lp ON lp.id = sl.learner_profile_id
    WHERE sl.learner_profile_id IS NULL
       OR p_admission_year IS NULL
       OR lp.admission_year_id IN (SELECT id FROM cohort_ay_ids)
       OR lp.admission_year_id IS NULL
  )
  SELECT pls.institution_id, i.name::text, pls.source, pls.referral_type,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active'))::int   AS enrolled_count,
    COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active'))::int   AS admitted_count,
    CASE WHEN COUNT(*) = 0 THEN 0::numeric
         ELSE ROUND(COUNT(*) FILTER (WHERE pls.lp_status IN ('admitted','active'))::numeric
                    / COUNT(*)::numeric * 100, 2) END,
    MAX(pls.activated_at) FILTER (WHERE pls.lp_status IN ('admitted','active'))
  FROM per_lead_status pls JOIN institutions i ON i.id = pls.institution_id
  GROUP BY pls.institution_id, i.name, pls.source, pls.referral_type
  ORDER BY i.name, pls.source, pls.referral_type;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_source_analytics(uuid[], integer) TO authenticated;
