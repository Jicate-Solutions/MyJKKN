-- =====================================================================================
-- Migration: Reconcile admission dashboard aggregate RPCs + admission_leads read-policy perf
-- Date:      2026-07-03
-- Status:    ALREADY APPLIED to production (out-of-band via Management API, 2026-07-03
--            09:15-09:40 IST). This file records the final reconciled state so the
--            repo matches prod. Re-applying is idempotent.
--
-- CONTEXT (three interleaved changes on the same objects):
--  1) PERF/UX: eao@ (executive_admin_officer, scope='all', full admission perms) saw
--     all-zero stat cards on /admission/dashboard. Root cause: adm_leads_select RLS
--     evaluated row-independent scope functions (user_has_permission,
--     _user_accessible_institutions, _user_in_admission_lead_allowlist,
--     _user_is_strict_counselor) ONCE PER ROW over 20,888 admission_leads
--     (~18s > the authenticated role's 8s statement_timeout -> PostgREST 500 ->
--     the UI's `query.data || zeros` fallback painted silent zeros).
--     FIX: wrap row-independent calls in scalar subqueries (InitPlan; evaluated once
--     per statement). Semantics identical -- verified pre/post on 5 subjects
--     (2 counselors 147/203 rows, 2 is_admin() users 20,888, EAO 20,888) and
--     all three dashboard calls now complete in ~1.2s.
--     NOTE: super-admin / is_admin() users never noticed because their policy branch
--     short-circuits first; the leaky is_admin() fast-path was masking the perf tax
--     on the proper permission path.
--  2) DRIFT: migration 20260520140000 (lifecycle counts in the dashboard summary RPC)
--     was recorded in supabase_migrations.schema_migrations but the live summary fn
--     lacked the fields (a later apply reverted it) -> Enquiry/Account/Reserved/
--     Admitted KPI cards showed 0 for EVERYONE since ~2026-05-20.
--  3) COLLISION: a concurrent session applied 4-arg overloads (p_date_from/p_date_to/
--     p_source) of both aggregate RPCs out-of-band while the 1-arg versions existed
--     -> PostgREST PGRST203 (300 Multiple Choices) for every dashboard caller
--     (~15 min incident 09:15-09:30 IST). RESOLVED by dropping the 1-arg overloads
--     and merging the lifecycle-count fields into the 4-arg summary definition below.
--
-- FINAL STATE RECORDED HERE:
--   * adm_leads_select policy: initplan-optimized, same access semantics
--   * get_admission_dashboard_summary_aggregate(uuid,tstz,tstz,text): date/source
--     filters + lifecycle counts (merged); 1-arg overload dropped
--   * get_admission_funnel_summary_aggregate(uuid,tstz,tstz,text): as applied
--     out-of-band (verbatim pg_get_functiondef capture); 1-arg overload dropped;
--     anon EXECUTE revoked (was left at the Supabase default grant)
-- =====================================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) Drop the ambiguous 1-arg overloads (PGRST203 fix)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_admission_dashboard_summary_aggregate(uuid);
DROP FUNCTION IF EXISTS public.get_admission_funnel_summary_aggregate(uuid);

-- ----------------------------------------------------------------------------
-- 1) admission_leads SELECT policy -- initplan optimization (perf-only)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "adm_leads_select" ON public.admission_leads;
CREATE POLICY "adm_leads_select" ON public.admission_leads FOR SELECT USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR ((SELECT user_has_permission('admission.leads.view'))
      AND (SELECT _user_in_admission_lead_allowlist(auth.uid()))
      AND ((institution_id IS NULL) OR (institution_id = ANY ((SELECT _user_accessible_institutions())::uuid[])))
      AND (NOT (SELECT _user_is_strict_counselor(auth.uid()))))
  OR ((SELECT _user_is_strict_counselor(auth.uid()))
      AND ((institution_id IS NULL) OR (institution_id = ANY ((SELECT _user_accessible_institutions())::uuid[])))
      AND (source <> 'referral'::lead_source)
      AND ((assigned_counselor_id = (SELECT auth.uid())) OR _user_owns_lead_via_counselor_id((SELECT auth.uid()), counselor_id)))
  OR ((SELECT _user_in_admission_lead_allowlist(auth.uid()))
      AND (source <> 'referral'::lead_source)
      AND ((assigned_counselor_id = (SELECT auth.uid())) OR _user_owns_lead_via_counselor_id((SELECT auth.uid()), counselor_id)))
  OR ((expo_event_id IS NOT NULL) AND (expo_event_id IN (SELECT get_my_expo_team_event_ids())))
);

