-- ============================================================================
-- Dashboard counters: stop requiring notifications.requires_acknowledgment
-- ============================================================================
-- PROPOSAL — NOT YET APPLIED. Pending Director approval of the numbers in the PR.
--
-- ROOT CAUSE
-- fn_create_dashboard_work_item deliberately inserts work items with
-- notifications.requires_acknowledgment = FALSE, so they never raise the
-- blocking Mandatory Acknowledgment modal (decoupling shipped 2026-04-23).
-- fn_dashboard_queue_list was updated the same day to filter on category only.
-- Sibling read functions were not, so they still require the flag to be TRUE
-- and therefore match zero work items. Every affected counter reads 0 today.
--
-- WHAT THIS MIGRATION CHANGES  (2 functions)
--   1. fn_dashboard_morning_brief  — drops the flag from both predicates:
--      the four-counter roll-up and the top-3 priorities list.
--   2. fn_dashboard_metrics        — drops the flag from the hero
--      "Pending Decisions" tile AND scopes it to dashboard categories.
--
-- WHY fn_dashboard_metrics ALSO GAINS A CATEGORY SCOPE (deviation, on purpose)
-- Its pending_decisions query has no category filter at all: the flag was the
-- only thing keeping non-dashboard notifications out of the tile. Measured on
-- production for the Director, 2026-08-09:
--     today (flag required) ............................   2
--     flag simply removed ..............................  681   <- wrong
--     flag removed + dashboard scope ...................  101   <- correct
-- 681 is every unacknowledged notification of any kind. 101 is exactly what
-- fn_dashboard_queue_list returns for the same user, so the tile and the queue
-- underneath it now agree by construction instead of contradicting each other.
-- The added predicates (category LIKE 'dashboard:%', superseded_by IS NULL) are
-- copied verbatim from fn_dashboard_queue_list, the already-corrected sibling.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES **NOT** CHANGE
--   fn_dashboard_queue_escalate — HELD BACK. Removing the flag there un-gates a
--     Vercel cron that has been a silent no-op since 2026-04-23 and that runs
--     every 15 minutes. Measured on production 2026-08-09, its first run would
--     escalate 9,087 backlog items (oldest 2026-04-23, 107 days) and fan every
--     one of them out to a single person — Gowrisankar M.N (eao@jkkn.ac.in),
--     the configured Chief of Staff. One hour later step 2 of the same function
--     would auto-acknowledge all 9,087 and write 9,087 rows into
--     counselor_sla_strikes, a table that holds 143 rows in total today.
--     This needs backlog triage or a first-run cap first. Tracked separately.
--   fn_principal_metrics — NOT AFFECTED. supabase/setup/02_functions.sql:8158
--     still shows a requires_acknowledgment predicate, but that dump is stale.
--     Migration 20260514120000 rewired pending_approvals to count
--     service_requests instead, and the live production definition contains no
--     reference to requires_acknowledgment at all. Verified against prod
--     (kvizhngldtiuufknvehv) with pg_get_functiondef on 2026-08-09.
--
-- Bodies below are pg_get_functiondef() output taken from production, with only
-- the predicate lines above modified. Signature, return type, language,
-- SECURITY DEFINER and search_path are byte-identical to what is live.
-- CREATE OR REPLACE preserves existing ACLs; the REVOKE statements restate the
-- current production grants (authenticated + service_role, no anon) and satisfy
-- .github/workflows/secdef-anon-revoke.yml.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. fn_dashboard_morning_brief — four counters + top-3 priorities
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dashboard_morning_brief()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_today DATE := (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date;
  v_yday DATE := v_today - 1;
  v_name TEXT;
  v_role TEXT;
  v_hour INT := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::int;
  v_greeting TEXT;
  v_yday_closed INT := 0;
  v_yday_auto_escalated INT := 0;
  v_yday_rescues_claimed INT := 0;
  v_today_pending_urgent INT := 0;
  v_today_pending_high INT := 0;
  v_today_cold_leads INT := 0;
  v_carried_over INT := 0;
  v_top_priorities JSONB;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  v_greeting := CASE
    WHEN v_hour < 12 THEN 'Good morning'
    WHEN v_hour < 17 THEN 'Good afternoon'
    ELSE 'Good evening'
  END;
  SELECT full_name, role INTO v_name, v_role FROM profiles WHERE id = v_user;
  SELECT COUNT(*) INTO v_yday_closed
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_user AND un.acknowledged_at IS NOT NULL
    AND (un.acknowledged_at AT TIME ZONE 'Asia/Kolkata')::date = v_yday
    AND n.category LIKE 'dashboard:%';
  SELECT COUNT(*) INTO v_yday_auto_escalated
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_user AND un.escalated_at IS NOT NULL
    AND (un.escalated_at AT TIME ZONE 'Asia/Kolkata')::date = v_yday
    AND n.category LIKE 'dashboard:%';
  SELECT COUNT(*) INTO v_yday_rescues_claimed
  FROM rescue_broadcasts
  WHERE claimed_by = v_user
    AND (claimed_at AT TIME ZONE 'Asia/Kolkata')::date = v_yday;
  SELECT
    COUNT(*) FILTER (WHERE n.priority = 'urgent'),
    COUNT(*) FILTER (WHERE n.priority = 'high'),
    COUNT(*) FILTER (WHERE n.category = 'dashboard:rescue' AND (n.created_at AT TIME ZONE 'Asia/Kolkata')::date < v_today)
  INTO v_today_pending_urgent, v_today_pending_high, v_carried_over
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_user AND un.acknowledged_at IS NULL
    AND n.category LIKE 'dashboard:%'
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND n.superseded_by IS NULL;
  SELECT COUNT(*) INTO v_today_cold_leads
  FROM admission_leads
  WHERE created_at >= NOW() - INTERVAL '24 hours' AND score >= 70
    AND first_touch_at IS NULL
    AND EXTRACT(EPOCH FROM (NOW() - created_at))/3600.0 >= 4;
  SELECT jsonb_agg(p) INTO v_top_priorities FROM (
    SELECT n.id AS notification_id, un.id AS user_notification_id, n.title,
      CASE n.category
        WHEN 'dashboard:approval' THEN 'approval'
        WHEN 'dashboard:escalation' THEN 'escalation'
        WHEN 'dashboard:rescue' THEN 'rescue'
        WHEN 'dashboard:anomaly' THEN 'anomaly'
        ELSE 'other' END AS queue_type,
      n.priority, EXTRACT(EPOCH FROM (NOW() - n.created_at))::bigint AS age_seconds
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = v_user AND un.acknowledged_at IS NULL
      AND n.category LIKE 'dashboard:%'
      AND (n.expires_at IS NULL OR n.expires_at > NOW()) AND n.superseded_by IS NULL
    ORDER BY CASE n.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
             n.created_at ASC
    LIMIT 3
  ) p;
  RETURN jsonb_build_object(
    'ok', TRUE, 'greeting', v_greeting, 'name', COALESCE(v_name, 'Director'),
    'role', v_role, 'date_ist', v_today,
    'yesterday', jsonb_build_object('closed', v_yday_closed, 'auto_escalated', v_yday_auto_escalated, 'rescues_claimed', v_yday_rescues_claimed),
    'today', jsonb_build_object('pending_urgent', v_today_pending_urgent, 'pending_high', v_today_pending_high, 'cold_leads', v_today_cold_leads, 'carried_over', v_carried_over),
    'top_priorities', COALESCE(v_top_priorities, '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. fn_dashboard_metrics — hero "Pending Decisions" tile
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dashboard_metrics(p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today DATE := (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date;
  v_att_total INT := 0; v_att_present INT := 0; v_att_pct NUMERIC := NULL;
  v_att_baseline_pct NUMERIC := NULL; v_att_score INT := 100;
  v_sla_compliance INT := 100; v_fee_today NUMERIC := 0;
  v_fee_plan NUMERIC := 100000; v_fee_score INT := 100;
  v_escalations_open INT := 0; v_escalations_score INT := 100;
  v_ohs_score INT; v_pipeline_inr NUMERIC := 0;
  v_pipeline_count INT := 0; v_pending_decisions INT := 0;
  v_cfg dashboard_config; v_caller UUID := auth.uid();
  v_caller_profile profiles; v_effective_institution UUID;
  v_is_privileged BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_cfg FROM dashboard_config WHERE scope = 'global' LIMIT 1;
  IF v_caller IS NOT NULL THEN SELECT * INTO v_caller_profile FROM profiles WHERE id = v_caller; END IF;

  IF v_caller_profile.id IS NULL THEN
    RETURN jsonb_build_object(
      'ohs', jsonb_build_object('score', 0, 'band', 'red',
        'components', jsonb_build_object('attendance', 0, 'sla', 0, 'fees', 0, 'escalations', 0)),
      'pipeline', jsonb_build_object('value_inr', 0, 'lead_count', 0),
      'attendance', jsonb_build_object('pct_today', NULL, 'pct_baseline', NULL, 'present', 0, 'total', 0),
      'pending_decisions', jsonb_build_object('count', 0),
      'scope', jsonb_build_object('institution_id', NULL, 'department_id', NULL,
        'computed_at', NOW(), 'forbidden', TRUE, 'reason', 'no_caller_profile'));
  END IF;

  -- EXPANDED privileged set (was: admin/administrator/super_admin/admission_manager)
  -- Now includes: system_admin, cao, cbo, ceo, executive_admin_officer, jicate_staff
  v_is_privileged := (
    v_caller_profile.is_super_admin = TRUE
    OR v_caller_profile.role IN (
      'admin', 'administrator', 'super_admin', 'admission_manager',
      'system_admin', 'cao', 'cbo', 'ceo', 'executive_admin_officer', 'jicate_staff'
    )
  );

  IF v_is_privileged THEN
    v_effective_institution := p_institution_id;
  ELSE
    IF v_caller_profile.institution_id IS NULL THEN
      RETURN jsonb_build_object(
        'ohs', jsonb_build_object('score', 0, 'band', 'red',
          'components', jsonb_build_object('attendance', 0, 'sla', 0, 'fees', 0, 'escalations', 0)),
        'pipeline', jsonb_build_object('value_inr', 0, 'lead_count', 0),
        'attendance', jsonb_build_object('pct_today', NULL, 'pct_baseline', NULL, 'present', 0, 'total', 0),
        'pending_decisions', jsonb_build_object('count', 0),
        'scope', jsonb_build_object('institution_id', NULL, 'department_id', NULL,
          'computed_at', NOW(), 'forbidden', TRUE, 'reason', 'caller_has_no_institution'));
    END IF;
    v_effective_institution := v_caller_profile.institution_id;
  END IF;

  -- [rest of function body unchanged — attendance, SLA, fees, escalations, pipeline, pending]
  SELECT COALESCE(SUM(cnt_total), 0), COALESCE(SUM(cnt_present), 0) INTO v_att_total, v_att_present
  FROM (SELECT (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*]') AS ja(v))::int AS cnt_total,
    (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*] ? (@.status == "Present")') AS jp(v))::int AS cnt_present
    FROM student_attendance sa WHERE sa.attendance_date = v_today
      AND (v_effective_institution IS NULL OR sa.institution_id = v_effective_institution)
      AND (p_department_id IS NULL OR sa.department_id = p_department_id)) agg;
  IF v_att_total > 0 THEN v_att_pct := ROUND((v_att_present::numeric * 100.0) / v_att_total, 1); END IF;

  SELECT AVG(daily_pct) INTO v_att_baseline_pct FROM (
    SELECT CASE WHEN SUM(tot) > 0 THEN (SUM(pres)::numeric * 100.0 / SUM(tot)) ELSE NULL END AS daily_pct
    FROM (SELECT sa.attendance_date,
      (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*]') AS ja(v)) AS tot,
      (SELECT COUNT(*) FROM jsonb_path_query_array(sa.attendance_data, '$.*.students[*] ? (@.status == "Present")') AS jp(v)) AS pres
      FROM student_attendance sa WHERE sa.attendance_date BETWEEN v_today - INTERVAL '7 days' AND v_today - INTERVAL '1 day'
        AND (v_effective_institution IS NULL OR sa.institution_id = v_effective_institution)
        AND (p_department_id IS NULL OR sa.department_id = p_department_id)) by_day GROUP BY attendance_date) daily;

  IF v_att_pct IS NOT NULL AND v_att_baseline_pct IS NOT NULL AND v_att_baseline_pct > 0 THEN
    v_att_score := LEAST(100, GREATEST(0, ROUND((v_att_pct / v_att_baseline_pct) * 100)::int));
  ELSIF v_att_pct IS NOT NULL THEN v_att_score := LEAST(100, GREATEST(0, ROUND(v_att_pct)::int)); END IF;

  SELECT CASE WHEN COUNT(*) = 0 THEN 100 ELSE ROUND(COUNT(*) FILTER (WHERE first_touch_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (first_touch_at - created_at))/3600.0 <= v_cfg.cold_lead_threshold_hours
    )::numeric * 100.0 / COUNT(*))::int END INTO v_sla_compliance
  FROM admission_leads WHERE created_at >= NOW() - INTERVAL '24 hours' AND score >= 70
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);

  SELECT COALESCE(SUM(payment_amount), 0) INTO v_fee_today FROM billing_receipts
  WHERE (receipt_date::date = v_today OR payment_paid_date::date = v_today)
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);
  v_fee_score := LEAST(100, GREATEST(0, ROUND((v_fee_today / NULLIF(v_fee_plan, 0)) * 100)::int));

  SELECT COUNT(*) INTO v_escalations_open FROM grievance_tickets
  WHERE status NOT IN ('resolved', 'closed', 'cancelled') AND sla_deadline IS NOT NULL AND sla_deadline < NOW()
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);
  v_escalations_score := GREATEST(0, 100 - (v_escalations_open * 5));

  v_ohs_score := ROUND((v_att_score * v_cfg.ohs_attendance_weight) + (v_sla_compliance * v_cfg.ohs_sla_weight) +
    (v_fee_score * v_cfg.ohs_fees_weight) + (v_escalations_score * v_cfg.ohs_escalations_weight))::int;

  SELECT COALESCE(SUM(COALESCE(conversion_probability, 0.5) * 100000), 0),
    COUNT(*) FILTER (WHERE score >= 70 AND funnel_stage::text NOT IN ('enrolled','lost','withdrew','declined','expired'))
  INTO v_pipeline_inr, v_pipeline_count FROM admission_leads
  WHERE funnel_stage::text NOT IN ('enrolled','lost','withdrew','declined','expired')
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);

  SELECT COUNT(*) INTO v_pending_decisions FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_caller AND un.acknowledged_at IS NULL
    AND n.category LIKE 'dashboard:%' AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND n.superseded_by IS NULL;

  RETURN jsonb_build_object(
    'ohs', jsonb_build_object('score', v_ohs_score,
      'band', CASE WHEN v_ohs_score < v_cfg.ohs_red_ceiling THEN 'red'
                   WHEN v_ohs_score < v_cfg.ohs_amber_ceiling THEN 'amber' ELSE 'green' END,
      'components', jsonb_build_object('attendance', v_att_score, 'sla', v_sla_compliance,
        'fees', v_fee_score, 'escalations', v_escalations_score)),
    'pipeline', jsonb_build_object('value_inr', v_pipeline_inr, 'lead_count', v_pipeline_count),
    'attendance', jsonb_build_object('pct_today', v_att_pct, 'pct_baseline', v_att_baseline_pct,
      'present', v_att_present, 'total', v_att_total),
    'pending_decisions', jsonb_build_object('count', v_pending_decisions),
    'scope', jsonb_build_object('institution_id', v_effective_institution,
      'department_id', p_department_id, 'computed_at', NOW(), 'scope_enforced', NOT v_is_privileged));
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants: restate production's current ACL. No-ops against live state.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_morning_brief() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_morning_brief() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_metrics(uuid, uuid) TO authenticated, service_role;
