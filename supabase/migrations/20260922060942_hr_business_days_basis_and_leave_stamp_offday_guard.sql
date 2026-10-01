-- ============================================================================
-- Salary register: Business Working Days = calendar minus week-offs, holidays
-- paid inside; leave stamps stop overwriting week-offs and holidays (2026-09-22)
-- ============================================================================
--
-- THE INCIDENT. JKKN College of Pharmacy, August 2026, DR. SEKAR V (COP003):
-- the attendance page said 26 working days (31 minus 5 Sundays), 21 present,
-- 2 paid leave, 3 holidays, 26 paid, 0 loss of pay. The salary register said
-- 29 business working days, 23 paid, 6 unpaid, and deducted 16,882.76 from a
-- month with no absence. Across the 50 payable lines it charged 455 unpaid
-- days (3,71,241.40) where 161 (1,12,096.50) was the most the frozen counts
-- could justify even on the old basis.
--
-- TWO BUGS, STACKED.
--
-- 1. fn_recompute_attendance_on_leave_approval (the approval trigger) and
--    fn_restamp_leave_attendance (the import re-stamp) rewrote EVERY record
--    between start_date and end_date as LEAVE, week-offs and holidays included.
--    COP031's 23-day August leave turned Sundays 2/16/30 and holidays 3/15/26
--    into LEAVE, so his per-staff working_days (records minus WEEKLY_OFF minus
--    HOLIDAY) came to 29 instead of 23. Eleven such rows exist in total, across
--    Pharmacy (9), Jicate (1) and Dental (1); every one is in the audit log
--    with its pre-stamp status, which is how they are put back below.
--
-- 2. fn_hr_compute_attendance_period_summary wrote hr_attendance_periods
--    .working_days_count as MAX(working_days) over every summary in the month,
--    and the register divided EVERYONE by that. One over-counted person became
--    the divisor for fifty. 51 of the 53 Pharmacy summaries said 23.
--
-- AND ONE MISMATCH THAT HID THEM. The attendance page counts holidays INSIDE
-- working days and INSIDE paid days (26 and 26); the register counted them
-- outside both (23 and 23). Net pay agreed for a full-month employee, but not
-- one number on the two screens matched, so when the divisor went wrong there
-- was nothing to reconcile against. HR confirmed 2026-09-22 that the register
-- should read like the attendance page.
--
-- WHAT CHANGES.
--
-- - hr_attendance_period_summaries.business_days: the resolver's full-month
--   working days for the person INCLUDING holidays — calendar days minus the
--   days fn_shift_timing_pick says are off (pattern, role and person overrides
--   applied). Frozen at close. This is the register's Business Working Days
--   and each line's day-rate divisor (registerBasisFor). Like scheduled_days
--   it is NOT clamped to the joining date: a mid-month joiner is unpaid for the
--   days before they joined, not paid a full month for half of one.
-- - hr_attendance_periods.working_days_count becomes MODE(business_days) —
--   the institution's typical month, for display and as the fallback divisor
--   for months closed before the column existed. Never MAX again.
-- - hr_salary_register_lines.holiday_days, so Paid Days = Worked + Paid Leave
--   + On Duty + Holidays adds up on the page and in the export.
-- - Both leave stamps skip records whose CURRENT status is WEEKLY_OFF or
--   HOLIDAY. The projection already intersects leave with records that way
--   (req_effective); the stamps now agree with it.
-- - business_days is backfilled for every existing summary from the same
--   resolver, and every period's working_days_count is re-derived, so no
--   closed month is left in the old unit. Existing register RUNS are frozen
--   history and are not rewritten here — regenerate Pharmacy and Jicate
--   August from the app (the close is repaired below; the run is not).
-- - The eleven mis-stamped rows are restored to their pre-stamp status from
--   the audit log; Pharmacy and Jicate August are opened, repaired,
--   recomputed and re-locked with their original lock preserved, following
--   20260908055910's pattern (the lock trigger has no bypass, on purpose).
--
-- NOT TOUCHED. Fourteen HALF_DAY verdicts on holiday dates were written by the
-- biometric IMPORT itself (source='biometric', no audit row) — people who
-- punched on a holiday. That is an evaluator question, not a stamp one.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hr_attendance_period_summaries
  ADD COLUMN IF NOT EXISTS business_days numeric(5,1);

