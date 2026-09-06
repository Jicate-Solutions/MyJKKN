-- RESOLVING EVERY REQUEST BEFORE CLOSING IS COMPULSORY. The override is gone.
--
-- The close previously accepted p_force, which a Super Administrator could use
-- to reject the outstanding requests and close anyway. That is now removed
-- entirely rather than merely hidden in the UI: a force path left in the
-- function is still reachable over PostgREST by anyone holding
-- hr.attendance.period.manage, so hiding the button would have made the rule a
-- convention instead of a control.
--
-- THE COLUMNS GO TOO. `forced` and `force_reason` can no longer be set by
-- anything, and a column nothing can write is worse than absent -- the next
-- reader has to work out how a period might become forced before concluding
-- that it cannot. The table holds 0 rows and none was ever forced, so nothing
-- is lost.
--
-- The way out of a stuck month is unchanged and was always the better one:
-- decide the requests. A Super Administrator can approve or reject any of them
-- directly, because hr_trig_leave_enforce_approver returns early for one.

-- The console returns `forced`, so it has to stop before the column is dropped.
DROP FUNCTION IF EXISTS public.hr_attendance_period_console(integer, integer);
-- Old 5-argument signature, replaced below by the 3-argument one.
DROP FUNCTION IF EXISTS public.fn_hr_lock_attendance_period(uuid, integer, integer, boolean, text);

ALTER TABLE public.hr_attendance_periods
  DROP COLUMN IF EXISTS forced,
  DROP COLUMN IF EXISTS force_reason;


CREATE OR REPLACE FUNCTION public.fn_hr_lock_attendance_period(
  p_institution_id uuid,
  p_year           integer,
  p_month          integer
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
BEGIN
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION 'hr.attendance.period.manage is required to close an attendance month.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be 1-12, got %', p_month USING ERRCODE = '22023';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  -- Refuse to close a month that has nothing in it: an empty close would freeze
  -- a set of zeroes and read as "everyone was absent".
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

  -- 'escalated' counts: it is still awaiting somebody's decision.
  SELECT count(*) INTO v_pending
    FROM public.hr_leave_applications la
    JOIN public.staff s ON s.id = la.employee_id
   WHERE s.institution_id = p_institution_id
     AND la.status IN ('pending', 'escalated')
     AND la.start_date <= v_end AND la.end_date >= v_start;

  -- Unconditional. There is no override.
  IF v_pending > 0 THEN
    RAISE EXCEPTION
      '% request(s) for this month are still awaiting a decision. Every leave, short time off and compensatory off must be decided before the month can be closed.',
      v_pending
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.fn_hr_compute_attendance_period_summary(v_period.id);

  UPDATE public.hr_attendance_periods
     SET status = 'locked',
         locked_at = now(),
         locked_by = auth.uid(),
         updated_by = auth.uid()
   WHERE id = v_period.id
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.hr_attendance_period_console(
  p_year  integer,
  p_month integer
)
RETURNS TABLE(
  institution_id      uuid,
  institution_name    text,
  period_id           uuid,
  status              text,
  locked_at           timestamptz,
  staff_with_records  integer,
  record_count        integer,
  pending_total       integer,
  pending_leave       integer,
  pending_short_time_off integer,
  pending_comp_off    integer,
  approved_leave      integer,
  approved_short_time_off integer,
  approved_comp_off   integer,
  unprocessed_days    integer
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
         COALESCE(r.staff_ct, 0)::int,
         COALESCE(r.rec_ct, 0)::int,
         COALESCE(q.p_total, 0)::int,
         COALESCE(q.p_leave, 0)::int,
         COALESCE(q.p_sto, 0)::int,
         COALESCE(q.p_comp, 0)::int,
         COALESCE(q.a_leave, 0)::int,
         COALESCE(q.a_sto, 0)::int,
         COALESCE(q.a_comp, 0)::int,
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
      SELECT
        count(*) FILTER (WHERE la.status IN ('pending','escalated'))  AS p_total,
        count(*) FILTER (WHERE la.status IN ('pending','escalated') AND lt.request_category = 'leave')            AS p_leave,
        count(*) FILTER (WHERE la.status IN ('pending','escalated') AND lt.request_category = 'short_time_off')   AS p_sto,
        count(*) FILTER (WHERE la.status IN ('pending','escalated') AND lt.request_category = 'compensatory_off') AS p_comp,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'leave')                          AS a_leave,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'short_time_off')                 AS a_sto,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'compensatory_off')               AS a_comp
        FROM public.hr_leave_applications la
        JOIN public.hr_leave_types lt ON lt.id = la.leave_type_id
        JOIN public.staff s ON s.id = la.employee_id
       WHERE s.institution_id = i.id
         AND la.start_date <= v_end AND la.end_date >= v_start
    ) q ON true
   WHERE public.role_has_institution_access(i.id)
   ORDER BY (COALESCE(r.rec_ct, 0) = 0) DESC,
            (COALESCE(q.p_total, 0) > 0) DESC,
            i.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_attendance_period_console(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_attendance_period_console(integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer) IS
  'Close an institution-month. Refuses unconditionally while any leave / short time off / comp-off overlapping it is pending or escalated. There is no override.';
