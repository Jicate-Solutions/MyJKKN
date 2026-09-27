-- A declared holiday is HOLIDAY for everyone, punches or not (2026-09-26).
--
-- Until now only ABSENT became HOLIDAY. A punch on a declared holiday was judged
-- as an ordinary working day: VAISALI R (CNR020) punched 08:50-16:07 on
-- 14-Sep-2026 (Vinayagar Chaturthi), left before shift end and got HALF_DAY —
-- 0.5 present + 0.5 absent on a day nobody was scheduled — while a colleague who
-- came in late was judged ABSENT and therefore became HOLIDAY.
--
-- Now PRESENT and HALF_DAY become HOLIDAY too. in_at / out_at are NOT touched:
-- fn_hr_comp_off_biometric_check reads the punches, not the status, so the
-- person claims the worked holiday as a compensatory off.
--
-- The TypeScript side (applyHolidayToStatusCode, used by the biometric import and
-- both recompute paths) changes in the same commit; this is the calendar
-- trigger's copy of the rule, plus a backfill of the rows already written.

CREATE OR REPLACE FUNCTION public.fn_recompute_attendance_on_calendar_holiday()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_holiday_status_id uuid;
  v_absent_status_id  uuid;
  v_override_ids      uuid[];
  v_event_id          uuid := gen_random_uuid();
  v_lookback_days     int;
  v_cutoff            date;
  v_start             date;
  v_end               date;
BEGIN
  IF COALESCE(NEW.kind, OLD.kind) IS DISTINCT FROM 'holiday' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_start := LEAST(
    (COALESCE(NEW.start_at, OLD.start_at) AT TIME ZONE 'UTC')::date,
    (COALESCE(OLD.start_at, NEW.start_at) AT TIME ZONE 'UTC')::date
  );
  v_end := GREATEST(
    (COALESCE(NEW.end_at, OLD.end_at) AT TIME ZONE 'UTC')::date,
    (COALESCE(OLD.end_at, NEW.end_at) AT TIME ZONE 'UTC')::date
  );

  IF v_start IS NULL OR v_end IS NULL OR v_start > v_end THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_lookback_days := public.fn_get_policy_int(
    'hr.attendance.holiday_backfill_lookback_days', 90, NULL
  );
  v_cutoff := (CURRENT_DATE - (v_lookback_days || ' days')::interval)::date;
  v_start  := GREATEST(v_start, v_cutoff);
  IF v_start > v_end THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_holiday_status_id
    FROM public.hr_attendance_status_types
   WHERE code = 'HOLIDAY' AND institution_id IS NULL LIMIT 1;
  SELECT id INTO v_absent_status_id
    FROM public.hr_attendance_status_types
   WHERE code = 'ABSENT' AND institution_id IS NULL LIMIT 1;
  -- Same set as applyHolidayToStatusCode's HOLIDAY_OVERRIDES.
  SELECT array_agg(id) INTO v_override_ids
    FROM public.hr_attendance_status_types
   WHERE code IN ('ABSENT', 'PRESENT', 'HALF_DAY') AND institution_id IS NULL;

  IF v_holiday_status_id IS NULL OR v_absent_status_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Declared: every punch verdict -> HOLIDAY. Punches stay on the row.
  WITH affected AS (
    SELECT r.id, r.employee_id, r.institution_id, r.status_type_id, st.code
      FROM public.hr_attendance_records r
      JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
     WHERE r.work_date BETWEEN v_start AND v_end
       AND r.status_type_id = ANY (v_override_ids)
       AND public.fn_hr_is_calendar_holiday(r.institution_id, r.work_date)
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_attendance_periods p
          WHERE p.institution_id = r.institution_id
            AND p.period_year  = EXTRACT(YEAR  FROM r.work_date)::int
            AND p.period_month = EXTRACT(MONTH FROM r.work_date)::int
            AND p.status = 'locked'
       )
  ), logged AS (
    INSERT INTO public.hr_attendance_audit_log (
      attendance_record_id, employee_id, institution_id, actor_id, action,
      before_state, after_state, reason, created_at
    )
    SELECT a.id, a.employee_id, a.institution_id, NULL, 'recompute',
           jsonb_build_object('status_type_id', a.status_type_id, 'status_code', a.code),
           jsonb_build_object('status_type_id', v_holiday_status_id, 'status_code', 'HOLIDAY', 'event_id', v_event_id),
           'Calendar holiday added/changed; ' || a.code || ' -> HOLIDAY (lookback ' || v_lookback_days || 'd)',
           now()
      FROM affected a
    RETURNING 1
  )
  UPDATE public.hr_attendance_records r
     SET status_type_id = v_holiday_status_id,
         recomputed_from_event_id = v_event_id,
         updated_at = now()
    FROM affected a
   WHERE r.id = a.id;

  -- Removed/descoped: only a row with NO punches can be called ABSENT here.
  -- A row with punches needs evaluateDay against its shift timing, which only
  -- the TypeScript recompute can do (HR > Attendance > Recompute); it stays
  -- HOLIDAY until then rather than becoming a wrong ABSENT (LOP).
  WITH affected AS (
    SELECT r.id, r.employee_id, r.institution_id, r.status_type_id
      FROM public.hr_attendance_records r
     WHERE r.work_date BETWEEN v_start AND v_end
       AND r.status_type_id = v_holiday_status_id
       AND r.in_at IS NULL AND r.out_at IS NULL
       AND NOT public.fn_hr_is_calendar_holiday(r.institution_id, r.work_date)
       AND NOT public.fn_hr_is_institution_leave_day(r.institution_id, r.work_date)
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_attendance_periods p
          WHERE p.institution_id = r.institution_id
            AND p.period_year  = EXTRACT(YEAR  FROM r.work_date)::int
            AND p.period_month = EXTRACT(MONTH FROM r.work_date)::int
            AND p.status = 'locked'
       )
  ), logged AS (
    INSERT INTO public.hr_attendance_audit_log (
      attendance_record_id, employee_id, institution_id, actor_id, action,
      before_state, after_state, reason, created_at
    )
    SELECT a.id, a.employee_id, a.institution_id, NULL, 'recompute',
           jsonb_build_object('status_type_id', a.status_type_id, 'status_code', 'HOLIDAY'),
           jsonb_build_object('status_type_id', v_absent_status_id, 'status_code', 'ABSENT', 'event_id', v_event_id),
           'Calendar holiday removed/descoped; HOLIDAY -> ABSENT',
           now()
      FROM affected a
    RETURNING 1
  )
  UPDATE public.hr_attendance_records r
     SET status_type_id = v_absent_status_id,
         recomputed_from_event_id = v_event_id,
         updated_at = now()
    FROM affected a
   WHERE r.id = a.id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Backfill: PRESENT / HALF_DAY rows already written on a declared holiday, in