COMMENT ON COLUMN public.hr_attendance_period_summaries.business_days IS
  'Full-month working days per the shift-timing resolver INCLUDING holidays (calendar days minus non-working days; pattern/role/person aware; not clamped to joining). The salary register''s Business Working Days and this line''s day-rate divisor. NULL only on rows frozen before 2026-09-22 that the backfill could not resolve.';

COMMENT ON COLUMN public.hr_attendance_period_summaries.scheduled_days IS
  'Full-month working days per the resolver EXCLUDING holidays. Superseded as the pay divisor by business_days (2026-09-22); kept for the close console and as the fallback for months closed 2026-09-04..2026-09-22.';

ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS holiday_days numeric(5,1) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hr_salary_register_lines.holiday_days IS
  'Paid days that fell on a holiday, inside business_working_days: paid_days = worked_days + paid_leave_days + on_duty_days + holiday_days (2026-09-22). 0 on lines generated before the column existed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The leave stamps skip week-offs and holidays
-- ─────────────────────────────────────────────────────────────────────────────
-- A leave that spans a Sunday is not a leave day on the Sunday. The projection
-- has always read it that way (req_effective excludes WEEKLY_OFF/HOLIDAY
-- records); the stamps now write it that way too, so the records and the
-- counts derived from them agree.

CREATE OR REPLACE FUNCTION public.fn_recompute_attendance_on_leave_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_status_id UUID;
  v_target_code      TEXT;
  v_category         TEXT;
  v_event_id         UUID := gen_random_uuid();