-- ----------------------------------------------------------------------------
-- 2) Dashboard summary RPC -- 4-arg signature + lifecycle counts (merged)
-- ----------------------------------------------------------------------------
-- 2026-07-03: MERGED definition — reconciles two concurrent changes:
--  (a) 2026-07-03 out-of-band 4-arg upgrade (p_date_from/p_date_to/p_source filters)
--  (b) 20260520140000 lifecycle-status counts (enquiryCount .. rejectedLifecycleCount)
-- Lifecycle counts come from learners_profiles and are institution-scoped only
-- (date/source filters apply to the lead-side aggregate, per May-20 intent).
CREATE OR REPLACE FUNCTION public.get_admission_dashboard_summary_aggregate(
  p_institution_id uuid DEFAULT NULL::uuid,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_source text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH agg AS (
    SELECT
      COUNT(*)                                                                       AS total_leads,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))                 AS new_leads,
      COUNT(*) FILTER (WHERE COALESCE(stage::text, funnel_stage::text) = 'enrolled') AS converted_leads,
      COUNT(*) FILTER (WHERE learner_profile_id IS NOT NULL)                         AS application_started_leads,
      COUNT(*) FILTER (
        WHERE next_followup_at IS NOT NULL
          AND next_followup_at <= now()
          AND COALESCE(stage::text, funnel_stage::text) NOT IN ('enrolled','lost')
      )                                                                              AS pending_followups,
      COUNT(*) FILTER (
        WHERE next_followup_at::date = CURRENT_DATE
          AND COALESCE(stage::text, funnel_stage::text) NOT IN ('enrolled','lost')
      )                                                                              AS today_followups
    FROM admission_leads
    WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_date_from      IS NULL OR created_at >= p_date_from)
      AND (p_date_to        IS NULL OR created_at <= p_date_to)
      AND (p_source         IS NULL OR source::text = p_source)
  ),
  lifecycle_agg AS (
    SELECT
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'enquiry')              AS enquiry_count,
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'enquiry_submitted')    AS enquiry_submitted_count,
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'account')              AS account_count,
      COUNT(*) FILTER (WHERE lifecycle_status::text = 'reserved')             AS reserved_count,
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
    'enquiryCount',            COALESCE(lc.enquiry_count, 0),
    'enquirySubmittedCount',   COALESCE(lc.enquiry_submitted_count, 0),
    'accountCount',            COALESCE(lc.account_count, 0),
    'reservedCount',           COALESCE(lc.reserved_count, 0),
    'admittedCount',           COALESCE(lc.admitted_count, 0),
    'rejectedLifecycleCount',  COALESCE(lc.rejected_lifecycle_count, 0)
  )
  FROM agg la
  CROSS JOIN lifecycle_agg lc;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_admission_dashboard_summary_aggregate(uuid, timestamptz, timestamptz, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_admission_dashboard_summary_aggregate(uuid, timestamptz, timestamptz, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) Funnel summary RPC -- 4-arg signature (verbatim prod capture) + anon lockdown
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admission_funnel_summary_aggregate(p_institution_id uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH stage_agg AS (
    SELECT
      COALESCE(stage::text, funnel_stage::text)                          AS stage_key,
      COUNT(*)                                                            AS stage_count,
      COUNT(*) FILTER (WHERE is_hot_lead = true)                          AS hot_count,
      COUNT(*) FILTER (WHERE is_hot_lead = true OR is_priority = true)    AS priority_count
    FROM admission_leads
    WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_date_from      IS NULL OR created_at >= p_date_from)
      AND (p_date_to        IS NULL OR created_at <= p_date_to)
      AND (p_source         IS NULL OR source::text = p_source)
    GROUP BY COALESCE(stage::text, funnel_stage::text)
  ),
  lifecycle_agg AS (
    SELECT
      CASE WHEN lifecycle_status::text IN ('admitted', 'active')
           THEN 'admitted'
           ELSE lifecycle_status::text
      END     AS stage_key,
      COUNT(*) AS cnt
    FROM learners_profiles
    WHERE p_institution_id IS NULL OR institution_id = p_institution_id
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'totalLeads',    COALESCE(SUM(stage_count),    0),
    'hotLeads',      COALESCE(SUM(hot_count),      0),
    'priorityLeads', COALESCE(SUM(priority_count), 0),
    'byStage',
      COALESCE(
        jsonb_object_agg(stage_key, stage_count)
          FILTER (WHERE stage_key IS NOT NULL),
        '{}'::jsonb
      ),
    'lifecycleByStage',
      COALESCE(
        (SELECT jsonb_object_agg(stage_key, cnt) FROM lifecycle_agg),
        '{}'::jsonb
      )
  )
  FROM stage_agg;
$function$

;

REVOKE EXECUTE ON FUNCTION public.get_admission_funnel_summary_aggregate(uuid, timestamptz, timestamptz, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_admission_funnel_summary_aggregate(uuid, timestamptz, timestamptz, text) TO authenticated;

COMMIT;
