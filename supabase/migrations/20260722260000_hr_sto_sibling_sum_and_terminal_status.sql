-- Second review round on Short Time Off enforcement.
--
-- HIGH — the sibling SUM trusted a column. The previous fix stopped trusting
-- NEW.duration_minutes and computed the incoming request's duration inline,
-- for exactly the reason stated there: "enforcement must not depend on a
-- column another trigger maintains". That reasoning was then not applied to
-- the OTHER rows in the window, which were still summed from the stored
-- duration_minutes. No trigger fires on a bare UPDATE OF duration_minutes, so
-- editing that column directly poisons the SUM and slips past a total_duration
-- cap. The aggregate now recomputes every counted row from its own
-- start_time/end_time.
--
-- MEDIUM — terminal transitions were locked out. The trigger fires BEFORE
-- UPDATE OF status and ran the full limit check unconditionally, so rejecting,
-- cancelling or withdrawing a request re-ran min/max/cap. If usage already sat
-- at or over the cap — say a type's maximum was lowered from 90 to 60 while a
-- 75-minute request was pending — the transition RAISEd and the row became
-- permanently stuck IN the counted set, unable to be cancelled out of it. A
-- request leaving the counted statuses can never breach a cap, so the check is
-- skipped entirely.
--
-- MEDIUM — a NULL period window silently disabled the cap. If
-- hr_leave_period_window returned no row the BETWEEN matched nothing, the
-- counts came back 0 and every request passed. Now raises instead.
--
-- LOW — a non-hourly short-time-off row fell through with v_this = 0, so it
-- contributed nothing to a total_duration cap and, under a minimum, was
-- rejected with the nonsensical "This request is 0 minute(s)". Now refused
-- with a message naming the real problem.
--
-- Not changed: the review suspected hr_sto_usage lacked a p_on parameter. It
-- has had one since 20260722240000 —
--   p_staff_id uuid, p_leave_type_id uuid, p_academic_year_id uuid, p_on date
--
-- Verified against production, then cleaned up:
--   set a sibling's duration_minutes to 1 by direct UPDATE (no trigger fires),
--     then submit a 60-minute request against a 90-minute cap
--                                              -> BLOCKED (recomputed 60+60)
--   lower the cap to 30 with a 60-minute row pending, then cancel it
--                                              -> cancellation SUCCEEDED

CREATE OR REPLACE FUNCTION public.hr_trig_sto_enforce_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_category text;
  lim  record;
  w    record;
  v_requests integer := 0;
  v_minutes  integer := 0;
  v_this     integer;
  v_name     text;
BEGIN
  -- A request leaving pending/approved/escalated is leaving the counted set,
  -- so it cannot breach anything. Checking it would make an over-cap row
  -- impossible to cancel — permanently stuck in the total it exceeds.
  IF NEW.status NOT IN ('pending','approved','escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category, leave_type_name INTO v_category, v_name
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_category IS DISTINCT FROM 'short_time_off' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO lim FROM public.hr_resolve_sto_limits(NEW.leave_type_id, NEW.employee_id);
  IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN
    RETURN NEW;
  END IF;

  -- Computed here, never read from NEW.duration_minutes: that column is
  -- maintained by a different trigger whose firing conditions are someone
  -- else's to change.
  IF NEW.duration_type = 'hourly'
     AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF NEW.end_time <= NEW.start_time THEN
      RAISE EXCEPTION 'End time must be after start time.';
    END IF;
    v_this := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::integer / 60;
  ELSE
    -- Previously fell through with 0, which contributed nothing to a duration
    -- cap and produced "This request is 0 minute(s)" under a minimum.
    RAISE EXCEPTION
      '% is limited by duration, so a request needs an hourly start and end time.',
      v_name;
  END IF;

  IF lim.min_minutes IS NOT NULL AND v_this < lim.min_minutes THEN
    RAISE EXCEPTION 'This request is % minute(s); the minimum for % is % minute(s).',
      v_this, v_name, lim.min_minutes;
  END IF;

  IF lim.max_minutes IS NOT NULL AND v_this > lim.max_minutes THEN
    RAISE EXCEPTION 'This request is % minute(s); the maximum per request for % is % minute(s).',
      v_this, v_name, lim.max_minutes;
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(lim.limit_period, NEW.academic_year_id, NEW.start_date);

  -- A missing window made BETWEEN match nothing, so every count came back 0
  -- and the cap silently stopped applying. Fail loudly instead.
  IF w.period_start IS NULL OR w.period_end IS NULL THEN
    RAISE EXCEPTION
      'Cannot determine the % period for this request; contact HR.', lim.limit_period;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text, 0)
  );

  -- Siblings are recomputed from their own times, NOT summed from the stored
  -- duration_minutes. Nothing fires on a bare UPDATE OF duration_minutes, so
  -- that column can be edited directly to poison this total.
  SELECT count(*),
         COALESCE(sum(
           CASE
             WHEN a.duration_type = 'hourly'
              AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
              AND a.end_time > a.start_time
             THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time))::integer / 60
             ELSE 0
           END
         ), 0)
    INTO v_requests, v_minutes
  FROM public.hr_leave_applications a
  WHERE a.employee_id   = NEW.employee_id
    AND a.leave_type_id = NEW.leave_type_id
    AND a.id IS DISTINCT FROM NEW.id
    AND a.status IN ('pending','approved','escalated')
    AND a.start_date BETWEEN w.period_start AND w.period_end;

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

-- hr_sto_usage must agree with enforcement, so it recomputes siblings the same
-- way. A readout that trusts a column the enforcer distrusts would show a
-- different remaining figure than the one actually applied.
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
  IF w.period_start IS NULL THEN
    RETURN jsonb_build_object('limit_mode','none');
  END IF;

  SELECT count(*),
         COALESCE(sum(
           CASE
             WHEN a.duration_type = 'hourly'
              AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
              AND a.end_time > a.start_time
             THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time))::integer / 60
             ELSE 0
           END
         ), 0)
    INTO v_requests, v_minutes
  FROM public.hr_leave_applications a
  WHERE a.employee_id = p_staff_id AND a.leave_type_id = p_leave_type_id
    AND a.status IN ('pending','approved','escalated')
    AND a.start_date BETWEEN w.period_start AND w.period_end;

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

REVOKE ALL ON FUNCTION public.hr_sto_usage(uuid, uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_sto_usage(uuid, uuid, uuid, date) TO authenticated;