BEGIN
  IF NOT (TG_OP = 'UPDATE'
          AND NEW.status = 'approved'
          AND COALESCE(OLD.status, '') <> 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM hr_leave_types WHERE id = NEW.leave_type_id;

  -- A permission is measured in minutes, not days. Leave the day's verdict as
  -- the biometric engine computed it. Mirrors hr_trig_update_leave_balance.
  IF v_category = 'short_time_off' OR NEW.duration_type = 'hourly' THEN
    RETURN NEW;
  END IF;

  v_target_code := CASE
    WHEN NEW.duration_type IN ('first_half', 'second_half') THEN 'HALF_DAY'
    ELSE 'LEAVE'
  END;

  SELECT id INTO v_target_status_id
  FROM hr_attendance_status_types
  WHERE code = v_target_code AND institution_id IS NULL
  LIMIT 1;

  IF v_target_status_id IS NULL THEN RETURN NEW; END IF;

  -- WEEK-OFFS AND HOLIDAYS ARE NOT LEAVE DAYS (2026-09-22). A 23-day leave
  -- used to turn every Sunday and holiday inside it into LEAVE, which inflated
  -- that person's working-day count and, through MAX(), the whole
  -- institution's pay divisor. The evaluator's WEEKLY_OFF/HOLIDAY verdict
  -- stands; the projection never counted those days as leave anyway.
  INSERT INTO hr_attendance_audit_log (
    attendance_record_id, employee_id, institution_id, actor_id, action,
    before_state, after_state, reason, created_at
  )
  SELECT
    r.id, r.employee_id, r.institution_id, NEW.final_approver_id, 'recompute',
    jsonb_build_object('status_type_id', r.status_type_id),
    jsonb_build_object('status_type_id', v_target_status_id,
                       'status_code', v_target_code,
                       'event_id', v_event_id,
                       'leave_application_id', NEW.id),
    format('Leave application approved; previous status -> %s', v_target_code),
    NOW()
  FROM hr_attendance_records r
  JOIN hr_attendance_status_types cur ON cur.id = r.status_type_id
  WHERE r.employee_id = NEW.employee_id
    AND r.work_date BETWEEN NEW.start_date AND NEW.end_date
    AND r.status_type_id <> v_target_status_id
    AND cur.code NOT IN ('WEEKLY_OFF', 'HOLIDAY');

  UPDATE hr_attendance_records r
    SET status_type_id = v_target_status_id,
        recomputed_from_event_id = v_event_id,
        updated_at = NOW()
  FROM hr_attendance_status_types cur
  WHERE cur.id = r.status_type_id
    AND r.employee_id = NEW.employee_id
    AND r.work_date BETWEEN NEW.start_date AND NEW.end_date
    AND r.status_type_id <> v_target_status_id
    AND cur.code NOT IN ('WEEKLY_OFF', 'HOLIDAY');

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_restamp_leave_attendance(p_institution_id uuid, p_from date, p_to date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_leave_id uuid;
  v_half_id  uuid;
  v_event_id uuid := gen_random_uuid();
  v_actor    uuid := auth.uid();
  v_changed  integer := 0;
BEGIN
  -- auth.uid() IS NULL means the service-role client. EXECUTE is revoked from
  -- anon below, so NULL here cannot be an unauthenticated caller.
  --
  -- The signed-in branch mirrors app/api/hr/attendance/import/route.ts EXACTLY
  -- (is_admin OR hr.attendance.override). Anyone allowed to run an import is
  -- already allowed to rewrite every status_type_id in the range, so a narrower
  -- gate here would not protect anything -- it would just fail the re-stamp for
  -- an is_admin importer who lacks the key, silently reintroducing the very bug
  -- this function exists to fix.
  IF v_actor IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT public.is_admin()
     AND NOT public.user_has_permission('hr.attendance.override') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.attendance.override required';
  END IF;

  IF p_institution_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_leave_id
  FROM public.hr_attendance_status_types
  WHERE code = 'LEAVE' AND institution_id IS NULL LIMIT 1;

  SELECT id INTO v_half_id
  FROM public.hr_attendance_status_types
  WHERE code = 'HALF_DAY' AND institution_id IS NULL LIMIT 1;

  IF v_leave_id IS NULL OR v_half_id IS NULL THEN
    RETURN 0;
  END IF;

  -- WEEK-OFFS AND HOLIDAYS ARE NOT LEAVE DAYS (2026-09-22): the evaluator's
  -- verdict for a non-working day stands, whatever leave spans it. See
  -- fn_recompute_attendance_on_leave_approval for the incident.
  WITH tgt AS (
    SELECT DISTINCT ON (r.id)
           r.id                AS record_id,
           r.employee_id       AS employee_id,
           r.institution_id    AS institution_id,
           r.status_type_id    AS old_status,
           CASE WHEN a.duration_type IN ('first_half', 'second_half')
                THEN v_half_id ELSE v_leave_id END AS new_status
    FROM public.hr_attendance_records r
    JOIN public.hr_attendance_status_types cur ON cur.id = r.status_type_id
    JOIN public.hr_leave_applications a
      ON a.employee_id = r.employee_id
     AND r.work_date BETWEEN a.start_date AND a.end_date
     AND a.status = 'approved'
    JOIN public.hr_leave_types t ON t.id = a.leave_type_id
    WHERE r.institution_id = p_institution_id
      AND r.work_date BETWEEN p_from AND p_to
      AND cur.code NOT IN ('WEEKLY_OFF', 'HOLIDAY')
      AND t.request_category IN ('leave', 'compensatory_off')
      AND a.duration_type <> 'hourly'
    ORDER BY r.id,
             CASE WHEN a.duration_type IN ('first_half', 'second_half') THEN 1 ELSE 0 END,
             a.final_decided_at DESC NULLS LAST
  ),
  upd AS (
    UPDATE public.hr_attendance_records r
       SET status_type_id           = tgt.new_status,
           recomputed_from_event_id = v_event_id,
           updated_at               = now()
      FROM tgt
     WHERE r.id = tgt.record_id
       AND r.status_type_id IS DISTINCT FROM tgt.new_status
    RETURNING r.id, r.employee_id, r.institution_id,
              tgt.old_status, tgt.new_status
  ),
  aud AS (
    INSERT INTO public.hr_attendance_audit_log (
      attendance_record_id, employee_id, institution_id, actor_id, action,
      before_state, after_state, reason, created_at
    )
    SELECT u.id, u.employee_id, u.institution_id, v_actor, 'recompute',
           jsonb_build_object('status_type_id', u.old_status),
           jsonb_build_object('status_type_id', u.new_status,
                              'event_id', v_event_id),
           'Approved leave re-stamped over biometric verdict',
           now()
    FROM upd u
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upd;

  RETURN v_changed;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The projection gains business_days
-- ─────────────────────────────────────────────────────────────────────────────
-- RETURNS TABLE cannot change under CREATE OR REPLACE, so the function is
-- dropped and re-created; EXECUTE grants die with it and are restored below.
-- Body identical to 20260921120000 except the sched CTE, which now also counts
-- the working days WITHOUT the holiday exclusion, and the final SELECT.
DROP FUNCTION IF EXISTS public.fn_hr_attendance_period_projection(uuid, integer, integer);

CREATE FUNCTION public.fn_hr_attendance_period_projection(p_institution_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(staff_id uuid, working_days numeric, present_days numeric, half_days integer, absent_days numeric, weekly_off_days integer, holiday_days integer, leave_days numeric, on_duty_days numeric, comp_off_days numeric, lop_days numeric, payable_days numeric, leave_by_type jsonb, short_time_off_minutes integer, late_minutes integer, excused_minutes integer, unprocessed_days integer, scheduled_days numeric, work_pattern_id uuid, business_days numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    SELECT b.staff_id, s.institution_id, s.category_id, ec.is_teaching, s.gender,
           public.fn_staff_role_keys(b.staff_id) AS role_keys
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
  -- Two counts from ONE resolver pass. scheduled = working days the person
  -- is expected to attend (holidays out); business = the same days with the
  -- holidays left in, i.e. calendar days minus week-offs. The register divides
  -- by business and pays the holidays; the close console shows scheduled.
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
           ) AS scheduled,
           count(*) FILTER (
             WHERE COALESCE(
                     CASE WHEN (EXTRACT(ISODOW FROM dd.d) = 6
                                AND EXTRACT(DAY FROM dd.d) BETWEEN 8 AND 14
                                AND t.second_saturday_holiday) THEN false
                          ELSE t.is_working_day END,
                     false)
           ) AS business
      FROM staff_in si
      CROSS JOIN days dd
      LEFT JOIN LATERAL public.fn_shift_timing_pick(
        si.institution_id, si.category_id, si.is_teaching, si.gender,
        EXTRACT(ISODOW FROM dd.d)::smallint, dd.d,
        public.fn_staff_work_pattern_id(si.staff_id, dd.d),
        si.staff_id, si.role_keys) t ON true
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
         pt.work_pattern_id,
         sc.business::numeric(5,1)  AS business_days
    FROM base b
    LEFT JOIN sched sc ON sc.staff_id = b.staff_id
    LEFT JOIN pat   pt ON pt.staff_id = b.staff_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_attendance_period_projection(uuid, integer, integer) IS
  'Per-staff attendance figures for one institution-month, computed from live data and writing nothing. The month close INSERTs these same rows, so a pre-close preview and the closed month cannot disagree. business_days (2026-09-22) is the register''s divisor: resolver working days including holidays.';

REVOKE ALL ON FUNCTION public.fn_hr_attendance_period_projection(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_attendance_period_projection(uuid, integer, integer)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The close freezes business_days and derives the month standard by MODE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hr_compute_attendance_period_summary(p_period_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period public.hr_attendance_periods;
  v_rows   integer;
BEGIN
  SELECT * INTO v_period FROM public.hr_attendance_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance period not found: %', p_period_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.hr_attendance_period_summaries WHERE period_id = p_period_id;

  INSERT INTO public.hr_attendance_period_summaries (
    period_id, staff_id, working_days, present_days, half_days, absent_days,
    weekly_off_days, holiday_days, leave_days, on_duty_days, comp_off_days,
    lop_days, payable_days, leave_by_type, short_time_off_minutes,
    late_minutes, excused_minutes, unprocessed_days, scheduled_days, work_pattern_id,
    business_days
  )
  SELECT p_period_id, p.staff_id, p.working_days, p.present_days, p.half_days,
         p.absent_days, p.weekly_off_days, p.holiday_days, p.leave_days,
         p.on_duty_days, p.comp_off_days, p.lop_days, p.payable_days,
         p.leave_by_type, p.short_time_off_minutes, p.late_minutes,
         p.excused_minutes, p.unprocessed_days, p.scheduled_days, p.work_pattern_id,
         p.business_days
    FROM public.fn_hr_attendance_period_projection(
           v_period.institution_id, v_period.period_year, v_period.period_month) p;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- THE MONTH STANDARD IS THE MODE, NOT THE MAX (2026-09-22). MAX(working_days)
  -- let one person whose leave had been stamped over three Sundays and three
  -- holidays set a 29-day divisor for all fifty people on the Pharmacy August
  -- register. The mode of the resolver's business_days is the institution's
  -- typical month; it is a display figure and the fallback divisor only — each
  -- register line divides by its own business_days.
  UPDATE public.hr_attendance_periods
     SET staff_count = v_rows,
         working_days_count = (
           SELECT mode() WITHIN GROUP (ORDER BY business_days)::int
             FROM public.hr_attendance_period_summaries
            WHERE period_id = p_period_id
              AND business_days IS NOT NULL
         ),
         updated_at = now()
   WHERE id = p_period_id;

  RETURN v_rows;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Backfill business_days on every frozen summary, re-derive every standard
-- ─────────────────────────────────────────────────────────────────────────────
-- The same resolver pass as the projection's sched CTE, run over the rows that
-- already exist rather than re-closing nine months. Shift timings are
-- effective-dated, so resolving an August date today gives August's week.
-- A staff row that has since lost its category resolves to no timing and
-- stays NULL rather than 0.
UPDATE public.hr_attendance_period_summaries s
   SET business_days = b.business
  FROM public.hr_attendance_periods p,
       public.staff st
  JOIN public.employment_categories ec ON ec.id = st.category_id,
       LATERAL (
         SELECT count(*) FILTER (
                  WHERE COALESCE(
                          CASE WHEN (EXTRACT(ISODOW FROM dd.d) = 6
                                     AND EXTRACT(DAY FROM dd.d) BETWEEN 8 AND 14
                                     AND t.second_saturday_holiday) THEN false
                               ELSE t.is_working_day END,
                          false)
                )::numeric(5,1) AS business
           FROM generate_series(
                  make_date(p.period_year, p.period_month, 1),
                  (make_date(p.period_year, p.period_month, 1) + interval '1 month - 1 day')::date,
                  interval '1 day') dd(d)
           LEFT JOIN LATERAL public.fn_shift_timing_pick(
             st.institution_id, st.category_id, ec.is_teaching, st.gender,
             EXTRACT(ISODOW FROM dd.d)::smallint, dd.d::date,
             public.fn_staff_work_pattern_id(st.id, dd.d::date),
             st.id, public.fn_staff_role_keys(st.id)) t ON true
       ) b
 WHERE p.id = s.period_id
   AND st.id = s.staff_id
   AND s.business_days IS NULL;

UPDATE public.hr_attendance_periods p
   SET working_days_count = m.standard,
       updated_at = now()
  FROM (
    SELECT period_id, mode() WITHIN GROUP (ORDER BY business_days)::int AS standard
      FROM public.hr_attendance_period_summaries
     WHERE business_days IS NOT NULL
     GROUP BY period_id
  ) m
 WHERE m.period_id = p.id
   AND p.working_days_count IS DISTINCT FROM m.standard;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Put the eleven mis-stamped days back, and repair the two closed months
-- ─────────────────────────────────────────────────────────────────────────────
DO $migration$
DECLARE
  -- The CAO who closed both Pharmacy and Jicate August 2026. Not a super admin;
  -- holds hr.attendance.period.manage, which is the projection's other gate.
  v_actor      uuid := 'a196f963-8a45-415e-8fe7-f210d147a286';
  v_pharmacy   uuid := 'efc0ab68-e2aa-44da-9645-d3d2afc3498a';
  v_jicate     uuid := '50712f70-fdd7-41eb-b2d6-13ad34bab3be';
  v_event_id   uuid := gen_random_uuid();
  v_period     record;
  v_restored   integer;
  v_rows       integer;
  v_left       integer;
  v_basis      integer;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_actor::text, 'role', 'authenticated')::text,
    true);

  IF NOT (public.is_super_admin() OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION
      'Cannot recompute: % no longer passes the projection gate. Re-check before applying.',
      v_actor;
  END IF;

  -- 1. The rows to restore: records whose CURRENT status is a leave stamp that
  --    the audit log shows was written over WEEKLY_OFF or HOLIDAY. Refuse to
  --    run against a different set from the one this repair was reviewed on.
  CREATE TEMP TABLE repair_rows ON COMMIT DROP AS
  SELECT DISTINCT ON (r.id)
         r.id AS record_id, r.employee_id, r.institution_id, r.work_date,
         r.status_type_id AS stamped_status,
         (a.before_state->>'status_type_id')::uuid AS original_status
    FROM public.hr_attendance_audit_log a
    JOIN public.hr_attendance_records r ON r.id = a.attendance_record_id
    JOIN public.hr_attendance_status_types before_t
      ON before_t.id = (a.before_state->>'status_type_id')::uuid
    JOIN public.hr_attendance_status_types after_t
      ON after_t.id = (a.after_state->>'status_type_id')::uuid
   WHERE a.action = 'recompute'
     AND before_t.code IN ('WEEKLY_OFF', 'HOLIDAY')
     AND after_t.code  IN ('LEAVE', 'HALF_DAY')
     AND r.status_type_id = after_t.id
   ORDER BY r.id, a.created_at DESC;

  SELECT count(*) INTO v_restored FROM repair_rows;
  IF v_restored <> 11 THEN
    RAISE EXCEPTION
      'Expected 11 mis-stamped rows, found %. Re-run the analysis before applying this.',
      v_restored;
  END IF;

  -- 2. Open the two closed months so trg_har_block_locked_period permits the
  --    repair honestly. The original lock is restored verbatim in step 5.
  CREATE TEMP TABLE repair_locks ON COMMIT DROP AS
  SELECT id, locked_at, locked_by
    FROM public.hr_attendance_periods
   WHERE id IN (v_pharmacy, v_jicate) AND status = 'locked';

  IF (SELECT count(*) FROM repair_locks) <> 2 THEN
    RAISE EXCEPTION 'Pharmacy and Jicate August 2026 are not both closed. This repair assumes they are; stop and re-check.';
  END IF;

  UPDATE public.hr_attendance_periods
     SET status = 'open', locked_at = NULL, locked_by = NULL, updated_by = v_actor
   WHERE id IN (SELECT id FROM repair_locks);

  -- 3. Restore, with the same audit shape the stamps write.
  INSERT INTO public.hr_attendance_audit_log (
    attendance_record_id, employee_id, institution_id, actor_id, action,
    before_state, after_state, reason, created_at
  )
  SELECT x.record_id, x.employee_id, x.institution_id, v_actor, 'recompute',
         jsonb_build_object('status_type_id', x.stamped_status),
         jsonb_build_object('status_type_id', x.original_status, 'event_id', v_event_id),
         'Leave stamp removed from a week-off/holiday; evaluator verdict restored (migration 20260922060942)',
         now()
    FROM repair_rows x;

  UPDATE public.hr_attendance_records r
     SET status_type_id           = x.original_status,
         recomputed_from_event_id = v_event_id,
         updated_at               = now()
    FROM repair_rows x
   WHERE r.id = x.record_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 11 THEN
    RAISE EXCEPTION 'Restored % rows, expected 11. Rolled back.', v_rows;
  END IF;

  -- 4. Rebuild the frozen counts for both months from the records as they now
  --    stand — the same function the close runs.
  FOR v_period IN SELECT id FROM repair_locks LOOP
    v_rows := public.fn_hr_compute_attendance_period_summary(v_period.id);
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Recompute produced no summaries for period %. Rolled back.', v_period.id;
    END IF;
  END LOOP;

  -- 5. Restore the closes exactly as they were, and say what happened.
  UPDATE public.hr_attendance_periods p
     SET status     = 'locked',
         locked_at  = l.locked_at,
         locked_by  = l.locked_by,
         updated_by = v_actor,
         notes      = concat_ws(
           E'\n',
           nullif(p.notes, ''),
           'Recomputed ' || to_char(now(), 'DD Mon YYYY')
             || ': leave stamps removed from week-offs/holidays and the month standard re-derived'
             || ' (was MAX of per-staff working days). Original close preserved.'
             || ' Regenerate the salary register for this month.')
    FROM repair_locks l
   WHERE p.id = l.id;

  -- 6. Prove the outcome this whole migration exists for.
  SELECT working_days_count INTO v_basis FROM public.hr_attendance_periods WHERE id = v_pharmacy;
  IF v_basis <> 26 THEN
    RAISE EXCEPTION 'Pharmacy August 2026 standard is %, expected 26. Rolled back.', v_basis;
  END IF;

  -- Record-derived working days can only exceed the resolver's scheduled days
  -- when an off-day carries a working stamp — which is exactly what was just
  -- undone. Neither month has the biometric-on-a-holiday rows noted above.
  SELECT count(*) INTO v_left
    FROM public.hr_attendance_period_summaries
   WHERE period_id IN (v_pharmacy, v_jicate)
     AND (business_days IS NULL OR working_days > scheduled_days);
  IF v_left <> 0 THEN
    RAISE EXCEPTION '% summaries in the repaired months still over-count. Rolled back.', v_left;
  END IF;

  RAISE NOTICE 'Restored 11 rows; Pharmacy August basis now %.', v_basis;
END
$migration$;
