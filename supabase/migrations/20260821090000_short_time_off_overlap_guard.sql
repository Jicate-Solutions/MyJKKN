-- HR Short Time Off — one permission per time slot.
--
-- THE GAP
-- -------
-- 09/07/2026 carried TWO approved "Permission (Hourly)" requests for the same
-- staff member, same date, both 09:05-09:35. 0.26 days deducted for one
-- 30-minute absence, and the day was stamped LEAVE twice.
--
-- hr_trig_sto_enforce_limits already governs short time off, but it counts and
-- sums; it has no concept of two requests occupying the same minutes. For
-- Permission (Hourly) the limits are total_duration 120 min/month, min 30,
-- max 60 — so two 30-minute requests are 60 of 120 and both passed cleanly.
--
-- WHY THIS SITS BEFORE THE LIMITS RESOLUTION
-- -------------------------------------------
-- The existing function returns early when a type has no limits configured:
--
--     IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN RETURN NEW;
--
-- Everything after that line is unreachable for such a type — including, today,
-- the `end_time <= start_time` sanity check. An overlap guard placed after it
-- would protect only the types that happen to have limits set. Both the window
-- sanity check and the overlap check are therefore moved ahead of it: they are
-- statements about whether the request is COHERENT, not about how much of an
-- allowance it consumes.
--
-- OVERLAP TEST: half-open intervals, `a.start < NEW.end AND NEW.start < a.end`.
-- Back-to-back slots (09:00-09:30 then 09:30-10:00) do NOT clash, which is the
-- intended reading — the second begins as the first ends.
--
-- The advisory lock is keyed on (employee, date) rather than the limits block's
-- (employee, leave_type): two concurrent inserts of DIFFERENT permission types
-- on the same morning must still serialise against each other. Both locks are
-- taken in the same order by every caller, so they cannot deadlock.
--
-- EXISTING ROWS ARE NOT TOUCHED. Two overlapping pairs exist today across two
-- staff members, both exact duplicates. A trigger cannot retro-reject them and
-- cancelling someone's approved request is not a migration's decision.

CREATE OR REPLACE FUNCTION public.hr_trig_sto_enforce_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_category text;
  lim  record;
  w    record;
  v_requests integer := 0;
  v_minutes  integer := 0;
  v_this     integer;
  v_name     text;
  v_needs_duration boolean;
  v_clash    record;
BEGIN
  IF NEW.status NOT IN ('pending','approved','escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category, leave_type_name INTO v_category, v_name
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_category IS DISTINCT FROM 'short_time_off' THEN
    RETURN NEW;
  END IF;

  -- ---- Coherence checks: every short-time-off request, limits or not -------
  IF NEW.duration_type = 'hourly'
     AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN

    IF NEW.end_time <= NEW.start_time THEN
      RAISE EXCEPTION 'End time must be after start time.';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.employee_id::text || ':sto:' || NEW.start_date::text, 0)
    );

    SELECT t2.leave_type_name AS type_name, a.start_time, a.end_time, a.status
      INTO v_clash
    FROM public.hr_leave_applications a
    JOIN public.hr_leave_types t2 ON t2.id = a.leave_type_id
    WHERE a.employee_id = NEW.employee_id
      AND a.id IS DISTINCT FROM NEW.id
      AND a.status IN ('pending','approved','escalated')
      AND t2.request_category = 'short_time_off'
      AND a.duration_type = 'hourly'
      AND a.start_date = NEW.start_date
      AND a.start_time IS NOT NULL
      AND a.end_time   IS NOT NULL
      AND a.start_time < NEW.end_time
      AND NEW.start_time < a.end_time
    ORDER BY a.start_time
    LIMIT 1;

    IF v_clash.type_name IS NOT NULL THEN
      RAISE EXCEPTION
        'This overlaps an existing % request on % — % to % (%). Cancel that one first, or pick a different slot.',
        v_clash.type_name,
        to_char(NEW.start_date, 'DD/MM/YYYY'),
        to_char(v_clash.start_time, 'HH24:MI'),
        to_char(v_clash.end_time, 'HH24:MI'),
        v_clash.status
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- ---- Allowance checks ----------------------------------------------------
  SELECT * INTO lim FROM public.hr_resolve_sto_limits(NEW.leave_type_id, NEW.employee_id);
  IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN
    RETURN NEW;
  END IF;

  v_needs_duration := lim.limit_mode = 'total_duration'
                      OR lim.min_minutes IS NOT NULL
                      OR lim.max_minutes IS NOT NULL;

  IF NEW.duration_type = 'hourly'
     AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    -- end > start is already guaranteed above; not re-raised here so there is
    -- one source of truth for that message.
    v_this := ROUND(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60.0)::integer;
  ELSIF v_needs_duration THEN
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

  SELECT * INTO w FROM public.hr_leave_period_window(
    lim.limit_period, NEW.hr_academic_year_id, NEW.start_date);
  IF w.period_start IS NULL OR w.period_end IS NULL THEN
    RAISE EXCEPTION
      'Cannot determine the % period for this request; contact HR.', lim.limit_period;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text, 0)
  );

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
END $function$;

COMMENT ON FUNCTION public.hr_trig_sto_enforce_limits() IS
  'Short time off gate. Coherence first (end > start, and no overlap with another live permission on the same date) so it applies even to types with no limits configured; then the per-period request-count / total-duration allowance.';
