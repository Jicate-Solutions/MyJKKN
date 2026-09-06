-- LOW from the fourth review pass: the non-hourly rejection message was
-- inaccurate for request_count.
--
-- v_needs_duration is true whenever min_minutes or max_minutes is set, which is
-- correct — a per-request bound cannot be checked without a duration. But the
-- message said "% is limited by duration", which describes total_duration mode
-- and contradicts the contract that request_count accepts non-hourly rows. The
-- requirement is real; only the explanation was wrong. It now names the actual
-- reason, which differs between the two modes.
--
-- Everything else in that review pass was verified FALSE against production and
-- is recorded here so the next reader does not re-open it:
--
--   "a duration_type flip drops a sibling from the SUM, freeing budget" — the
--   trigger has fired on UPDATE OF duration_type since 20260722250000. Tested:
--     UPDATE ... SET duration_type='full' on an hourly sibling -> BLOCKED,
--     the row was unchanged.
--
--   "prerequisite migration 20260722250000 is not on main" — it is, via
--   PR #2285. The full chain 240000 / 250000 / 260000 / 270000 is present on
--   main; the PR note it misread said only that the THIRD-ROUND migration had
--   not landed, which this series closed.

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

  -- A duration is needed to cap total time, and equally to check a per-request
  -- bound. Under request_count with no bounds, length is irrelevant.
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
    -- Name the real reason. "Limited by duration" describes total_duration and
    -- reads as wrong under request_count, where the constraint is the
    -- per-request bound rather than a running total.
    IF lim.limit_mode = 'total_duration' THEN
      RAISE EXCEPTION
        '% is limited by total duration, so a request needs a start and end time.',
        v_name;
    ELSE
      RAISE EXCEPTION
        '% sets a minimum or maximum length per request, so a request needs a start and end time.',
        v_name;
    END IF;
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
