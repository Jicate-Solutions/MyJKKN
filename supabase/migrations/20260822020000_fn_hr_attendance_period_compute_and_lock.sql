-- Freeze one institution-month: compute every staff member's day counts, then
-- close it.
--
-- THE COUNTS COME FROM hr_attendance_records, not from a calendar rule. The
-- evaluator already wrote WEEKLY_OFF from hr_shift_timings, so working days are
-- "days that are neither a weekly off nor a holiday" and cannot disagree with
-- what the attendance log shows. fn_prepare_payroll_period computes them a
-- different way (calendar minus Sundays minus holidays) and is wrong for this
-- organisation, where Saturday is a working day at all 14 institutions.

CREATE OR REPLACE FUNCTION public.fn_hr_compute_attendance_period_summary(
  p_period_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period public.hr_attendance_periods;
  v_start  date;
  v_end    date;
  v_rows   integer;
BEGIN
  SELECT * INTO v_period FROM public.hr_attendance_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance period not found: %', p_period_id USING ERRCODE = 'P0002';
  END IF;

  v_start := make_date(v_period.period_year, v_period.period_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  DELETE FROM public.hr_attendance_period_summaries WHERE period_id = p_period_id;

  WITH rec AS (
    SELECT r.employee_id,
           st.code,
           COALESCE(r.late_minutes, 0)    AS late_minutes,
           COALESCE(r.excused_minutes, 0) AS excused_minutes
      FROM public.hr_attendance_records r
      JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
     WHERE r.institution_id = v_period.institution_id
       AND r.work_date BETWEEN v_start AND v_end
  ),
  agg AS (
    SELECT employee_id,
           count(*)                                                   AS total_days,
           count(*) FILTER (WHERE code = 'WEEKLY_OFF')                AS weekly_off,
           count(*) FILTER (WHERE code = 'HOLIDAY')                   AS holiday,
           count(*) FILTER (WHERE code IN ('PRESENT','REGULARIZED'))  AS full_present,
           count(*) FILTER (WHERE code = 'HALF_DAY')                  AS half_day,
           count(*) FILTER (WHERE code = 'ABSENT')                    AS absent,
           count(*) FILTER (WHERE code IN ('ON_DUTY','on_clinical_posting')) AS on_duty,
           -- A day the evaluator could not judge. A payslip built on top of
           -- these should say so rather than quietly treat them as absent.
           count(*) FILTER (WHERE code NOT IN (
             'PRESENT','REGULARIZED','HALF_DAY','ABSENT','WEEKLY_OFF',
             'HOLIDAY','LEAVE','ON_DUTY','on_clinical_posting'))      AS unprocessed,
           sum(late_minutes)                                          AS late_minutes,
           sum(excused_minutes)                                       AS excused_minutes
      FROM rec
     GROUP BY employee_id
  ),
  -- Approved requests expanded to individual dates, then INTERSECTED with the
  -- attendance records: a leave that falls on a Sunday is not a leave day, and
  -- counting it from the application alone would inflate the total.
  req AS (
    SELECT la.employee_id,
           lt.leave_type_code,
           lt.is_paid,
           lt.request_category,
           g.d::date AS dt,
           CASE WHEN la.duration_type ILIKE '%half%' THEN 0.5 ELSE 1.0 END AS wt,
           la.start_time, la.end_time
      FROM public.hr_leave_applications la
      JOIN public.hr_leave_types lt ON lt.id = la.leave_type_id
      CROSS JOIN LATERAL generate_series(la.start_date, la.end_date, interval '1 day') g(d)
     WHERE la.status = 'approved'
       AND g.d::date BETWEEN v_start AND v_end
  ),
  req_effective AS (
    SELECT q.*
      FROM req q
      JOIN public.hr_attendance_records r
        ON r.employee_id = q.employee_id AND r.work_date = q.dt
      JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
     WHERE r.institution_id = v_period.institution_id
       AND st.code NOT IN ('WEEKLY_OFF', 'HOLIDAY')
  ),
  req_agg AS (
    SELECT employee_id,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'leave' AND is_paid), 0)         AS paid_leave,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'leave' AND NOT is_paid), 0)     AS unpaid_leave,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'compensatory_off'), 0)          AS comp_off,
           COALESCE(sum(
             GREATEST(0, EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
           ) FILTER (WHERE request_category = 'short_time_off'), 0)::int                      AS sto_minutes,
           COALESCE(
             jsonb_object_agg(leave_type_code, days)
               FILTER (WHERE request_category = 'leave' AND leave_type_code IS NOT NULL),
             '{}'::jsonb)                                                                     AS leave_by_type
      FROM (
        SELECT employee_id, request_category, is_paid, leave_type_code,
               start_time, end_time, wt,
               sum(wt) OVER (PARTITION BY employee_id, leave_type_code) AS days
          FROM req_effective
      ) x
     GROUP BY employee_id
  )
  INSERT INTO public.hr_attendance_period_summaries (
    period_id, staff_id, working_days, present_days, half_days, absent_days,
    weekly_off_days, holiday_days, leave_days, on_duty_days, comp_off_days,
    lop_days, payable_days, leave_by_type, short_time_off_minutes,
    late_minutes, excused_minutes, unprocessed_days
  )
  SELECT
    p_period_id,
    a.employee_id,
    (a.total_days - a.weekly_off - a.holiday)::numeric(5,1)                  AS working_days,
    (a.full_present + a.half_day * 0.5)::numeric(5,1)                        AS present_days,
    a.half_day,
    (a.absent + a.half_day * 0.5)::numeric(5,1)                              AS absent_days,
    a.weekly_off,
    a.holiday,
    (COALESCE(r.paid_leave, 0) + COALESCE(r.unpaid_leave, 0))::numeric(5,1)  AS leave_days,
    a.on_duty::numeric(5,1),
    COALESCE(r.comp_off, 0)::numeric(5,1),
    -- LOP: working days neither attended nor covered by a PAID absence.
    -- Unpaid leave is deliberately not subtracted -- that is what makes it
    -- unpaid.
    GREATEST(0, (a.total_days - a.weekly_off - a.holiday)
                - LEAST((a.total_days - a.weekly_off - a.holiday),
                        (a.full_present + a.half_day * 0.5)
                        + COALESCE(r.paid_leave, 0) + a.on_duty
                        + COALESCE(r.comp_off, 0)))::numeric(5,1)            AS lop_days,
    LEAST((a.total_days - a.weekly_off - a.holiday),
          (a.full_present + a.half_day * 0.5)
          + COALESCE(r.paid_leave, 0) + a.on_duty
          + COALESCE(r.comp_off, 0))::numeric(5,1)                           AS payable_days,
    COALESCE(r.leave_by_type, '{}'::jsonb),
    COALESCE(r.sto_minutes, 0),
    COALESCE(a.late_minutes, 0),
    COALESCE(a.excused_minutes, 0),
    a.unprocessed
  FROM agg a
  LEFT JOIN req_agg r ON r.employee_id = a.employee_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE public.hr_attendance_periods
     SET staff_count = v_rows,
         working_days_count = (
           SELECT max(working_days)::int
             FROM public.hr_attendance_period_summaries
            WHERE period_id = p_period_id
         ),
         updated_at = now()
   WHERE id = p_period_id;

  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_compute_attendance_period_summary(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_compute_attendance_period_summary(uuid) TO service_role;
