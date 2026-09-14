-- ============================================================================
-- fn_hr_attendance_period_projection: QUALIFY THE AMBIGUOUS COLUMNS (2026-09-06)
--
-- 20260906190000 lifted the close computation into a RETURNS TABLE function.
-- That turns every output column into a plpgsql variable, and two of them --
-- late_minutes and excused_minutes -- are also column aliases inside the `rec`
-- CTE. `sum(late_minutes)` was therefore ambiguous and Postgres refused the
-- function at RUNTIME, not at creation:
--
--   ERROR 42702: column reference "late_minutes" is ambiguous
--
-- The original never hit this because it was an INSERT with no out-parameters.
-- Fixed by qualifying both as rec.<col>. Nothing else changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_attendance_period_projection(
  p_institution_id uuid,
  p_year           integer,
  p_month          integer
)
RETURNS TABLE(
  staff_id               uuid,
  working_days           numeric,
  present_days           numeric,
  half_days              integer,
  absent_days            numeric,
  weekly_off_days        integer,
  holiday_days           integer,
  leave_days             numeric,
  on_duty_days           numeric,
  comp_off_days          numeric,
  lop_days               numeric,
  payable_days           numeric,
  leave_by_type          jsonb,
  short_time_off_minutes integer,
  late_minutes           integer,
  excused_minutes        integer,
  unprocessed_days       integer,
  scheduled_days         numeric,
  work_pattern_id        uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be 1-12, got %', p_month USING ERRCODE = '22023';
  END IF;

  -- Same gate as the close console this feeds. Read-only, but it exposes
  -- per-person attendance for a whole institution.
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION 'hr.attendance.period.manage is required to read an attendance projection.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_hr_institution_included(p_institution_id) THEN
    RAISE EXCEPTION 'This institution is excluded from the HR module.'
      USING ERRCODE = '23514';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  RETURN QUERY
  WITH rec AS (
    SELECT r.employee_id,
           st.code,
           COALESCE(r.late_minutes, 0)    AS late_minutes,
           COALESCE(r.excused_minutes, 0) AS excused_minutes
      FROM public.hr_attendance_records r
      JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
     WHERE r.institution_id = p_institution_id
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
           -- QUALIFIED. These two are now RETURNS TABLE out-parameters, so a
           -- bare reference is ambiguous between the plpgsql variable and the
           -- CTE column and Postgres refuses the whole function at runtime.
           -- The original had no out-parameters, which is why it did not care.
           sum(rec.late_minutes)                                      AS late_minutes,
           sum(rec.excused_minutes)                                   AS excused_minutes
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
     WHERE r.institution_id = p_institution_id
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
  ),
  base AS (
    SELECT
      a.employee_id AS staff_id,
      (a.total_days - a.weekly_off - a.holiday)::numeric(5,1)                  AS working_days,
      (a.full_present + a.half_day * 0.5)::numeric(5,1)                        AS present_days,
      a.half_day::integer                                                      AS half_days,
      (a.absent + a.half_day * 0.5)::numeric(5,1)                              AS absent_days,
      a.weekly_off::integer                                                    AS weekly_off_days,
      a.holiday::integer                                                       AS holiday_days,
      (COALESCE(r.paid_leave, 0) + COALESCE(r.unpaid_leave, 0))::numeric(5,1)  AS leave_days,
      a.on_duty::numeric(5,1)                                                  AS on_duty_days,
      COALESCE(r.comp_off, 0)::numeric(5,1)                                    AS comp_off_days,
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
      COALESCE(r.leave_by_type, '{}'::jsonb)                                   AS leave_by_type,
      COALESCE(r.sto_minutes, 0)::integer                                      AS short_time_off_minutes,
      COALESCE(a.late_minutes, 0)::integer                                     AS late_minutes,
      COALESCE(a.excused_minutes, 0)::integer                                  AS excused_minutes,
      a.unprocessed::integer                                                   AS unprocessed_days
    FROM agg a
    LEFT JOIN req_agg r ON r.employee_id = a.employee_id
  ),
  -- Second phase, folded in. The original read these staff back out of the
  -- summaries table after inserting; here the same set comes straight from base.
  staff_in AS (
    SELECT b.staff_id, s.institution_id, s.category_id, ec.is_teaching, s.gender
      FROM base b
      JOIN public.staff s ON s.id = b.staff_id
      JOIN public.employment_categories ec ON ec.id = s.category_id
  ),
  hol AS (
    SELECT h.holiday_date
      FROM public.fn_hr_calendar_holiday_dates(p_institution_id, v_start, v_end) h
  ),
  days AS (
    SELECT gs::date AS d FROM generate_series(v_start, v_end, interval '1 day') gs
  ),
  sched AS (
    SELECT si.staff_id,
           count(*) FILTER (
             WHERE COALESCE(
                     CASE WHEN (EXTRACT(ISODOW FROM dd.d) = 6
                                AND EXTRACT(DAY FROM dd.d) BETWEEN 8 AND 14
                                AND t.second_saturday_holiday) THEN false
                          ELSE t.is_working_day END,
                     false)
               AND NOT EXISTS (SELECT 1 FROM hol h WHERE h.holiday_date = dd.d)
           ) AS scheduled
      FROM staff_in si
      CROSS JOIN days dd
      LEFT JOIN LATERAL public.fn_shift_timing_pick(
        si.institution_id, si.category_id, si.is_teaching, si.gender,
        EXTRACT(ISODOW FROM dd.d)::smallint, dd.d,
        public.fn_staff_work_pattern_id(si.staff_id, dd.d)) t ON true
     GROUP BY si.staff_id
  ),
  pat AS (
    SELECT DISTINCT ON (a.staff_id) a.staff_id, a.work_pattern_id
      FROM public.hr_staff_work_pattern_assignments a
     WHERE a.effective_from <= v_end
       AND (a.effective_until IS NULL OR a.effective_until > v_start)
     ORDER BY a.staff_id, a.effective_from DESC
  )
  SELECT b.staff_id, b.working_days, b.present_days, b.half_days, b.absent_days,
         b.weekly_off_days, b.holiday_days, b.leave_days, b.on_duty_days,
         b.comp_off_days, b.lop_days, b.payable_days, b.leave_by_type,
         b.short_time_off_minutes, b.late_minutes, b.excused_minutes,
         b.unprocessed_days,
         sc.scheduled::numeric(5,1) AS scheduled_days,
         pt.work_pattern_id
    FROM base b
    LEFT JOIN sched sc ON sc.staff_id = b.staff_id
    LEFT JOIN pat   pt ON pt.staff_id = b.staff_id;
END;
$function$;
