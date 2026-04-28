-- 2026-04-28: HR Command Center daily brief digest
--
-- Why: 5 users have ever opened /hr (PR #391/#460/#461/#462/#464/#465/#466,
-- #571 wrapper-migration). Dashboard is healthy but invisible from the
-- morning loop — nothing pulls users back. The existing super_admin daily
-- digest emits an approval item with `/admin/notifications?...` (meta-page
-- anti-pattern, see memory feedback_action_config_url_target_domain_not_meta)
-- and only fires when there's >0 pending leave/recruitment.
--
-- This adds a single HR-specific brief that:
--   - aggregates 4 HR signals (pending leaves >24h, active recruitment,
--     today's holidays, staff on leave today) into ONE digest item per user
--   - skips users with zero signal (no point in an empty brief)
--   - uses URL='/hr' (domain page, NOT meta) per memory rule
--   - permission-gates fan-out via hr.dashboard.view (NOT hardcoded role list)
--   - is idempotent per user per day via idempotency_key
--
-- Pattern extended from: fn_generate_super_admin_daily_digest (rolled-up,
-- per-user) + fn_generate_pending_leave_approval_items (per-entity).

CREATE OR REPLACE FUNCTION public.fn_generate_hr_command_center_brief_items()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_pending_leaves INT;
  v_active_recruitment INT;
  v_todays_holidays INT;
  v_staff_on_leave INT;
  v_total INT;
  v_priority TEXT;
  v_title TEXT;
  v_body TEXT;
  v_signal_parts TEXT[];
BEGIN
  -- Fan-out roster: super_admin + every user with hr.dashboard.view permission
  -- (granted via Role Management UI). No hardcoded role list — adapts as
  -- permission grants change.
  FOR v_user IN
    SELECT p.id, p.is_super_admin
    FROM profiles p
    WHERE p.is_super_admin = TRUE
       OR EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN custom_roles cr ON cr.id = ur.role_id
         WHERE ur.user_id = p.id
           AND COALESCE((cr.permissions->>'hr.dashboard.view')::boolean, false) = TRUE
           AND COALESCE(cr.is_active, TRUE) = TRUE
       )
  LOOP
    -- Signal 1: pending leave applications >24h (earlier than per-entity
    -- emitter's >48h threshold — gives directors a heads-up before the
    -- per-entity items start firing).
    SELECT COUNT(*) INTO v_pending_leaves
    FROM hr_leave_applications la
    WHERE la.status = 'pending'
      AND la.created_at < NOW() - INTERVAL '24 hours'
      AND la.created_at > NOW() - INTERVAL '30 days'
      AND la.superseded_by IS NULL;

    -- Signal 2: active recruitment in last 30 days
    SELECT COUNT(*) INTO v_active_recruitment
    FROM hr_recruitment_candidates
    WHERE status IN ('pending_approval', 'in_process', 'submitted')
      AND COALESCE(submitted_at, created_at) > NOW() - INTERVAL '30 days';

    -- Signal 3: today's institution-wide holidays (any institution)
    SELECT COUNT(*) INTO v_todays_holidays
    FROM institution_leaves
    WHERE CURRENT_DATE BETWEEN start_date AND end_date
      AND status IN ('approved', 'active');

    -- Signal 4: approved staff leaves overlapping today
    SELECT COUNT(*) INTO v_staff_on_leave
    FROM hr_leave_applications
    WHERE status = 'approved'
      AND CURRENT_DATE BETWEEN start_date AND end_date
      AND superseded_by IS NULL;

    v_total := v_pending_leaves + v_active_recruitment + v_todays_holidays + v_staff_on_leave;

    -- Skip emit if no signal — don't pollute the queue with empty briefs.
    IF v_total = 0 THEN CONTINUE; END IF;

    -- Build human-readable signal breakdown (only non-zero)
    v_signal_parts := ARRAY[]::TEXT[];
    IF v_pending_leaves > 0 THEN
      v_signal_parts := v_signal_parts || (v_pending_leaves || ' pending leave(s)');
    END IF;
    IF v_active_recruitment > 0 THEN
      v_signal_parts := v_signal_parts || (v_active_recruitment || ' active recruitment');
    END IF;
    IF v_todays_holidays > 0 THEN
      v_signal_parts := v_signal_parts || (v_todays_holidays || ' holiday today');
    END IF;
    IF v_staff_on_leave > 0 THEN
      v_signal_parts := v_signal_parts || (v_staff_on_leave || ' staff on leave today');
    END IF;

    -- Priority: high if pending leaves are piling up OR a holiday is active
    v_priority := CASE
      WHEN v_pending_leaves >= 5 OR v_todays_holidays > 0 THEN 'high'
      ELSE 'normal'
    END;

    v_title := 'HR brief — ' || array_to_string(v_signal_parts, ', ');
    v_body := 'Daily HR Command Center summary: ' || array_to_string(v_signal_parts, ', ') || '. Open /hr for full breakdown across institutions.';

    v_key := 'hr_brief:' || v_user.id::text || ':' || v_today;

    -- p_deadline_hours = 20 so the brief expires before tomorrow's run
    -- (cron fires daily at 03:03 UTC = 08:33 IST).
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:hr_brief',
      v_priority,
      v_title,
      v_body,
      jsonb_build_object(
        'url', '/hr',
        'digest', true,
        'pending_leaves', v_pending_leaves,
        'active_recruitment', v_active_recruitment,
        'todays_holidays', v_todays_holidays,
        'staff_on_leave', v_staff_on_leave,
        'total', v_total
      ),
      v_user.id,
      v_key,
      20
    );

  END LOOP;
  RETURN v_created;
