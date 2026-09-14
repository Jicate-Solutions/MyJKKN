-- The leave balance guard charged LATER-dated leave against EARLIER accrual.
--
-- hr_trig_leave_enforce_balance measured accrual AS OF THE REQUEST'S START
-- DATE, then subtracted `used` and every other pending request for the WHOLE
-- year — including requests dated after it, which draw on accrual that does not
-- exist yet on that date. So an earlier request that fitted when it was filed
-- became unapprovable the moment a later one was filed.
--
-- Reported 2026-09-11 as "the CAO cannot approve Engineering Casual Leave".
-- Request b7b0cc8b (1 day, 01 Aug; staff joined 06 Jul, CL accrues monthly):
--   accrued by 01 Aug = 2 (Jul, Aug), taken = 1 (July), so 1 day free -- fits.
--   The guard also subtracted a 0.5-day request dated 07 Sep, which September's
--   accrual covers, and refused: "0.50 day(s) available ... needs 1".
-- Measured over the 129 pending day-leave requests: 19 were refused on approval,
-- 18 of them only for this reason. The 19th (Jicate, 18 Jul) is a genuine
-- shortfall and stays refused.
--
-- THE RULE NOW: at the request's start date AND at every later dated draw on
-- the same balance, everything consumed up to that date (this request included)
-- must fit within what has accrued by that date. That is the whole of what "no
-- lapse, accrues monthly" permits: no date may spend accrual it has not reached,
-- and no later request loses the days it was counting on.
--
-- Never stricter than the old check, by construction: at every checkpoint the
-- consumption counted is a subset of what the old check counted, and accrual
-- only grows with the date. Verified on the live data before applying: 0
-- requests newly refused.
--
-- `used` is one undated number, so it is placed in time the way
-- fn_hr_leave_monthly_ledger places it: month overrides at their month,
-- approved requests outside an overridden month at their start date, and the
-- remainder (the June 2026 legacy backfill, Adjust corrections) at the start of
-- the year. The remainder is NOT floored at zero here: the gate must keep the
-- total equal to `used`, which is the authority, or the never-stricter property
-- breaks on a row whose applications exceed it.
--
-- As a side effect this also stops an UPDATE of an already-APPROVED row from
-- counting that row twice (once inside `used`, once as the request itself).

CREATE OR REPLACE FUNCTION public.fn_hr_leave_balance_shortfall(
  p_employee_id         uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid,
  p_application_id      uuid,
  p_start_date          date,
  p_days                numeric
)
RETURNS TABLE(as_of date, available numeric, accrued numeric, taken numeric, pending numeric)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  t         record;
  v_carried numeric;
  v_used    numeric;
  v_opening numeric;
