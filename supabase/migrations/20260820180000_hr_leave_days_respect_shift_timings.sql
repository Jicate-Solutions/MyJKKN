-- HR Leave — stop charging a two-day request as one.
--
-- THE BUG
-- -------
-- Casual Leave 17/07/2026 -> 18/07/2026 stored total_days = 1. 17 Jul is a
-- Friday, 18 Jul is a Saturday, and hr_calc_leave_days skipped it:
--
--     IF p_skip_weekends AND EXTRACT(ISODOW FROM cur) IN (6, 7) THEN NULL;
--
-- ISODOW 6 is Saturday. The rule was hardcoded to a Mon-Fri week that this
-- organisation does not work. hr_shift_timings — the table the attendance
-- engine has always used — says otherwise for every one of the 14 configured
-- institutions:
--
--     day_of_week 1..5  is_working_day = true
--     day_of_week 6     is_working_day = true   (Saturday IS a working day)
--                       second_saturday_holiday = true for 4 institutions only
--     day_of_week 7     is_working_day = false
--
-- So leave and attendance disagreed about what a non-working day is. Biometric
-- attendance marks a plain Saturday PRESENT/ABSENT off the configured timing,
-- while leave silently refused to charge for it. Measured on the current data:
-- 39 of 174 full-day applications were under-counted, 39 leave days in total.
-- All 39 were still pending, so no balance had consumed the wrong number — see
-- the backfill note at the bottom.
--
-- THE FIX
-- -------
-- Ask the same configuration the attendance engine asks, per staff member per
-- date, instead of guessing from the day number. That also makes the four
-- institutions with second_saturday_holiday correct for free — previously every
-- Saturday was skipped everywhere, so the distinction could not be expressed.
--
-- WHY NOT CALL fn_resolve_shift_timing DIRECTLY
-- ----------------------------------------------
-- It raises 42501 unless the caller is a super admin, an admin, the staff
-- member themselves, or holds hr.shift_timings.view. Calling it from a BEFORE
-- INSERT trigger would make leave submission depend on a shift-timing
-- permission — an HR officer applying on behalf of someone else would be
-- refused outright, and a service-role context (auth.uid() IS NULL) would fail
-- every time. hr_is_working_day below carries the same resolution with no
-- authorisation gate, which is safe because it returns a single boolean about
-- an institution's working calendar and nothing about the staff member.