END $function$;

-- Wire into the master dispatcher so the existing cron (super-admin-digest
-- route or fn_generate_all_dashboard_work_items consumer) picks it up
-- without any new route. Replaces the function with one extra branch.
CREATE OR REPLACE FUNCTION public.fn_generate_all_dashboard_work_items()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r1 INT := 0; e1 TEXT := NULL; r2 INT := 0; e2 TEXT := NULL;
        r3 INT := 0; e3 TEXT := NULL; r4 INT := 0; e4 TEXT := NULL;
        r5 INT := 0; e5 TEXT := NULL; r6 INT := 0; e6 TEXT := NULL;
        r7 INT := 0; e7 TEXT := NULL; r8 INT := 0; e8 TEXT := NULL;
        r9 INT := 0; e9 TEXT := NULL; r10 INT := 0; e10 TEXT := NULL;
BEGIN
  BEGIN r1 := fn_generate_overdue_invoice_items();              EXCEPTION WHEN OTHERS THEN e1 := SQLERRM; END;
  BEGIN r2 := fn_generate_stale_lead_rescue_items();            EXCEPTION WHEN OTHERS THEN e2 := SQLERRM; END;
  BEGIN r3 := fn_generate_pending_leave_approval_items();       EXCEPTION WHEN OTHERS THEN e3 := SQLERRM; END;
  BEGIN r4 := fn_generate_unmarked_attendance_items();          EXCEPTION WHEN OTHERS THEN e4 := SQLERRM; END;
  BEGIN r5 := fn_generate_recruitment_approval_items();         EXCEPTION WHEN OTHERS THEN e5 := SQLERRM; END;
  BEGIN r6 := fn_generate_service_request_approval_items();     EXCEPTION WHEN OTHERS THEN e6 := SQLERRM; END;
  BEGIN r7 := fn_generate_unresolved_bug_items();               EXCEPTION WHEN OTHERS THEN e7 := SQLERRM; END;
  BEGIN r8 := fn_generate_unresolved_grievance_items();         EXCEPTION WHEN OTHERS THEN e8 := SQLERRM; END;
  BEGIN r9 := fn_generate_event_proposal_items();               EXCEPTION WHEN OTHERS THEN e9 := SQLERRM; END;
  BEGIN r10 := fn_generate_hr_command_center_brief_items();     EXCEPTION WHEN OTHERS THEN e10 := SQLERRM; END;
  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'overdue_invoices',      jsonb_build_object('count', r1, 'error', e1),
    'stale_leads',           jsonb_build_object('count', r2, 'error', e2),
    'pending_leaves',        jsonb_build_object('count', r3, 'error', e3),
    'unmarked_attendance',   jsonb_build_object('count', r4, 'error', e4),
    'recruitment_approvals', jsonb_build_object('count', r5, 'error', e5),
    'service_requests',      jsonb_build_object('count', r6, 'error', e6),
    'unresolved_bugs',       jsonb_build_object('count', r7, 'error', e7),
    'grievances',            jsonb_build_object('count', r8, 'error', e8),
    'event_proposals',       jsonb_build_object('count', r9, 'error', e9),
    'hr_briefs',             jsonb_build_object('count', r10, 'error', e10),
    'total', r1 + r2 + r3 + r4 + r5 + r6 + r7 + r8 + r9 + r10);
END $function$;

-- Grants — match the existing function family
ALTER FUNCTION public.fn_generate_hr_command_center_brief_items() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_generate_hr_command_center_brief_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_hr_command_center_brief_items() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_generate_hr_command_center_brief_items() TO authenticated;

COMMENT ON FUNCTION public.fn_generate_hr_command_center_brief_items() IS
  'Daily HR Command Center brief: aggregates pending leaves, active recruitment, today''s holidays, and staff on leave into a single dashboard:hr_brief work item per user with hr.dashboard.view permission. URL targets /hr (domain page). Idempotent per user per day. Wired into fn_generate_all_dashboard_work_items.';
