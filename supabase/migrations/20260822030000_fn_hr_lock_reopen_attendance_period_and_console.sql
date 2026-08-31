-- Close an institution-month.
--
-- PENDING REQUESTS BLOCK THE LOCK. Locking a month with an undecided short
-- time off silently denies it: the employee applied, nobody answered, and the
-- day is counted absent forever. Refusing names the count so HR can go and
-- clear them.
--
-- THE FORCE PATH REJECTS, IT DOES NOT IGNORE. A month can otherwise be held
-- open indefinitely by one forgotten application. Forcing is super-admin-only,
-- demands a reason, and REJECTS the outstanding requests with that reason
-- stamped on them -- so the employee sees a decision instead of a request that
-- quietly stopped mattering. hr_trig_leave_enforce_approver returns early for a
-- super admin, so those rejections pass the approver gate, and
-- trg_hla_balance_update restores the balances on the way through.

CREATE OR REPLACE FUNCTION public.fn_hr_lock_attendance_period(
  p_institution_id uuid,
  p_year           integer,
  p_month          integer,
  p_force          boolean DEFAULT false,
  p_force_reason   text    DEFAULT NULL
)
RETURNS public.hr_attendance_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period   public.hr_attendance_periods;
  v_start    date;
  v_end      date;
  v_pending  integer;
  v_records  integer;
  v_is_sa    boolean := public.is_super_admin();
BEGIN
  IF NOT (v_is_sa OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION 'hr.attendance.period.manage is required to close an attendance month.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be 1-12, got %', p_month USING ERRCODE = '22023';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  -- Refuse to close a month that has nothing in it. An empty close would
  -- freeze a set of zeroes and read as "everyone was absent".
  SELECT count(*) INTO v_records
    FROM public.hr_attendance_records
   WHERE institution_id = p_institution_id
     AND work_date BETWEEN v_start AND v_end;

  IF v_records = 0 THEN
    RAISE EXCEPTION 'No attendance records for that institution in %-%. Import the biometric data first.',
      p_year, lpad(p_month::text, 2, '0')
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.hr_attendance_periods (
    institution_id, period_year, period_month, status, created_by, updated_by
  ) VALUES (p_institution_id, p_year, p_month, 'open', auth.uid(), auth.uid())
  ON CONFLICT (institution_id, period_year, period_month) DO NOTHING;

  SELECT * INTO v_period
    FROM public.hr_attendance_periods
   WHERE institution_id = p_institution_id
     AND period_year = p_year AND period_month = p_month
   FOR UPDATE;

  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'That attendance month is already closed (locked %).',
      to_char(v_period.locked_at, 'DD Mon YYYY') USING ERRCODE = 'P0001';
  END IF;

  -- Undecided requests overlapping the month, for staff of this institution.
  SELECT count(*) INTO v_pending
    FROM public.hr_leave_applications la
    JOIN public.staff s ON s.id = la.employee_id
   WHERE s.institution_id = p_institution_id
     AND la.status = 'pending'
     AND la.start_date <= v_end AND la.end_date >= v_start;

  IF v_pending > 0 AND NOT p_force THEN
    RAISE EXCEPTION
      '% request(s) for this month are still awaiting a decision. Clear them in Leave Approvals, or close with an override.',
      v_pending
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pending > 0 AND p_force THEN
    IF NOT v_is_sa THEN
      RAISE EXCEPTION 'Only a Super Administrator may close a month over % outstanding request(s).', v_pending
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_force_reason IS NULL OR length(trim(p_force_reason)) = 0 THEN
      RAISE EXCEPTION 'A reason is required to close a month over outstanding requests.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.hr_leave_applications la
       SET status = 'rejected',
           final_approver_id = auth.uid(),
           final_decided_at = now(),
           updated_at = now()
      FROM public.staff s
     WHERE s.id = la.employee_id
       AND s.institution_id = p_institution_id
       AND la.status = 'pending'
       AND la.start_date <= v_end AND la.end_date >= v_start;
  END IF;

  PERFORM public.fn_hr_compute_attendance_period_summary(v_period.id);

  UPDATE public.hr_attendance_periods
     SET status = 'locked',
         locked_at = now(),
         locked_by = auth.uid(),
         forced = (v_pending > 0 AND p_force),
         force_reason = CASE WHEN v_pending > 0 AND p_force THEN trim(p_force_reason) END,
         updated_by = auth.uid()
   WHERE id = v_period.id
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer, boolean, text) TO authenticated, service_role;


