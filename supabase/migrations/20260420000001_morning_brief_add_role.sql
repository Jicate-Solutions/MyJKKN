-- =====================================================================
-- Morning Brief — add `role` to RPC payload
-- =====================================================================
-- Part of: fix/morning-brief-role-aware
--
-- PROBLEM: fn_dashboard_morning_brief returns a counter called
-- `cold_leads` that is meaningful ONLY for admission-adjacent personas
-- (counselor, admission, admin, principal). The client component
-- hardcodes a "Cold leads" chip that renders for every role, so a
-- student previewing the dashboard sees "0 COLD LEADS" — a counselor
-- metric leaking into student vocabulary.
--
-- FIX: Surface the caller's role in the RPC payload so the client can
-- filter which chips to render per persona. The compute cost of
-- cold_leads stays the same (it's a single count query already bounded
-- by `created_at >= NOW() - INTERVAL '24 hours'`); we just teach the
-- frontend when to *show* it.
--
-- SECURITY DEFINER unchanged. No ACL changes — the function was
-- already granted to authenticated. The only payload change is adding
-- `role` to the root jsonb object.
-- =====================================================================

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

  -- YESTERDAY
  SELECT COUNT(*) INTO v_yday_closed
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_user
    AND un.acknowledged_at IS NOT NULL
    AND (un.acknowledged_at AT TIME ZONE 'Asia/Kolkata')::date = v_yday
    AND n.category LIKE 'dashboard:%';

  SELECT COUNT(*) INTO v_yday_auto_escalated
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_user
    AND un.escalated_at IS NOT NULL
    AND (un.escalated_at AT TIME ZONE 'Asia/Kolkata')::date = v_yday
    AND n.category LIKE 'dashboard:%';

  SELECT COUNT(*) INTO v_yday_rescues_claimed
  FROM rescue_broadcasts
  WHERE claimed_by = v_user
    AND (claimed_at AT TIME ZONE 'Asia/Kolkata')::date = v_yday;

  -- TODAY
  SELECT
    COUNT(*) FILTER (WHERE n.priority = 'urgent'),
    COUNT(*) FILTER (WHERE n.priority = 'high'),
    COUNT(*) FILTER (WHERE n.category = 'dashboard:rescue' AND (n.created_at AT TIME ZONE 'Asia/Kolkata')::date < v_today)
  INTO v_today_pending_urgent, v_today_pending_high, v_carried_over
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  WHERE un.user_id = v_user
    AND un.acknowledged_at IS NULL
    AND n.requires_acknowledgment = TRUE
    AND n.category LIKE 'dashboard:%'
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND n.superseded_by IS NULL;

  SELECT COUNT(*) INTO v_today_cold_leads
  FROM admission_leads
  WHERE created_at >= NOW() - INTERVAL '24 hours'
    AND score >= 70
    AND first_touch_at IS NULL
    AND EXTRACT(EPOCH FROM (NOW() - created_at))/3600.0 >= 4;

  -- TOP 3 PRIORITIES
  SELECT jsonb_agg(p) INTO v_top_priorities FROM (
    SELECT
      n.id AS notification_id,
      un.id AS user_notification_id,
      n.title,
      CASE n.category
        WHEN 'dashboard:approval' THEN 'approval'
        WHEN 'dashboard:escalation' THEN 'escalation'
        WHEN 'dashboard:rescue' THEN 'rescue'
        WHEN 'dashboard:anomaly' THEN 'anomaly'
        ELSE 'other' END AS queue_type,
      n.priority,
      EXTRACT(EPOCH FROM (NOW() - n.created_at))::bigint AS age_seconds
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = v_user
      AND un.acknowledged_at IS NULL
      AND n.requires_acknowledgment = TRUE
      AND n.category LIKE 'dashboard:%'
      AND (n.expires_at IS NULL OR n.expires_at > NOW())
      AND n.superseded_by IS NULL
    ORDER BY
      CASE n.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
      n.created_at ASC
    LIMIT 3
  ) p;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'greeting', v_greeting,
    'name', COALESCE(v_name, 'Director'),
    'role', v_role,
    'date_ist', v_today,
    'yesterday', jsonb_build_object(
      'closed', v_yday_closed,
      'auto_escalated', v_yday_auto_escalated,
      'rescues_claimed', v_yday_rescues_claimed
    ),
    'today', jsonb_build_object(
      'pending_urgent', v_today_pending_urgent,
      'pending_high', v_today_pending_high,
      'cold_leads', v_today_cold_leads,
      'carried_over', v_carried_over
    ),
    'top_priorities', COALESCE(v_top_priorities, '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_dashboard_morning_brief() IS
'Dashboard v2 — 8am Morning Brief. Returns greeting, yesterday closeout, today pending counts, and top 3 priorities. Now also includes caller role so the client can filter admission-specific chips (e.g., Cold Leads) from student/faculty/hod/accounts dashboards.';
