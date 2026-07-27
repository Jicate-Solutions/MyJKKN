-- =====================================================================
-- Fix: pending-leave approval notifications deep-linked to a dead path
-- Created: 2026-07-27
-- =====================================================================
-- BUG (reported 2026-07-27): clicking a "Leave request pending …" bell
-- notification did nothing / dumped the user on a section page. The
-- dashboard:approval generator fn_generate_pending_leave_approval_items set the
-- work-item url to '/hr/leave/applications/<id>' — but there is NO page at that
-- path (app/(routes)/hr/leave/applications/ holds only API route.ts handlers).
-- The real application detail page is app/(routes)/hr/leave/[id]/page.tsx, i.e.
-- '/hr/leave/<id>'. So the bell's router.push() hit a 404 and bounced.
--
-- FIX: (1) generator now emits '/hr/leave/<id>'; (2) repair the existing rows
-- (10 at time of writing, 9 unread) whose action_config.url still points at the
-- dead path. String-replace preserves the exact id.
--
-- SECURITY DEFINER, service_role only (unchanged) — cron-invoked via the
-- dashboard work-item sweep. Grants re-asserted per CLAUDE.md.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_generate_pending_leave_approval_items()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn_leave$
DECLARE
  v_created INT := 0; v_leave RECORD; v_target UUID; v_key TEXT; v_hours INT;
BEGIN
  FOR v_leave IN
    SELECT la.id, la.employee_id, la.final_approver_id,
           la.start_date, la.end_date, la.total_days, la.status,
           la.created_at, la.reason, la.is_emergency,
           EXTRACT(EPOCH FROM (NOW() - la.created_at))/3600 AS hours_pending
    FROM hr_leave_applications la
    WHERE la.status = 'pending' AND la.created_at < NOW() - INTERVAL '48 hours'
      AND la.created_at > NOW() - INTERVAL '30 days' AND la.superseded_by IS NULL
    ORDER BY la.created_at ASC LIMIT 200
  LOOP
    v_target := v_leave.final_approver_id;
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_hours := v_leave.hours_pending::INT;
    v_key := 'leave_pending:' || v_leave.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:approval',
      CASE WHEN v_leave.is_emergency THEN 'urgent' WHEN v_hours > 96 THEN 'high' ELSE 'normal' END,
      'Leave request pending ' || v_hours || 'h — ' || v_leave.total_days::text || ' day(s)',
      COALESCE(v_leave.reason, 'No reason provided') || ' | ' ||
        v_leave.start_date::text || ' to ' || v_leave.end_date::text,
      jsonb_build_object('leave_id', v_leave.id, 'employee_id', v_leave.employee_id,
        'days', v_leave.total_days, 'url', '/hr/leave/' || v_leave.id::text,
        'is_emergency', v_leave.is_emergency),
      v_target, v_key, CASE WHEN v_leave.is_emergency THEN 4 ELSE 24 END);
  END LOOP;
  RETURN v_created;
END $fn_leave$;

REVOKE EXECUTE ON FUNCTION public.fn_generate_pending_leave_approval_items() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_pending_leave_approval_items() TO service_role;

-- Repair existing broken deep-links (prefix swap preserves the leave id).
UPDATE public.notifications
   SET action_config = jsonb_set(
         action_config, '{url}',
         to_jsonb(replace(action_config->>'url', '/hr/leave/applications/', '/hr/leave/'))
       )
 WHERE category = 'dashboard:approval'
   AND (action_config->>'url') LIKE '/hr/leave/applications/%';
