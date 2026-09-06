-- Third review round on Short Time Off enforcement.
--
-- MEDIUM — the non-hourly rejection over-applied. The previous round started
-- refusing any short-time-off row without hourly start/end times, to stop it
-- contributing 0 to a duration cap. That reasoning only holds for the
-- duration-based mode: under request_count a row counts as ONE REQUEST and its
-- length is irrelevant, so the blanket rejection turned a previously valid
-- request into a hard error carrying an inaccurate message about duration. The
-- requirement is now tied to what actually needs a duration — total_duration
-- mode, or a min/max bound.
--
-- MEDIUM — the usage readout disagreed with the enforcer about a broken
-- window. Enforcement raises when the period cannot be resolved; hr_sto_usage
-- only checked period_start and returned limit_mode 'none', so the drawer said
-- "no usage limit configured" for a type whose submissions the database was
-- refusing. It now checks both bounds and reports window_unresolved instead of
-- dressing a blocked state up as an unlimited one.
--
-- LOW — the approver branch of hr_sto_usage read any p_staff_id with no tenant
-- term. Fourth appearance of this shape in this module; the rule remains that
-- a permission check alone is never a tenant boundary.
--
-- LOW — EXTRACT(EPOCH ...)::integer / 60 truncates, so times carrying seconds
-- undercounted and slightly under-applied the cap. Rounded to the nearest
-- minute, in the enforcer and the readout alike.
--
-- NOT changed — the review raised a HIGH claiming the sibling recompute merely
-- relocated the poison, since UPDATE ... SET end_time = start_time would
-- collapse a sibling to 0 and shrink the SUM. Tested against production; it is
-- not exploitable:
--   SET end_time = start_time      -> BLOCKED by the inverted-window check.
--                                     The trigger has covered UPDATE OF
--                                     start_time/end_time since 20260722250000.
--   shrink 60 -> 1 minute          -> allowed, and honest: the request really
--                                     is one minute now.
--   then submit 60 more (1+60<=90) -> accepted, correctly.
--   then re-expand to reclaim      -> BLOCKED (60+60 > 90).
-- The round trip fails, so the time cannot be taken back and the recorded
-- total stays truthful. An immutability constraint would break legitimate
-- edits to close a gap that is not open.
--
-- Verified after applying:
--   non-hourly row under request_count   -> ACCEPTED (regression fixed)
--   non-hourly row under total_duration  -> still refused

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
  v_needs_duration boolean;
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

  -- Only these actually need a duration. Under request_count a row counts as
  -- one request whatever its length.
  v_needs_duration := lim.limit_mode = 'total_duration'
                      OR lim.min_minutes IS NOT NULL
                      OR lim.max_minutes IS NOT NULL;

  -- Computed here, never read from NEW.duration_minutes: that column is
  -- maintained by a different trigger whose firing conditions are someone
  -- else's to change.
  IF NEW.duration_type = 'hourly'
     AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF NEW.end_time <= NEW.start_time THEN
      RAISE EXCEPTION 'End time must be after start time.';
    END IF;
    -- ROUND, not integer division: truncation undercounted times carrying
    -- seconds and under-applied the cap.
    v_this := ROUND(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60.0)::integer;
  ELSIF v_needs_duration THEN
    RAISE EXCEPTION
      '% is limited by duration, so a request needs a start and end time.', v_name;
  ELSE
    v_this := 0;
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
             THEN ROUND(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60.0)::integer
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
     AND NOT (
       public.user_has_permission('hr.leave.approve')
       AND EXISTS (
         SELECT 1 FROM public.staff s
         JOIN public.hr_organizations o ON o.institution_id = s.institution_id
         WHERE s.id = p_staff_id
           AND o.id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
       )
     ) THEN
    RAISE EXCEPTION 'Not authorized to read this usage';
  END IF;

  SELECT * INTO lim FROM public.hr_resolve_sto_limits(p_leave_type_id, p_staff_id);
  IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN
    RETURN jsonb_build_object('limit_mode','none');
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(lim.limit_period, p_academic_year_id, p_on);
  -- Both bounds, matching enforcement. Reporting 'none' for a window the
  -- enforcer refuses would tell the user they are unlimited while the database
  -- blocks every submission.
  IF w.period_start IS NULL OR w.period_end IS NULL THEN
    RETURN jsonb_build_object(
      'limit_mode', lim.limit_mode,
      'limit_period', lim.limit_period,
      'window_unresolved', true
    );
  END IF;

  SELECT count(*),
         COALESCE(sum(
           CASE
             WHEN a.duration_type = 'hourly'
              AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
              AND a.end_time > a.start_time
             THEN ROUND(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60.0)::integer
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