-- months that are not locked (16 rows on 2026-09-26: 9 in Sep, 7 Dental in Aug;
-- no salary register run exists for any of them).
WITH ids AS (
  SELECT
    (SELECT id FROM public.hr_attendance_status_types WHERE code = 'HOLIDAY' AND institution_id IS NULL LIMIT 1) AS holiday_id,
    gen_random_uuid() AS event_id
), affected AS (
  SELECT r.id, r.employee_id, r.institution_id, r.status_type_id, st.code
    FROM public.hr_attendance_records r
    JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
   WHERE st.code IN ('PRESENT', 'HALF_DAY')
     AND r.work_date >= DATE '2026-06-01'
     AND public.fn_hr_is_calendar_holiday(r.institution_id, r.work_date)
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_attendance_periods p
        WHERE p.institution_id = r.institution_id
          AND p.period_year  = EXTRACT(YEAR  FROM r.work_date)::int
          AND p.period_month = EXTRACT(MONTH FROM r.work_date)::int
          AND p.status = 'locked'
     )
), logged AS (
  INSERT INTO public.hr_attendance_audit_log (
    attendance_record_id, employee_id, institution_id, actor_id, action,
    before_state, after_state, reason, created_at
  )
  SELECT a.id, a.employee_id, a.institution_id, NULL, 'recompute',
         jsonb_build_object('status_type_id', a.status_type_id, 'status_code', a.code),
         jsonb_build_object('status_type_id', i.holiday_id, 'status_code', 'HOLIDAY', 'event_id', i.event_id),
         'Backfill 2026-09-26: declared holiday overrides punch verdict ' || a.code || ' -> HOLIDAY (punches kept for comp-off)',
         now()
    FROM affected a CROSS JOIN ids i
  RETURNING 1
)
UPDATE public.hr_attendance_records r
   SET status_type_id = i.holiday_id,
       recomputed_from_event_id = i.event_id,
       updated_at = now()
  FROM affected a CROSS JOIN ids i
 WHERE r.id = a.id;
