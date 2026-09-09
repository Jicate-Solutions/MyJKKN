-- ============================================================================
-- CALENDAR HOLIDAYS NOW REACH BIOMETRIC ATTENDANCE (2026-09-02)
--
-- A holiday declared in /calendar/holidays had no effect on staff attendance:
-- everyone stayed ABSENT for the day, and ABSENT carries affects_lop = true, so
-- the Salary Register deducted a day's pay for a paid holiday.
--
-- THREE HOLIDAY STORES, AND THE CALENDAR WROTE TO THE ONE ATTENDANCE IGNORED:
--
--   calendar_entries (kind='holiday')  59 rows, all blocks_attendance = true
--                                      <- what /calendar/holidays writes
--   institution_leaves                 53 rows
--                                      <- the ONLY store attendance watched,
--                                         via tr_recompute_attendance_on_holiday_change
--   hr_public_holidays                 0 rows, dead
--
-- `blocks_attendance` was read only by the calendar's own UI. 232 of the 238
-- declared institution-days had no institution_leaves counterpart.
--
-- HOW IT COST MONEY. fn_hr_compute_attendance_period_summary computes
--   working_days = total_days - weekly_off - holiday
-- so a HOLIDAY day leaves the denominator and can never be LOP, while an ABSENT
-- day stays in it. Each missed holiday therefore added one working day while
-- payable days stayed flat, and the register's
--   unpaid_leave_days = business_working_days - paid_days
-- gained one. One missed holiday = one day's salary deducted.
--
-- This migration makes the CALENDAR canonical for attendance. institution_leaves
-- and its trigger are deliberately left working exactly as they are.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The resolver -- ONE definition of "is this date a holiday here"
--
-- Everything goes through it: the trigger below, the backfill, and the import
-- and recompute paths in TypeScript (via RPC). A second copy of this predicate
-- in TypeScript would be free to disagree about which days count, and the
-- disagreement would surface as pay.
--
-- DATES ARE EXTRACTED IN UTC, NOT IST, AND THAT IS THE WHOLE TRICK. An all-day
-- entry is stored UTC-anchored:
--
--   INDEPENDENCE DAY  start_at 2026-08-15 00:00:00+00
--                     end_at   2026-08-15 23:59:59.999+00
--
-- Read at Asia/Kolkata the end becomes 2026-08-16 05:29, so every one of the 59
-- entries looks like it spans two days and the day AFTER each holiday would be
-- stamped too. In UTC both ends land on the 15th. Read correctly, only 3 of the
-- 59 are genuinely multi-day, for 66 holiday days in total.
--
-- SECURITY DEFINER because it must see the entry regardless of the caller's
-- calendar visibility -- an HR import resolving holidays is not a calendar
-- reader. It takes no caller id, makes no authorisation decision, and pins
-- search_path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_calendar_holiday_dates(
  p_institution_id uuid,
  p_from           date,
  p_to             date
)
RETURNS TABLE(holiday_date date, title text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT g.d::date, ce.title
    FROM public.calendar_entries ce
    CROSS JOIN LATERAL generate_series(
      (ce.start_at AT TIME ZONE 'UTC')::date,
      (ce.end_at   AT TIME ZONE 'UTC')::date,
      interval '1 day'
    ) g(d)
   WHERE ce.kind = 'holiday'
     AND ce.is_active
     AND ce.blocks_attendance
     -- NULL or empty scope = every institution. 24 of the 59 are group-wide.
     AND (ce.scope_institution_ids IS NULL
          OR cardinality(ce.scope_institution_ids) = 0
          OR p_institution_id = ANY (ce.scope_institution_ids))
     AND g.d::date BETWEEN p_from AND p_to;
$function$;

COMMENT ON FUNCTION public.fn_hr_calendar_holiday_dates(uuid, date, date) IS
  'Holiday dates from calendar_entries for one institution over a range. Dates are extracted in UTC because all-day entries are UTC-anchored; reading them in IST puts the end on the following day. The single definition of "is this a holiday here" for HR.';

CREATE OR REPLACE FUNCTION public.fn_hr_is_calendar_holiday(
  p_institution_id uuid,
  p_date           date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.fn_hr_calendar_holiday_dates(p_institution_id, p_date, p_date)
  );
$function$;

COMMENT ON FUNCTION public.fn_hr_is_calendar_holiday(uuid, date) IS
  'Row-level predicate over fn_hr_calendar_holiday_dates, so the trigger and the range query cannot drift apart.';

-- Same shape for institution_leaves, used only to stop the two mechanisms
-- fighting when a calendar holiday is withdrawn.
CREATE OR REPLACE FUNCTION public.fn_hr_is_institution_leave_day(
  p_institution_id uuid,
  p_date           date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.institution_leaves il
     WHERE il.institution_id = p_institution_id
       AND p_date BETWEEN il.start_date AND il.end_date
  );
$function$;

-- ---------------------------------------------------------------------------
-- 2. The trigger on calendar_entries
--
-- Mirrors fn_recompute_attendance_on_holiday_change (which stays on
-- institution_leaves, untouched) -- same audit rows, same
-- recomputed_from_event_id, same hr.attendance.holiday_backfill_lookback_days
-- policy -- but keyed on the calendar, whose scope is an ARRAY of institutions
-- rather than a scalar.
--
-- IT MOVES ATTENDANCE BOTH WAYS. Forward is the feature. Backward exists because
-- otherwise a holiday added by mistake can never be undone: everybody stays paid
-- for it with no way back. A HOLIDAY day is only returned to ABSENT when it is
-- no longer a holiday under the calendar AND not one under institution_leaves,
-- so the older mechanism's stamps are never stolen.
--
-- A LOCKED PERIOD IS NEVER TOUCHED. The frozen day counts behind a closed month
-- may already have produced a register; silently restamping records underneath
-- one would make the register inexplicable against its own source. The existing
-- institution_leaves trigger does not guard this -- that gap is not widened here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recompute_attendance_on_calendar_holiday()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_holiday_status_id uuid;
  v_absent_status_id  uuid;
  v_event_id          uuid := gen_random_uuid();
  v_lookback_days     int;
  v_cutoff            date;
  v_start             date;
  v_end               date;
BEGIN
  -- Only holiday rows can move attendance, so meetings and exams leave
  -- immediately. This gate lives in the body rather than a WHEN clause because
  -- the trigger covers INSERT as well, and Postgres rejects a WHEN condition
  -- that references OLD on an INSERT-capable trigger.
  IF COALESCE(NEW.kind, OLD.kind) IS DISTINCT FROM 'holiday' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- The window spans BOTH shapes: moving a holiday from the 3rd to the 5th has
  -- to un-stamp the 3rd as well as stamp the 5th.
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

  -- Read at global scope: one calendar entry can span institutions whose
  -- policies differ, and the window has to be a single answer.
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

  IF v_holiday_status_id IS NULL OR v_absent_status_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Both directions are single statements built on data-modifying CTEs rather
  -- than a temp table. This is a FOR EACH ROW trigger: a statement touching two
  -- holiday rows fires it twice in the same transaction, and a temp table
  -- created on the first pass would still exist on the second. The CTE form
  -- carries no such state, and it also guarantees the audit rows and the update
  -- see exactly the same set -- the log cannot describe a change that did not
  -- happen.
  --
  -- PRESENT and HALF_DAY are never in scope: a punch is evidence of work, and
  -- overwriting it would erase what the device recorded.

  -- ABSENT -> HOLIDAY
  WITH affected AS (
    SELECT r.id, r.employee_id, r.institution_id, r.status_type_id
      FROM public.hr_attendance_records r
     WHERE r.work_date BETWEEN v_start AND v_end
       AND r.status_type_id = v_absent_status_id
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
           jsonb_build_object('status_type_id', a.status_type_id, 'status_code', 'ABSENT'),
           jsonb_build_object('status_type_id', v_holiday_status_id, 'status_code', 'HOLIDAY', 'event_id', v_event_id),
           'Calendar holiday added/changed; ABSENT -> HOLIDAY (lookback ' || v_lookback_days || 'd)',
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

  -- HOLIDAY -> ABSENT, only where NOTHING declares the day a holiday any more.
  -- The institution_leaves check is what stops this mechanism stealing a stamp
  -- the older one made.
  WITH affected AS (
    SELECT r.id, r.employee_id, r.institution_id, r.status_type_id
      FROM public.hr_attendance_records r
     WHERE r.work_date BETWEEN v_start AND v_end
       AND r.status_type_id = v_holiday_status_id
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

COMMENT ON FUNCTION public.fn_recompute_attendance_on_calendar_holiday() IS
  'Restamps attendance when a calendar holiday changes: ABSENT -> HOLIDAY where the calendar declares one, and back where it no longer does (unless institution_leaves still does). Never touches a locked period, and never touches PRESENT or HALF_DAY.';

DROP TRIGGER IF EXISTS tr_recompute_attendance_on_calendar_holiday ON public.calendar_entries;
CREATE TRIGGER tr_recompute_attendance_on_calendar_holiday
  AFTER INSERT OR UPDATE OR DELETE ON public.calendar_entries
  FOR EACH ROW
  -- No WHEN clause: it would have to reference OLD, which Postgres refuses on a
  -- trigger that also fires for INSERT. The kind check is the first thing the
  -- function does instead.
  EXECUTE FUNCTION public.fn_recompute_attendance_on_calendar_holiday();

-- ---------------------------------------------------------------------------
-- 3. Backfill: the 228 records already wrong
--
-- 76 staff across 3 dates (2026-08-03, 08-15, 08-26) in 7 institutions. August
-- 2026 has no attendance period and no salary register, so this corrects the
-- record before any pay was ever calculated from it.
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_holiday_status_id uuid;
  v_absent_status_id  uuid;
  v_event_id          uuid := gen_random_uuid();
  v_count             int;
BEGIN
  SELECT id INTO v_holiday_status_id FROM public.hr_attendance_status_types
   WHERE code = 'HOLIDAY' AND institution_id IS NULL LIMIT 1;
  SELECT id INTO v_absent_status_id FROM public.hr_attendance_status_types
   WHERE code = 'ABSENT' AND institution_id IS NULL LIMIT 1;

  IF v_holiday_status_id IS NULL OR v_absent_status_id IS NULL THEN
    RAISE EXCEPTION 'HOLIDAY/ABSENT status types are missing; refusing to backfill';
  END IF;

  WITH affected AS (
    SELECT r.id, r.employee_id, r.institution_id, r.status_type_id
      FROM public.hr_attendance_records r
     WHERE r.status_type_id = v_absent_status_id
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
           jsonb_build_object('status_type_id', a.status_type_id, 'status_code', 'ABSENT'),
           jsonb_build_object('status_type_id', v_holiday_status_id, 'status_code', 'HOLIDAY', 'event_id', v_event_id),
           'Backfill 20260902140000: calendar holidays had never reached attendance; ABSENT -> HOLIDAY',
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

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled % attendance records ABSENT -> HOLIDAY', v_count;

  -- Any period summary covering a month that contains a calendar holiday is now
  -- stale: the record changed, the frozen counts did not. None exist today; say
  -- so loudly rather than assume it stays true.
  IF EXISTS (
    SELECT 1
      FROM public.hr_attendance_period_summaries s
      JOIN public.hr_attendance_periods p ON p.id = s.period_id
     WHERE EXISTS (
       SELECT 1 FROM public.fn_hr_calendar_holiday_dates(
         p.institution_id,
         make_date(p.period_year, p.period_month, 1),
         (make_date(p.period_year, p.period_month, 1) + interval '1 month - 1 day')::date)
     )
  ) THEN
    RAISE WARNING 'Period summaries exist for a month containing a calendar holiday -- re-run fn_hr_compute_attendance_period_summary for those periods.';
  END IF;
END;
$backfill$;

-- ---------------------------------------------------------------------------
-- 4. Grants. A newly created function is executable by PUBLIC, which includes
--    anon, so each is revoked and then granted deliberately.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_hr_calendar_holiday_dates(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_is_calendar_holiday(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_is_institution_leave_day(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_recompute_attendance_on_calendar_holiday() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_hr_calendar_holiday_dates(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_is_calendar_holiday(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_is_institution_leave_day(uuid, date) TO authenticated, service_role;

COMMIT;
