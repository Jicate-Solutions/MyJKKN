-- One-off: reject pending / escalated Casual Leave requests the leave balance
-- can no longer cover.
--
-- WHY. HR reset the 2026-27 CL balances after these requests were filed. The
-- balance guard (hr_trig_leave_enforce_balance -> fn_hr_leave_balance_shortfall)
-- now refuses to let any of them be approved, so the CAO hits 23514 on Approve
-- and the request is stuck pending. They cannot be honoured, so they are
-- rejected with the reason "no leave balance".
--
-- ORDER MATTERS. The shortfall check counts every earlier pending request as a
-- draw on the balance. Two 1-day requests against 1 free day must reject ONLY the
-- later one, so the loop takes the LATEST-dated short request, rejects it, and
-- re-evaluates. Zero-day requests (a holiday / week-off) are left alone: a
-- negative balance is not a reason to reject a request that costs nothing.
--
-- ATTRIBUTION. The gates and the decision-email trigger read auth.uid(), so the
-- transaction runs as the super admin boobalan.a@jkkn.ac.in. Applicants receive
-- the normal decision email through the hr_decision_emails outbox.

DO $$
DECLARE
  v_admin   uuid;
  v_skipped uuid[] := '{}';
  v_done    text[] := '{}';
  r         record;
  v_reason  text;
  v_now     timestamptz := now();
  v_guard   int := 0;
BEGIN
  SELECT id INTO v_admin FROM public.profiles
  WHERE email = 'boobalan.a@jkkn.ac.in' AND is_super_admin;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'super admin profile not found';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  LOOP
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 200;

    SELECT a.id, a.start_date, a.current_step, a.approval_chain,
           t.leave_type_name, d.days, s.as_of, s.available
      INTO r
    FROM public.hr_leave_applications a
    JOIN public.hr_leave_types t ON t.id = a.leave_type_id
    CROSS JOIN LATERAL (
      SELECT public.hr_calc_leave_days(
               a.start_date, a.end_date, a.duration_type,
               COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
               a.hr_organization_id, a.employee_id) AS days
    ) d
    CROSS JOIN LATERAL public.fn_hr_leave_balance_shortfall(
      a.employee_id, a.leave_type_id, a.hr_academic_year_id, a.id, a.start_date, d.days) s
    WHERE a.status IN ('pending', 'escalated')
      AND t.request_category = 'leave'
      AND t.leave_type_name ILIKE '%casual%'
      AND d.days > 0
      AND NOT (a.id = ANY (v_skipped))
    ORDER BY a.start_date DESC, a.created_at DESC
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    v_reason := format(
      'No %s balance available for %s (%s day(s) available as of %s; this request needs %s).',
      r.leave_type_name, to_char(r.start_date, 'FMMonth YYYY'),
      r.available, to_char(r.as_of, 'DD Mon YYYY'), r.days);

    BEGIN
      UPDATE public.hr_leave_applications a
      SET status = 'rejected',
          rejection_reason = v_reason,
          final_approver_id = v_admin,
          final_decided_at = v_now,
          approval_chain = CASE
            WHEN a.approval_chain -> a.current_step IS NULL THEN a.approval_chain
            ELSE jsonb_set(
              a.approval_chain, ARRAY[a.current_step::text],
              (a.approval_chain -> a.current_step) || jsonb_build_object(
                'status', 'rejected',
                'comment', v_reason,
                'decided_at', v_now,
                'decided_by', v_admin,
                'decisions', COALESCE(a.approval_chain -> a.current_step -> 'decisions', '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object(
                       'at', v_now, 'by', v_admin, 'comment', v_reason, 'decision', 'rejected'))))
          END
      WHERE a.id = r.id;
      v_done := v_done || (r.id::text || ' | ' || r.start_date::text);
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || r.id;
      RAISE NOTICE 'skipped % (%): %', r.id, r.start_date, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'rejected % request(s): %', COALESCE(array_length(v_done, 1), 0), v_done;
  RAISE NOTICE 'skipped % request(s): %', COALESCE(array_length(v_skipped, 1), 0), v_skipped;
END
$$;
