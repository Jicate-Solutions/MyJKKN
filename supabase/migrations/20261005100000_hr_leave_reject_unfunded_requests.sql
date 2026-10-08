-- A pending leave request whose balance no longer exists is rejected, not left
-- to fail on approval.
--
-- hr_trig_leave_enforce_balance refuses a request with no balance when it is
-- FILED. But HR back-filled "taken" days afterwards (month overrides: ~1,800
-- rows on 2026-09-22, more through 2026-10-03), so requests that fitted when
-- filed became unaffordable while they sat in the queue. The approver then got
-- "Insufficient Casual Leave balance ... Reject this request instead" and the
-- request stayed pending. Measured 2026-10-05: 11 of 24 pending day-leave
-- requests, all Casual Leave.
--
-- fn_hr_leave_reject_unfunded(id) rejects ONE such request as the CAO, with the
-- reason "No leave balance available", and does what the TypeScript reject path
-- does that a bare UPDATE would not: stamps the final chain step, queues the
-- applicant's decision email and writes the in-app notification. The email
-- trigger (hr_trig_enqueue_decision_email) deliberately skips decisions with no
-- auth.uid(), so a SQL-side rejection has to enqueue it itself.
--
-- The balance trigger below runs it whenever a month override or balance row
-- moves, so the next back-fill rejects the requests it strands in the same
-- transaction instead of leaving them for an approver to trip over.

CREATE OR REPLACE FUNCTION public.fn_hr_leave_reject_unfunded(p_application_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
-- NOT '': hr_calc_leave_days reads hr_organizations unqualified.
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  a        record;
  t        record;
  v_days   numeric;
  v_short  record;
  v_cao    uuid;
  v_reason text;
  v_final  integer;
  v_step   jsonb;
  v_chain  jsonb;
  v_now    timestamptz := now();
  v_email  text;
  v_notif  uuid;
  v_range  text;
BEGIN
  SELECT * INTO a FROM public.hr_leave_applications
  WHERE id = p_application_id AND status IN ('pending', 'escalated')
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT request_category, leave_type_name, skip_weekends, skip_holidays INTO t
  FROM public.hr_leave_types WHERE id = a.leave_type_id;
  IF t.request_category IS DISTINCT FROM 'leave' THEN RETURN false; END IF;

  v_days := public.hr_calc_leave_days(
    a.start_date, a.end_date, a.duration_type,
    COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
    a.hr_organization_id, a.employee_id);
  -- A request on a non-working day is not a balance problem; leave it alone.
  IF COALESCE(v_days, 0) <= 0 THEN RETURN false; END IF;

  SELECT * INTO v_short FROM public.fn_hr_leave_balance_shortfall(
    a.employee_id, a.leave_type_id, a.hr_academic_year_id, a.id, a.start_date, v_days);
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT ur.user_id INTO v_cao
  FROM public.user_roles ur
  JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE cr.role_key = 'cao' AND cr.is_active
  ORDER BY ur.user_id LIMIT 1;
  IF v_cao IS NULL THEN
    RAISE WARNING 'fn_hr_leave_reject_unfunded: no active CAO, % left pending', a.id;
    RETURN false;
  END IF;

  v_reason := format(
    'No leave balance available. %s: %s day(s) available as of %s; this request needs %s.',
    t.leave_type_name, v_short.available, to_char(v_short.as_of, 'DD Mon YYYY'), v_days);

  v_chain := COALESCE(a.approval_chain, '[]'::jsonb);
  v_final := public.fn_hr_leave_final_step_index(v_chain);
  IF v_final >= 0 THEN
    v_step := (v_chain -> v_final) || jsonb_build_object(
      'status', 'rejected',
      'decided_by', v_cao,
      'decided_at', v_now,
      'comment', v_reason,
      'decisions', COALESCE(v_chain -> v_final -> 'decisions', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
             'by', v_cao, 'at', v_now, 'decision', 'rejected', 'comment', v_reason)));
    v_chain := jsonb_set(v_chain, ARRAY[v_final::text], v_step);
  END IF;

  BEGIN
    UPDATE public.hr_leave_applications
    SET status = 'rejected',
        approval_chain = v_chain,
        final_approver_id = v_cao,
        final_decided_at = v_now,
        rejection_reason = v_reason
    WHERE id = a.id;
  EXCEPTION WHEN OTHERS THEN
    -- e.g. the month is closed. Never fail the HR save that triggered this.
    RAISE WARNING 'fn_hr_leave_reject_unfunded: % not rejected: %', a.id, SQLERRM;
    RETURN false;
  END;

  SELECT NULLIF(btrim(s.institution_email), '') INTO v_email
  FROM public.staff s WHERE s.id = a.employee_id;

  INSERT INTO public.hr_decision_emails
    (leave_application_id, employee_id, decision, to_email, status, last_error)
  VALUES
    (a.id, a.employee_id, 'rejected', v_email,
     CASE WHEN v_email IS NULL THEN 'skipped' ELSE 'pending' END,
     CASE WHEN v_email IS NULL THEN 'No institution email on the staff record' END)
  ON CONFLICT DO NOTHING;

  v_range := a.start_date::text || ' → ' || a.end_date::text;
  INSERT INTO public.notifications (title, body, created_by, targeting, category, kind, url, metadata)
  VALUES (
    'Leave Request Rejected',
    format('Your %s request for %s has been rejected. Reason: %s', t.leave_type_name, v_range, v_reason),
    a.applied_by,
    jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(a.applied_by)),
    'staff', 'work_item', '/hr/leave/' || a.id,
    jsonb_build_object('source', 'staff_notify', 'event_type', 'leave_rejected',
                       'reference_id', a.id, 'leave_type', t.leave_type_name,
                       'rejection_reason', v_reason))
  RETURNING id INTO v_notif;
  INSERT INTO public.user_notifications (notification_id, user_id) VALUES (v_notif, a.applied_by);

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_reject_unfunded(uuid) IS
  'Rejects one pending/escalated day-leave request that no longer fits its balance, as the CAO, reason "No leave balance available"; queues the applicant email and in-app notification. Returns false when nothing was done. Non-working-day requests are ignored.';

REVOKE ALL ON FUNCTION public.fn_hr_leave_reject_unfunded(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_reject_unfunded(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.hr_trig_reject_unfunded_after_balance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.hr_leave_applications
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND hr_academic_year_id IS NOT DISTINCT FROM NEW.hr_academic_year_id
      AND status IN ('pending', 'escalated')
  LOOP
    PERFORM public.fn_hr_leave_reject_unfunded(r.id);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_trig_reject_unfunded_after_balance_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hlme_reject_unfunded ON public.hr_leave_month_entries;
CREATE TRIGGER trg_hlme_reject_unfunded
  AFTER INSERT OR UPDATE OF days ON public.hr_leave_month_entries
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_reject_unfunded_after_balance_change();

DROP TRIGGER IF EXISTS trg_hlb_reject_unfunded ON public.hr_leave_balances;
CREATE TRIGGER trg_hlb_reject_unfunded
  AFTER UPDATE OF used, carried_forward, entitled ON public.hr_leave_balances
  FOR EACH ROW
  WHEN (NEW.used > OLD.used
     OR NEW.carried_forward < OLD.carried_forward
     OR NEW.entitled < OLD.entitled)
  EXECUTE FUNCTION public.hr_trig_reject_unfunded_after_balance_change();
