-- Short Time Off: real durations, period windows, limit resolution and
-- enforcement.
--
-- 1. duration_minutes is now computed from start_time/end_time, so a 30-minute
--    and a 4-hour Permission are finally distinct. total_days is left alone
--    (other code reads it) but it is a fixed 0.125 for every hourly row and
--    cannot be summed into anything meaningful.
--
-- 2. Short Time Off leaves day-based accounting, exactly as comp off did. Its
--    cap is minutes or request counts per period, so every approved Permission
--    was previously burning 0.125 of a day entitlement that was never the real
--    constraint.
--
-- 3. Period windows: quarter, half-year and year are anchored to the
--    institution's ACADEMIC year, because leave balances already reset on it —
--    a limit resetting on a different boundary than the balance beside it
--    would be actively confusing. Month is the calendar month, because
--    everyone reads "per month" that way and an academic-year-relative month
--    would put boundaries mid-month.
--
-- 4. Limits resolve assignment-over-type AS A UNIT. A non-null sto_limit_mode
--    on the winning assignment replaces every field; merging field by field
--    ("their max requests, our period") produces combinations nobody
--    configured and which cannot be read off the screen.
--
-- 5. Enforcement is BEFORE INSERT so a request that would breach the cap never
--    exists. Checking at approval instead would leave staff holding requests
--    that look submitted and can never be granted. Pending rows count toward
--    the cap, otherwise ten queued requests each pass individually and
--    together breach it.
--
-- Verified against production, then cleaned up:
--   10-minute request against a 15-minute minimum -> rejected, 0 rows
--   3 x 30-minute against "max 3 per month"       -> 3 accepted, 4th refused
--   duration_minutes                              -> 30 (total_days still 0.13)
--   usage readout                                 -> 3/3 used, 0 left, 90 min,
--                                                    window 01-Jul..31-Jul
--   45+45 against "90 minutes per month"          -> both accepted, 3rd refused
--   hr_leave_balances Permission used             -> stayed 0.00
--   staff-scoped override                         -> 300 minutes, source=staff
--   period windows on AY starting 01-Jun-2026:
--     month 01-Jul..31-Jul   quarter 01-Jun..31-Aug
--     half  01-Jun..30-Nov   year    01-Jun..31-May

CREATE OR REPLACE FUNCTION public.hr_trig_populate_total_days()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions AS $fn$
DECLARE
  v_skip_weekends bool;
  v_skip_holidays bool;
