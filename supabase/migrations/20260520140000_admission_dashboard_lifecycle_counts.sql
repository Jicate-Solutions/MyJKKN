-- =====================================================================================
-- Admission Dashboard: switch dashboard + funnel summary to lifecycle-status counts
-- =====================================================================================
--
-- WHY: After the 2026-05-20 workflow realignment + group-dashboard lifecycle
--      migration (20260520130000), the per-institution /admission/dashboard page
--      still surfaces funnel_stage-based KPIs ('applicationStartRate', 26-stage
--      admission_lead_stage funnel). Users want the same lifecycle-status focus
--      across the admission dashboard too.
--
-- WHAT CHANGES (additive — no breaking removals):
--   get_admission_dashboard_summary_aggregate:
--     + enquiryCount, enquirySubmittedCount, accountCount, reservedCount,
--       admittedCount (= admitted + active), rejectedLifecycleCount
--     All existing fields preserved for back-compat during rollout.
--
--   get_admission_funnel_summary_aggregate:
--     + lifecycleByStage (jsonb map: enquiry/enquiry_submitted/account/reserved/admitted/etc)
--     Existing byStage map (funnel_stage) preserved.
--
-- =====================================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Dashboard summary — extend with lifecycle counts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admission_dashboard_summary_aggregate(
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH lead_agg AS (
    SELECT
      COUNT(*)                                                                                                AS total_leads,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))                                          AS new_leads,
      COUNT(*) FILTER (WHERE COALESCE(stage::text, funnel_stage::text) = 'enrolled')                          AS converted_leads,
      COUNT(*) FILTER (WHERE learner_profile_id IS NOT NULL)                                                  AS application_started_leads,
      COUNT(*) FILTER (
        WHERE next_followup_at IS NOT NULL
          AND next_followup_at <= now()
          AND COALESCE(stage::text, funnel_stage::text) NOT IN ('enrolled','lost')
      )                                                                                                        AS pending_followups,
      COUNT(*) FILTER (
        WHERE next_followup_at::date = CURRENT_DATE
          AND COALESCE(stage::text, funnel_stage::text) NOT IN ('enrolled','lost')
      )                                                                                                        AS today_followups
    FROM admission_leads
    WHERE p_institution_id IS NULL OR institution_id = p_institution_id
  ),
  lifecycle_agg AS (
    -- 2026-05-20: lifecycle-status counts from learners_profiles, scoped to the
    -- same institution as the lead-side aggregate. Used by the redesigned KPI
    -- strip + 6-stage lifecycle funnel visualization on /admission/dashboard.
    SELECT
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'enquiry')              AS enquiry_count,
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'enquiry_submitted')    AS enquiry_submitted_count,
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'account')              AS account_count,
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'reserved')             AS reserved_count,
      -- Admitted KPI sums admitted + active per workflow spec
      COUNT(*) FILTER (WHERE lifecycle_status::text IN ('admitted','active')) AS admitted_count,
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'rejected')             AS rejected_lifecycle_count
    FROM learners_profiles
    WHERE p_institution_id IS NULL OR institution_id = p_institution_id
  )
  SELECT jsonb_build_object(
    'totalLeads',              la.total_leads,
    'newLeads',                la.new_leads,
    'convertedLeads',          la.converted_leads,
    'applicationStartedLeads', la.application_started_leads,
    'pendingFollowups',        la.pending_followups,
    'todayFollowups',          la.today_followups,
    'conversionRate',
      CASE WHEN la.total_leads > 0
        THEN ROUND((la.converted_leads::numeric / la.total_leads) * 1000) / 10
        ELSE 0
      END,
    'applicationStartRate',
      CASE WHEN la.total_leads > 0
        THEN ROUND((la.application_started_leads::numeric / la.total_leads) * 1000) / 10
        ELSE 0
      END,
    -- 2026-05-20: new lifecycle-status counts
    'enquiryCount',            COALESCE(lc.enquiry_count, 0),
    'enquirySubmittedCount',   COALESCE(lc.enquiry_submitted_count, 0),
    'accountCount',            COALESCE(lc.account_count, 0),
    'reservedCount',           COALESCE(lc.reserved_count, 0),
    'admittedCount',           COALESCE(lc.admitted_count, 0),
    'rejectedLifecycleCount',  COALESCE(lc.rejected_lifecycle_count, 0)
  )
  FROM lead_agg la
  CROSS JOIN lifecycle_agg lc;
$$;

GRANT EXECUTE ON FUNCTION public.get_admission_dashboard_summary_aggregate(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_admission_dashboard_summary_aggregate(uuid) IS
  'Returns the admission dashboard KPI summary as a single jsonb. 2026-05-20: extended with lifecycle-status counts (enquiry/enquiry_submitted/account/reserved/admitted/rejected) from learners_profiles, scoped by institution.';

-- ----------------------------------------------------------------------------
-- 2) Funnel summary — add lifecycleByStage alongside byStage
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admission_funnel_summary_aggregate(
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM admission_leads
    WHERE p_institution_id IS NULL OR institution_id = p_institution_id
  ),
  totals AS (
    SELECT
      COUNT(*)                                              AS total_count,
      COUNT(*) FILTER (WHERE is_hot_lead = true)            AS hot_count,
      COUNT(*) FILTER (WHERE is_hot_lead = true OR is_priority = true) AS priority_count
    FROM base
  ),
  stages AS (
    SELECT
      COALESCE(stage::text, funnel_stage::text) AS stage_key,
      COUNT(*)                                  AS count
    FROM base
    WHERE COALESCE(stage::text, funnel_stage::text) IS NOT NULL
    GROUP BY COALESCE(stage::text, funnel_stage::text)
  ),
  -- 2026-05-20: per-lifecycle-stage counts on learners_profiles (collapses
  -- admitted+active into one bucket called 'admitted' per the workflow spec).
  lifecycle_stages AS (
    SELECT stage_key, SUM(count) AS count
    FROM (
      SELECT
        CASE WHEN lifecycle_status::text IN ('admitted','active')
             THEN 'admitted'
             ELSE lifecycle_status::text
        END AS stage_key,
        COUNT(*) AS count
      FROM learners_profiles
      WHERE p_institution_id IS NULL OR institution_id = p_institution_id
      GROUP BY lifecycle_status
    ) s
    GROUP BY stage_key
  )
  SELECT jsonb_build_object(
    'totalLeads',     (SELECT total_count FROM totals),
    'hotLeads',       (SELECT hot_count FROM totals),
    'priorityLeads',  (SELECT priority_count FROM totals),
    'byStage',
      COALESCE((SELECT jsonb_object_agg(stage_key, count) FROM stages), '{}'::jsonb),
    -- 2026-05-20: lifecycle-status map. Consumed by the new 6-stage funnel viz
    -- on /admission/dashboard (replaces the 26-stage admission_lead_stage chart).
    'lifecycleByStage',
      COALESCE((SELECT jsonb_object_agg(stage_key, count) FROM lifecycle_stages), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_admission_funnel_summary_aggregate(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_admission_funnel_summary_aggregate(uuid) IS
  'Returns funnel summary as jsonb: totalLeads, hotLeads, priorityLeads, byStage (funnel_stage), lifecycleByStage (lifecycle_status — admitted+active collapsed into "admitted"). 2026-05-20 added lifecycleByStage for the workflow-realigned dashboard.';

COMMIT;