-- Reopen a closed month. SUPER ADMIN ONLY, reason required.
--
-- Deliberately narrower than closing it. Reopening lets the day counts move
-- again underneath anything already generated from them, so it is not an HR
-- Head action -- and the frozen summaries are DELETED rather than kept, because
-- a stale summary beside a reopened month is worse than none.
CREATE OR REPLACE FUNCTION public.fn_hr_reopen_attendance_period(
  p_period_id uuid,
  p_reason    text
)
RETURNS public.hr_attendance_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period public.hr_attendance_periods;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Administrator may reopen a closed attendance month.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required to reopen a closed month.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_period FROM public.hr_attendance_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance period not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_period.status <> 'locked' THEN
    RAISE EXCEPTION 'That month is not closed.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.hr_attendance_period_summaries WHERE period_id = p_period_id;

  UPDATE public.hr_attendance_periods
     SET status = 'open',
         locked_at = NULL,
         locked_by = NULL,
         reopened_at = now(),
         reopened_by = auth.uid(),
         reopen_reason = trim(p_reason),
         staff_count = NULL,
         working_days_count = NULL,
         updated_by = auth.uid()
   WHERE id = p_period_id
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_reopen_attendance_period(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_reopen_attendance_period(uuid, text) TO authenticated, service_role;


-- Every institution's state for one month -- what the HR Head console lists.
--
-- Institutions with NO attendance data still appear, with zeroes. A month that
-- silently omits an institution reads as "done" when it means "never imported",
-- which is the failure this console exists to make visible.
CREATE OR REPLACE FUNCTION public.hr_attendance_period_console(
  p_year  integer,
  p_month integer
)
RETURNS TABLE(
  institution_id   uuid,
  institution_name text,
  period_id        uuid,
  status           text,
  locked_at        timestamptz,
  forced           boolean,
  staff_with_records integer,
  record_count       integer,
  pending_requests   integer,
  approved_requests  integer,
  unprocessed_days   integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := make_date(p_year, p_month, 1);
  v_end   date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
BEGIN
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.period.view')) THEN
    RAISE EXCEPTION 'hr.attendance.period.view is required to see the attendance close console.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT i.id,
         i.name::text,
         ap.id,
         COALESCE(ap.status, 'open')::text,
         ap.locked_at,
         COALESCE(ap.forced, false),
         COALESCE(r.staff_ct, 0)::int,
         COALESCE(r.rec_ct, 0)::int,
         COALESCE(q.pending_ct, 0)::int,
         COALESCE(q.approved_ct, 0)::int,
         COALESCE(r.unprocessed_ct, 0)::int
    FROM public.institutions i
    LEFT JOIN public.hr_attendance_periods ap
           ON ap.institution_id = i.id
          AND ap.period_year = p_year AND ap.period_month = p_month
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT rr.employee_id) AS staff_ct,
             count(*)                       AS rec_ct,
             count(*) FILTER (WHERE st.code NOT IN (
               'PRESENT','REGULARIZED','HALF_DAY','ABSENT','WEEKLY_OFF',
               'HOLIDAY','LEAVE','ON_DUTY','on_clinical_posting')) AS unprocessed_ct
        FROM public.hr_attendance_records rr
        JOIN public.hr_attendance_status_types st ON st.id = rr.status_type_id
       WHERE rr.institution_id = i.id
         AND rr.work_date BETWEEN v_start AND v_end
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE la.status = 'pending')  AS pending_ct,
             count(*) FILTER (WHERE la.status = 'approved') AS approved_ct
        FROM public.hr_leave_applications la
        JOIN public.staff s ON s.id = la.employee_id
       WHERE s.institution_id = i.id
         AND la.start_date <= v_end AND la.end_date >= v_start
    ) q ON true
   WHERE public.role_has_institution_access(i.id)
   ORDER BY (COALESCE(r.rec_ct, 0) = 0), i.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_attendance_period_console(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_attendance_period_console(integer, integer) TO authenticated, service_role;