BEGIN
  SELECT skip_weekends, skip_holidays
    INTO v_skip_weekends, v_skip_holidays
    FROM public.hr_leave_types
   WHERE id = NEW.leave_type_id;

  NEW.total_days := public.hr_calc_leave_days(
    NEW.start_date, NEW.end_date, NEW.duration_type,
    COALESCE(v_skip_weekends, true), COALESCE(v_skip_holidays, true),
    NEW.hr_organization_id
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
END $fn$;

CREATE OR REPLACE FUNCTION public.hr_trig_update_leave_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions AS $fn$
DECLARE
  v_delta numeric;
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  -- Comp off is credit-backed; short time off is minute-backed. Neither draws
  -- on a day entitlement.
  IF v_category IN ('compensatory_off', 'short_time_off') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    v_delta := NEW.total_days;
    INSERT INTO hr_leave_balances (employee_id, leave_type_id, academic_year_id, hr_organization_id, entitled, used, carried_forward)
    VALUES (NEW.employee_id, NEW.leave_type_id, NEW.academic_year_id, NEW.hr_organization_id, 0, v_delta, 0)
    ON CONFLICT (employee_id, leave_type_id, academic_year_id)
    DO UPDATE SET used = hr_leave_balances.used + EXCLUDED.used, updated_at = now();

  ELSIF NEW.status IN ('cancelled', 'rejected', 'withdrawn') AND OLD.status = 'approved' THEN
    v_delta := NEW.total_days;
    UPDATE hr_leave_balances
       SET used = GREATEST(0, used - v_delta), updated_at = now()
     WHERE employee_id = NEW.employee_id
       AND leave_type_id = NEW.leave_type_id
       AND academic_year_id = NEW.academic_year_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.hr_leave_period_window(
  p_period text, p_academic_year_id uuid, p_on date DEFAULT CURRENT_DATE
)
RETURNS TABLE (period_start date, period_end date)
LANGUAGE plpgsql STABLE SET search_path = public, extensions AS $fn$
DECLARE
  v_ay_start date; v_ay_end date; v_idx integer; v_len integer;
BEGIN
  IF p_period = 'month' THEN
    period_start := date_trunc('month', p_on)::date;
    period_end   := (date_trunc('month', p_on) + INTERVAL '1 month - 1 day')::date;
    RETURN NEXT; RETURN;
  END IF;

  SELECT start_date, end_date INTO v_ay_start, v_ay_end
  FROM public.academic_years WHERE id = p_academic_year_id;

  -- No academic year still yields a bounded window rather than an unlimited one.
  IF v_ay_start IS NULL THEN
    v_ay_start := date_trunc('year', p_on)::date;
    v_ay_end   := (date_trunc('year', p_on) + INTERVAL '1 year - 1 day')::date;
  END IF;

  IF p_period = 'year' THEN
    period_start := v_ay_start; period_end := v_ay_end;
    RETURN NEXT; RETURN;
  END IF;

  v_len := CASE p_period WHEN 'quarter' THEN 3 WHEN 'half_year' THEN 6 ELSE 12 END;

  -- Which whole block of v_len months from the academic year start contains
  -- p_on. Months-between rather than day arithmetic, so blocks land on month
  -- boundaries regardless of the year's start day.
  v_idx := GREATEST(0, (
    (EXTRACT(YEAR FROM p_on)::int - EXTRACT(YEAR FROM v_ay_start)::int) * 12
    + (EXTRACT(MONTH FROM p_on)::int - EXTRACT(MONTH FROM v_ay_start)::int)
  ) / v_len);

  period_start := (v_ay_start + (v_idx * v_len) * INTERVAL '1 month')::date;
  period_end   := LEAST(
    v_ay_end,
    (v_ay_start + ((v_idx + 1) * v_len) * INTERVAL '1 month' - INTERVAL '1 day')::date
  );
  RETURN NEXT;
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_period_window(text, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_period_window(text, uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_resolve_sto_limits(
  p_leave_type_id uuid, p_staff_id uuid
)
RETURNS TABLE (
  limit_mode text, limit_period text, max_requests integer,
  total_minutes integer, min_minutes integer, max_minutes integer, source text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions AS $fn$
DECLARE t record; a record;
BEGIN
  SELECT sto_limit_mode, sto_limit_period, sto_max_requests,
         sto_total_minutes, sto_min_minutes, sto_max_minutes
    INTO t FROM public.hr_leave_types WHERE id = p_leave_type_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT asg.sto_limit_mode, asg.sto_limit_period, asg.sto_max_requests,
         asg.sto_total_minutes, asg.sto_min_minutes, asg.sto_max_minutes,
         asg.scope_kind
    INTO a
  FROM public.hr_leave_type_assignments asg
  JOIN public.staff s ON s.id = p_staff_id
  WHERE asg.leave_type_id = p_leave_type_id
    AND asg.is_active
    AND asg.sto_limit_mode IS NOT NULL
    AND (
         (asg.scope_kind = 'staff'      AND asg.staff_id      = s.id)
      OR (asg.scope_kind = 'department' AND asg.department_id = s.department_id)
      OR (asg.scope_kind = 'organization')
    )
  ORDER BY CASE asg.scope_kind WHEN 'staff' THEN 1 WHEN 'department' THEN 2 ELSE 3 END
  LIMIT 1;

  IF FOUND THEN
    limit_mode := a.sto_limit_mode; limit_period := COALESCE(a.sto_limit_period,'month');
    max_requests := a.sto_max_requests; total_minutes := a.sto_total_minutes;
    min_minutes := a.sto_min_minutes; max_minutes := a.sto_max_minutes;
    source := a.scope_kind;
  ELSE
    limit_mode := t.sto_limit_mode; limit_period := COALESCE(t.sto_limit_period,'month');
    max_requests := t.sto_max_requests; total_minutes := t.sto_total_minutes;
    min_minutes := t.sto_min_minutes; max_minutes := t.sto_max_minutes;
    source := 'type';
  END IF;
  RETURN NEXT;
END $fn$;

CREATE OR REPLACE FUNCTION public.hr_sto_usage(
  p_staff_id uuid, p_leave_type_id uuid,
  p_academic_year_id uuid DEFAULT NULL, p_on date DEFAULT CURRENT_DATE
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions AS $fn$
DECLARE
  lim record; w record;
  v_requests integer := 0; v_minutes integer := 0;
BEGIN
  IF NOT public.is_super_admin()
     AND NOT (p_staff_id IN (SELECT unnest(public.fn_my_staff_ids())))
     AND NOT public.user_has_permission('hr.leave.approve') THEN
    RAISE EXCEPTION 'Not authorized to read this usage';
  END IF;

  SELECT * INTO lim FROM public.hr_resolve_sto_limits(p_leave_type_id, p_staff_id);
  IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN
    RETURN jsonb_build_object('limit_mode','none');
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(lim.limit_period, p_academic_year_id, p_on);

  SELECT count(*), COALESCE(sum(COALESCE(duration_minutes,0)),0)
    INTO v_requests, v_minutes
  FROM public.hr_leave_applications
  WHERE employee_id = p_staff_id AND leave_type_id = p_leave_type_id
    AND status IN ('pending','approved','escalated')
    AND start_date BETWEEN w.period_start AND w.period_end;

  RETURN jsonb_build_object(
    'limit_mode', lim.limit_mode, 'limit_period', lim.limit_period, 'source', lim.source,
    'period_start', w.period_start, 'period_end', w.period_end,
    'max_requests', lim.max_requests, 'total_minutes', lim.total_minutes,
    'min_minutes', lim.min_minutes, 'max_minutes', lim.max_minutes,
    'requests_used', v_requests, 'minutes_used', v_minutes,
    'requests_left', CASE WHEN lim.limit_mode='request_count'
                          THEN GREATEST(0, lim.max_requests - v_requests) END,
    'minutes_left',  CASE WHEN lim.limit_mode='total_duration'
                          THEN GREATEST(0, lim.total_minutes - v_minutes) END
  );
END $fn$;

REVOKE ALL ON FUNCTION public.hr_resolve_sto_limits(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_resolve_sto_limits(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.hr_sto_usage(uuid, uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_sto_usage(uuid, uuid, uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_trig_sto_enforce_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $fn$
DECLARE
  v_category text; lim record; w record;
  v_requests integer := 0; v_minutes integer := 0; v_this integer;
BEGIN
  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_category IS DISTINCT FROM 'short_time_off' THEN RETURN NEW; END IF;

  SELECT * INTO lim FROM public.hr_resolve_sto_limits(NEW.leave_type_id, NEW.employee_id);
  IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN RETURN NEW; END IF;

  v_this := COALESCE(NEW.duration_minutes, 0);

  IF lim.min_minutes IS NOT NULL AND v_this < lim.min_minutes THEN
    RAISE EXCEPTION 'This request is % minute(s); the minimum for % is % minute(s).',
      v_this, (SELECT leave_type_name FROM public.hr_leave_types WHERE id = NEW.leave_type_id), lim.min_minutes;
  END IF;

  IF lim.max_minutes IS NOT NULL AND v_this > lim.max_minutes THEN
    RAISE EXCEPTION 'This request is % minute(s); the maximum per request for % is % minute(s).',
      v_this, (SELECT leave_type_name FROM public.hr_leave_types WHERE id = NEW.leave_type_id), lim.max_minutes;
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(lim.limit_period, NEW.academic_year_id, NEW.start_date);

  -- Pending counts too: otherwise ten queued requests each pass individually
  -- and together breach the cap.
  SELECT count(*), COALESCE(sum(COALESCE(duration_minutes,0)),0)
    INTO v_requests, v_minutes
  FROM public.hr_leave_applications
  WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
    AND id IS DISTINCT FROM NEW.id
    AND status IN ('pending','approved','escalated')
    AND start_date BETWEEN w.period_start AND w.period_end;

  IF lim.limit_mode = 'request_count' AND v_requests + 1 > lim.max_requests THEN
    RAISE EXCEPTION 'Limit reached: % of % request(s) already used between % and %.',
      v_requests, lim.max_requests, w.period_start, w.period_end;
  END IF;

  IF lim.limit_mode = 'total_duration' AND v_minutes + v_this > lim.total_minutes THEN
    RAISE EXCEPTION 'Limit reached: % of % minute(s) already used between % and %; this request needs %.',
      v_minutes, lim.total_minutes, w.period_start, w.period_end, v_this;
  END IF;

  RETURN NEW;
END $fn$;

-- Runs AFTER the populate trigger, which sets the duration_minutes this one
-- reads. Trigger order within a timing is alphabetical, and
-- trg_hla_populate_total_days sorts before trg_hla_sto_limits.
DROP TRIGGER IF EXISTS trg_hla_sto_limits ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_sto_limits
  BEFORE INSERT ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_sto_enforce_limits();