BEGIN
  SELECT skip_weekends, skip_holidays INTO t
  FROM public.hr_leave_types WHERE id = p_leave_type_id;

  SELECT COALESCE(b.carried_forward, 0), COALESCE(b.used, 0)
    INTO v_carried, v_used
  FROM public.hr_leave_balances b
  WHERE b.employee_id = p_employee_id
    AND b.leave_type_id = p_leave_type_id
    AND b.hr_academic_year_id = p_hr_academic_year_id;

  v_carried := COALESCE(v_carried, 0);
  v_used    := COALESCE(v_used, 0);

  -- The part of `used` no dated draw explains. Computed over ALL approved
  -- requests, this one included: if it is already approved its days are inside
  -- `used`, and excluding it here as well as below would count it twice.
  SELECT v_used - COALESCE(SUM(x.days), 0) INTO v_opening FROM (
    SELECT e.days
    FROM public.hr_leave_month_entries e
    WHERE e.employee_id = p_employee_id
      AND e.leave_type_id = p_leave_type_id
      AND e.hr_academic_year_id = p_hr_academic_year_id
    UNION ALL
    SELECT public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id, a.employee_id)
    FROM public.hr_leave_applications a
    WHERE a.employee_id = p_employee_id
      AND a.leave_type_id = p_leave_type_id
      AND a.hr_academic_year_id IS NOT DISTINCT FROM p_hr_academic_year_id
      AND a.status = 'approved'
      -- An override is the month's TOTAL; it absorbs that month's approvals.
      AND NOT EXISTS (
        SELECT 1 FROM public.hr_leave_month_entries e2
        WHERE e2.employee_id = p_employee_id
          AND e2.leave_type_id = p_leave_type_id
          AND e2.hr_academic_year_id = p_hr_academic_year_id
          AND e2.month_start = date_trunc('month', a.start_date)::date)
  ) x;

  RETURN QUERY
  WITH draws AS (
    SELECT e.month_start AS d, e.days, true AS is_taken
    FROM public.hr_leave_month_entries e
    WHERE e.employee_id = p_employee_id
      AND e.leave_type_id = p_leave_type_id
      AND e.hr_academic_year_id = p_hr_academic_year_id
    UNION ALL
    SELECT a.start_date,
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id, a.employee_id),
           a.status = 'approved'
    FROM public.hr_leave_applications a
    WHERE a.employee_id = p_employee_id
      AND a.leave_type_id = p_leave_type_id
      AND a.hr_academic_year_id IS NOT DISTINCT FROM p_hr_academic_year_id
      AND a.id IS DISTINCT FROM p_application_id
      AND a.status IN ('approved', 'pending', 'escalated')
      AND (a.status <> 'approved' OR NOT EXISTS (
            SELECT 1 FROM public.hr_leave_month_entries e2
            WHERE e2.employee_id = p_employee_id
              AND e2.leave_type_id = p_leave_type_id
              AND e2.hr_academic_year_id = p_hr_academic_year_id
              AND e2.month_start = date_trunc('month', a.start_date)::date))
  ),
  -- This request moves the running total at its own date and at every date
  -- after it; nothing before it can be affected by approving it.
  checkpoints AS (
    SELECT p_start_date AS c
    UNION
    SELECT dr.d FROM draws dr WHERE dr.d > p_start_date
  ),
  evaluated AS (
    SELECT cp.c,
           public.fn_hr_leave_accrued_days(
             p_employee_id, p_leave_type_id, p_hr_academic_year_id, cp.c) AS acc,
           v_opening + COALESCE(SUM(dr.days) FILTER (WHERE dr.is_taken AND dr.d <= cp.c), 0) AS tk,
           COALESCE(SUM(dr.days) FILTER (WHERE NOT dr.is_taken AND dr.d <= cp.c), 0) AS pd
    FROM checkpoints cp
    LEFT JOIN draws dr ON true
    GROUP BY cp.c
  )
  SELECT ev.c, ev.acc + v_carried - ev.tk - ev.pd, ev.acc, ev.tk, ev.pd
  FROM evaluated ev
  WHERE p_days > ev.acc + v_carried - ev.tk - ev.pd
  ORDER BY ev.c
  LIMIT 1;
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_balance_shortfall(uuid, uuid, uuid, uuid, date, numeric) IS
  'The first date on which p_days of day-leave starting p_start_date would not fit: consumption up to each checkpoint (this request, later dated draws) vs accrual by that date. No row = fits. Internal to hr_trig_leave_enforce_balance.';

-- Reads any employee's balance, so it is not a client surface. Supabase's
-- default privileges grant EXECUTE on new functions to anon and authenticated;
-- the SECURITY DEFINER trigger calls it as its owner and needs neither.
REVOKE ALL ON FUNCTION public.fn_hr_leave_balance_shortfall(uuid, uuid, uuid, uuid, date, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_balance_shortfall(uuid, uuid, uuid, uuid, date, numeric)
  TO service_role;

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  t       record;
  v_this  numeric;
  v_short record;
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category, leave_type_name, skip_weekends, skip_holidays
    INTO t
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  IF t.request_category IS DISTINCT FROM 'leave' THEN
    RETURN NEW;
  END IF;

  v_this := public.hr_calc_leave_days(
    NEW.start_date, NEW.end_date, NEW.duration_type,
    COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
    NEW.hr_organization_id, NEW.employee_id);

  -- Serialised per (employee, leave type) exactly as the period cap is, so two
  -- requests submitted at once cannot both read the same free balance.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text || ':bal', 0));

  SELECT * INTO v_short
  FROM public.fn_hr_leave_balance_shortfall(
    NEW.employee_id, NEW.leave_type_id, NEW.hr_academic_year_id,
    NEW.id, NEW.start_date, v_this);

  IF FOUND THEN
    RAISE EXCEPTION
      'Insufficient % balance as of %: % day(s) available (% accrued, % taken, % awaiting approval); this request needs %.',
      t.leave_type_name, to_char(v_short.as_of, 'DD Mon YYYY'),
      v_short.available, v_short.accrued, v_short.taken, v_short.pending, v_this
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.hr_trig_leave_enforce_balance() IS
  'Refuses a day-leave request that would not fit at its start date or at any later dated draw on the same balance (accrued by that date + carried - taken - pending up to that date). The database gate behind LeaveService''s friendly message.';