-- ---------------------------------------------------------------------------
-- 1. Is this a working day for this staff member?
-- ---------------------------------------------------------------------------
-- Resolution copied from fn_resolve_shift_timing: same institution + ISO
-- day_of_week + effective window + staff_scope precedence (category beats
-- teaching/non_teaching), same second-Saturday rule (ISODOW 6 falling on day
-- 8..14 of the month).
--
-- Returns NULL — not false — when nothing is configured, so the caller can tell
-- "no rule" apart from "rest day" and pick its own fallback.
CREATE OR REPLACE FUNCTION public.hr_is_working_day(p_staff_id uuid, p_date date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_dow            smallint;
  v_second_sat     boolean;
  v_working        boolean;
BEGIN
  IF p_staff_id IS NULL OR p_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching
    INTO v_institution_id, v_category_id, v_is_teaching
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  SELECT CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false
              ELSE t.is_working_day END
    INTO v_working
  FROM public.hr_shift_timings t
  WHERE t.institution_id = v_institution_id
    AND t.day_of_week    = v_dow
    AND t.is_active
    AND t.effective_from <= p_date
    AND (t.effective_until IS NULL OR t.effective_until > p_date)
    AND (
         (t.staff_scope = 'category'     AND t.employment_category_id = v_category_id)
      OR (t.staff_scope = 'teaching'     AND v_is_teaching)
      OR (t.staff_scope = 'non_teaching' AND NOT v_is_teaching)
    )
  ORDER BY CASE t.staff_scope WHEN 'category' THEN 0 ELSE 1 END,
           t.effective_from DESC
  LIMIT 1;

  RETURN v_working;  -- NULL when no timing row matched
END;
$fn$;

REVOKE ALL ON FUNCTION public.hr_is_working_day(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_is_working_day(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_is_working_day(uuid, date) IS
  'Working-day lookup from hr_shift_timings for one staff member on one date, second-Saturday rule included. NULL when no timing is configured. Ungated on purpose — it returns a calendar boolean, not staff data — so leave calculation never depends on hr.shift_timings.view.';

-- ---------------------------------------------------------------------------
-- 2. hr_calc_leave_days learns who the leave is for.
-- ---------------------------------------------------------------------------
-- The signature gains p_employee_id. A defaulted 7th argument cannot simply be
-- added, because the existing 6-argument function would still match every
-- existing call and Postgres would report the pair as ambiguous — so the old
-- one is dropped first. DROP discards EXECUTE grants, hence the explicit
-- re-grant below.
DROP FUNCTION IF EXISTS public.hr_calc_leave_days(date, date, character varying, boolean, boolean, uuid);

CREATE FUNCTION public.hr_calc_leave_days(
  p_start          date,
  p_end            date,
  p_duration       character varying,
  p_skip_weekends  boolean,
  p_skip_holidays  boolean,
  p_hr_org         uuid,
  p_employee_id    uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  days_count numeric := 0;
  cur        date := p_start;
  inst_id    uuid;
  v_working  boolean;
BEGIN
  -- Resolve institution for holiday lookup
  SELECT institution_id INTO inst_id FROM hr_organizations WHERE id = p_hr_org;

  -- Fractional types return immediately (decision #5)
  IF p_duration = 'hourly' THEN RETURN 0.125; END IF;
  IF p_duration IN ('first_half', 'second_half') THEN RETURN 0.5; END IF;

  -- Full-day loop: iterate date range
  WHILE cur <= p_end LOOP
    v_working := NULL;
    IF p_skip_weekends THEN
      v_working := public.hr_is_working_day(p_employee_id, cur);
      IF v_working IS NULL THEN
        -- No configured timing, or no employee passed. Fall back to SUNDAY
        -- ONLY, not Sat+Sun: every institution that has been configured marks
        -- day_of_week 6 as a working day, so treating Saturday as rest would
        -- reintroduce the very bug this migration fixes for anyone whose
        -- timings are not set up yet.
        v_working := EXTRACT(ISODOW FROM cur) <> 7;
      END IF;
    END IF;

    IF p_skip_weekends AND NOT v_working THEN
      NULL;
    -- Skip institutional holidays (institution_leaves) OR global calendar holidays
    ELSIF p_skip_holidays AND (
      (inst_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM institution_leaves
        WHERE institution_id = inst_id
          AND cur BETWEEN start_date AND end_date
      ))
      OR EXISTS (
        SELECT 1 FROM calendar_entries ce
        WHERE ce.kind = 'holiday' AND ce.is_active = true AND ce.blocks_attendance = true
          AND cur BETWEEN ce.start_at::date AND ce.end_at::date
          AND (ce.scope_institution_ids IS NULL OR (inst_id IS NOT NULL AND inst_id = ANY(ce.scope_institution_ids)))
      )
    ) THEN
      NULL;
    ELSE
      days_count := days_count + 1;
    END IF;
    cur := cur + 1;
  END LOOP;

  RETURN days_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hr_calc_leave_days(date, date, character varying, boolean, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_calc_leave_days(date, date, character varying, boolean, boolean, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_calc_leave_days(date, date, character varying, boolean, boolean, uuid, uuid) IS
  'Chargeable days for a leave request. Weekends come from hr_shift_timings via hr_is_working_day when p_employee_id is given, so Saturday counts wherever the institution works it; Sunday-only fallback otherwise.';

-- ---------------------------------------------------------------------------
-- 3. Every caller now passes the employee. Without this the new parameter
--    defaults to NULL and the fallback silently applies to everyone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_populate_total_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_skip_weekends bool;
  v_skip_holidays bool;
BEGIN
  SELECT skip_weekends, skip_holidays
    INTO v_skip_weekends, v_skip_holidays
    FROM public.hr_leave_types
   WHERE id = NEW.leave_type_id;

  NEW.total_days := public.hr_calc_leave_days(
    NEW.start_date,
    NEW.end_date,
    NEW.duration_type,
    COALESCE(v_skip_weekends, true),
    COALESCE(v_skip_holidays, true),
    NEW.hr_organization_id,
    NEW.employee_id
  );

  -- Minutes only mean something for an hourly request with both bounds.
  IF NEW.duration_type = 'hourly'
     AND NEW.start_time IS NOT NULL
     AND NEW.end_time IS NOT NULL THEN
    NEW.duration_minutes :=
      GREATEST(0, EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::integer / 60);
  ELSE
    NEW.duration_minutes := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_period_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  t record;
  w record;
  v_this numeric;
  v_used numeric := 0;
BEGIN
  IF NEW.status NOT IN ('pending','approved','escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category, leave_type_name, leave_limit_period,
         leave_max_days_per_period, skip_weekends, skip_holidays
    INTO t
  FROM public.hr_leave_types
  WHERE id = NEW.leave_type_id;

  IF t.request_category IS DISTINCT FROM 'leave'
     OR t.leave_limit_period IS NULL THEN
    RETURN NEW;
  END IF;

  v_this := public.hr_calc_leave_days(
    NEW.start_date, NEW.end_date, NEW.duration_type,
    COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
    NEW.hr_organization_id, NEW.employee_id
  );

  IF v_this > t.leave_max_days_per_period THEN
    RAISE EXCEPTION
      'This request is % day(s); the maximum per % for % is % day(s).',
      v_this, t.leave_limit_period, t.leave_type_name, t.leave_max_days_per_period;
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(
    t.leave_limit_period, NEW.hr_academic_year_id, NEW.start_date);

  IF w.period_start IS NULL OR w.period_end IS NULL THEN
    RAISE EXCEPTION 'Cannot determine the % period for this request; contact HR.',
      t.leave_limit_period;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text, 0)
  );

  SELECT COALESCE(sum(
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id, a.employee_id)
         ), 0)
    INTO v_used
  FROM public.hr_leave_applications a
  WHERE a.employee_id   = NEW.employee_id
    AND a.leave_type_id = NEW.leave_type_id
    AND a.id IS DISTINCT FROM NEW.id
    AND a.status IN ('pending','approved','escalated')
    AND a.start_date BETWEEN w.period_start AND w.period_end;

  IF v_used + v_this > t.leave_max_days_per_period THEN
    RAISE EXCEPTION
      'Limit reached: % of % day(s) of % already used between % and %; this request needs %.',
      v_used, t.leave_max_days_per_period, t.leave_type_name,
      w.period_start, w.period_end, v_this;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_leave_period_usage(
  p_staff_id uuid,
  p_leave_type_id uuid,
  p_hr_academic_year_id uuid DEFAULT NULL::uuid,
  p_on date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  t record;
  w record;
  v_used numeric := 0;
BEGIN
  IF NOT public.is_super_admin()
     AND NOT (p_staff_id IN (SELECT unnest(public.fn_my_staff_ids())))
     AND NOT public.user_has_permission('hr.leave.approve') THEN
    RAISE EXCEPTION 'Not authorized to read this usage';
  END IF;

  SELECT request_category, leave_limit_period, leave_max_days_per_period,
         skip_weekends, skip_holidays
    INTO t
  FROM public.hr_leave_types
  WHERE id = p_leave_type_id;

  IF t.request_category IS DISTINCT FROM 'leave'
     OR t.leave_limit_period IS NULL THEN
    RETURN jsonb_build_object('limited', false);
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(
    t.leave_limit_period, p_hr_academic_year_id, p_on);

  IF w.period_start IS NULL THEN
    RETURN jsonb_build_object(
      'limited', true, 'window_unresolved', true,
      'limit_period', t.leave_limit_period,
      'max_days', t.leave_max_days_per_period);
  END IF;

  SELECT COALESCE(sum(
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id, a.employee_id)
         ), 0)
    INTO v_used
  FROM public.hr_leave_applications a
  WHERE a.employee_id   = p_staff_id
    AND a.leave_type_id = p_leave_type_id
    AND a.status IN ('pending','approved','escalated')
    AND a.start_date BETWEEN w.period_start AND w.period_end;

  RETURN jsonb_build_object(
    'limited',      true,
    'limit_period', t.leave_limit_period,
    'period_start', w.period_start,
    'period_end',   w.period_end,
    'max_days',     t.leave_max_days_per_period,
    'days_used',    v_used,
    'days_left',    GREATEST(0, t.leave_max_days_per_period - v_used)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.hr_trig_recompute_on_holiday_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_affected_start  date;
  v_affected_end    date;
  v_inst_id         uuid;
  v_app             RECORD;
  v_new_days        numeric;
  v_delta           numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_affected_start := OLD.start_date;
    v_affected_end   := OLD.end_date;
    v_inst_id        := OLD.institution_id;
  ELSE
    v_affected_start := LEAST(NEW.start_date, COALESCE(OLD.start_date, NEW.start_date));
    v_affected_end   := GREATEST(NEW.end_date, COALESCE(OLD.end_date, NEW.end_date));
    v_inst_id        := NEW.institution_id;
  END IF;

  FOR v_app IN
    SELECT hla.id, hla.employee_id, hla.leave_type_id, hla.hr_academic_year_id,
           hla.hr_organization_id, hla.start_date, hla.end_date,
           hla.duration_type, hla.total_days,
           hlt.skip_weekends, hlt.skip_holidays
      FROM hr_leave_applications hla
      JOIN hr_leave_types hlt ON hlt.id = hla.leave_type_id
      JOIN hr_organizations hro ON hro.id = hla.hr_organization_id
     WHERE hla.status = 'approved'
       AND hro.institution_id = v_inst_id
       AND hla.start_date <= v_affected_end
       AND hla.end_date   >= v_affected_start
       AND hlt.skip_holidays = true  -- only re-calc if type respects holidays
  LOOP
    v_new_days := hr_calc_leave_days(
      v_app.start_date, v_app.end_date, v_app.duration_type,
      v_app.skip_weekends, v_app.skip_holidays, v_app.hr_organization_id,
      v_app.employee_id
    );

    v_delta := v_new_days - v_app.total_days;

    IF v_delta != 0 THEN
      UPDATE hr_leave_applications
         SET total_days  = v_new_days,
             updated_at  = now()
       WHERE id = v_app.id;

      UPDATE hr_leave_balances
         SET used       = GREATEST(0, used + v_delta),
             updated_at = now()
       WHERE employee_id         = v_app.employee_id
         AND leave_type_id       = v_app.leave_type_id
         AND hr_academic_year_id = v_app.hr_academic_year_id;
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------------
-- 4. Existing rows: backfilled 2026-08-20, outside this migration.
-- ---------------------------------------------------------------------------
-- 39 pending applications carried an under-counted total_days, 39 days in
-- total, two of them stored as 0.00 (a leave taken entirely on a Saturday was
-- charged nothing at all). None were approved, so no hr_leave_balances row had
-- consumed the wrong number.
--
-- THE COLUMN NAMED IN SET MATTERS. Both triggers are UPDATE OF <columns>:
--
--   trg_hla_populate_total_days  BEFORE INSERT OR UPDATE OF start_date,
--       end_date, duration_type, leave_type_id, start_time, end_time
--   trg_hla_leave_period_cap     BEFORE INSERT OR UPDATE OF start_date,
--       end_date, duration_type, leave_type_id, status
--
-- updated_at is in neither list, so `SET updated_at = now()` bumps the column
-- and fires nothing — the first backfill attempt touched all 39 rows and
-- recomputed none of them. `SET start_date = start_date` does fire both, since
-- UPDATE OF triggers on a column being MENTIONED, not on its value changing.
--
-- Run row by row with the exception captured per row, so that a corrected total
-- breaking a per-period cap is reported rather than aborting the batch. All 39
-- succeeded with no cap violations; zero rows now disagree with the function.
