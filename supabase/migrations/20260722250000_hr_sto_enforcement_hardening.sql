-- Harden Short Time Off enforcement. From the review on PR #2284.
--
-- HIGH — count-then-insert race. The trigger counted pending+approved rows and
-- then inserted, with no lock. Two concurrent submissions (a double-click, two
-- tabs) each read the count before the other committed, both passed, and the
-- cap this feature exists to enforce was breached. The comp-off consume
-- trigger already takes a per-employee advisory lock for exactly this reason;
-- this one did not.
--
-- MEDIUM — UPDATE bypassed enforcement entirely. The trigger was BEFORE INSERT
-- only, so editing a pending request's times to something longer was never
-- re-checked.
--
-- MEDIUM — and worse than the pure ordering concern that was raised:
-- trg_hla_populate_total_days fired on UPDATE OF start_date, end_date,
-- duration_type, leave_type_id — NOT start_time or end_time. Editing the times
-- of an existing row therefore left duration_minutes stale, whatever order the
-- triggers ran in. The enforce function now computes the duration ITSELF
-- rather than reading a value another trigger may or may not have refreshed,
-- and the populate trigger's column list is widened so the stored value stays
-- correct too.
--
-- LOW — GREATEST(0, end - start) silently turned an inverted window into 0
-- minutes, so a malformed request contributed nothing to a total-duration cap.
-- An inverted window is now rejected outright.
--
-- Verified against production, then cleaned up:
--   stretch a pending request past its 60-minute maximum -> blocked
--   set end_time before start_time                        -> blocked
--   legitimate edit 30 -> 45 minutes                      -> accepted,
--                                                            duration_minutes
--                                                            recomputed to 45
--   3rd request against "max 2 per month"                 -> refused

-- Recompute duration_minutes whenever the times themselves change.
DROP TRIGGER IF EXISTS trg_hla_populate_total_days ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_populate_total_days
  BEFORE INSERT OR UPDATE OF start_date, end_date, duration_type, leave_type_id,
                             start_time, end_time
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_populate_total_days();

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
  SELECT request_category, leave_type_name INTO v_category, v_name
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_category IS DISTINCT FROM 'short_time_off' THEN
    RETURN NEW;
  END IF;

  -- Computed here, NOT read from NEW.duration_minutes. That column is
  -- maintained by a different trigger whose firing conditions and ordering are
  -- someone else's to change; enforcement must not depend on either.
  IF NEW.duration_type = 'hourly'
     AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF NEW.end_time <= NEW.start_time THEN
      -- Previously clamped to 0 by GREATEST(), which let a malformed request
      -- contribute nothing to a total-duration cap.
      RAISE EXCEPTION 'End time must be after start time.';
    END IF;
    v_this := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::integer / 60;
  ELSE
    v_this := 0;
  END IF;

  SELECT * INTO lim FROM public.hr_resolve_sto_limits(NEW.leave_type_id, NEW.employee_id);
  IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN
    RETURN NEW;
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

  -- Serialise per (employee, type). Without this, two concurrent submissions
  -- both read the count below before either commits and both pass.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text, 0)
  );

  -- Pending counts too: otherwise ten queued requests each pass individually
  -- and together breach the cap.
  SELECT count(*), COALESCE(sum(COALESCE(duration_minutes,0)),0)
    INTO v_requests, v_minutes
  FROM public.hr_leave_applications
  WHERE employee_id   = NEW.employee_id
    AND leave_type_id = NEW.leave_type_id
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

-- Also on UPDATE: a pending request edited to a longer duration, a different
-- date, or a different type must be re-checked. Status is included so a
-- withdrawn row cannot be revived past the cap.
DROP TRIGGER IF EXISTS trg_hla_sto_limits ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_sto_limits
  BEFORE INSERT OR UPDATE OF start_time, end_time, start_date, end_date,
                             duration_type, leave_type_id, status
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_sto_enforce_limits();
