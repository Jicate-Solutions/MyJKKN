-- Per-period cap for day-based leave — "max 2 Casual Leave days per month".
--
-- WHY THIS IS NEEDED AT ALL. hr_leave_types could express an ANNUAL entitlement
-- (default_entitled_days -> hr_leave_balances.entitled) and a SINGLE-REQUEST
-- length (max_continuous_days), but nothing in between. There was no way to say
-- "12 a year, but no more than 2 in any one month". The sto_* columns look like
-- the right tool and are not: hr_trig_sto_enforce_limits() returns early for any
-- request_category other than 'short_time_off', and Short Time Off accounts in
-- MINUTES while leave accounts in DAYS.
--
-- WHY THIS ENFORCES IN POSTGRES RATHER THAN IN LeaveService.applyForLeave.
-- Leave quota is currently checked only in the service layer, and that check has
-- already failed silently in production once — see the comment at
-- lib/services/hr/leave-service.ts:292-298, where a swallowed 22P02 left
-- `balance` undefined and `if (balance)` skipped the entire entitlement check.
-- That same `if (balance)` guard still means a member of staff with no
-- hr_leave_balances row has NO annual limit at all (214 of 736 active staff, at
-- the time of writing). A trigger has none of those failure modes: it cannot be
-- skipped by a missing row, a direct insert, or a future service refactor. It
-- also matches how Short Time Off is already enforced, so the two cannot drift.
--
-- WHAT IS DELIBERATELY REUSED. hr_leave_period_window() is taken unchanged from
-- the Short Time Off work. It already computes month / quarter / half_year /
-- year windows, already anchors the non-month periods to the academic year, and
-- already falls back to a bounded calendar window when an institution has no
-- academic year covering the date — which matters here, because JKKN Main Office
-- (103 staff) currently has none. One shared function means the leave cap and
-- the Short Time Off cap can never disagree about what "this month" is.
--
-- ATTRIBUTION. A request is counted wholly against the period containing its
-- start_date, exactly as Short Time Off does. Splitting a request's days across
-- a month boundary would be more precise but much harder to explain on screen,
-- and the error is bounded by max_continuous_days.

ALTER TABLE public.hr_leave_types
  ADD COLUMN IF NOT EXISTS leave_limit_period        varchar,
  ADD COLUMN IF NOT EXISTS leave_max_days_per_period numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_leave_types'::regclass
                   AND conname='hr_leave_types_leave_period_check') THEN
    ALTER TABLE public.hr_leave_types
      ADD CONSTRAINT hr_leave_types_leave_period_check
      CHECK (leave_limit_period IS NULL
             OR leave_limit_period IN ('month','quarter','half_year','year'));
  END IF;

  -- Half a rule is worse than none: a period with no cap never fires, and a cap
  -- with no period is never read. Same reasoning as hr_leave_types_sto_cap_present.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_leave_types'::regclass
                   AND conname='hr_leave_types_leave_cap_pair') THEN
    ALTER TABLE public.hr_leave_types
      ADD CONSTRAINT hr_leave_types_leave_cap_pair CHECK (
           (leave_limit_period IS NULL AND leave_max_days_per_period IS NULL)
        OR (leave_limit_period IS NOT NULL AND leave_max_days_per_period > 0)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.hr_leave_types.leave_limit_period IS
  'Period a day-based leave cap resets on: month | quarter | half_year | year. NULL means no per-period cap (the annual entitlement still applies). Ignored for short_time_off and compensatory_off.';
COMMENT ON COLUMN public.hr_leave_types.leave_max_days_per_period IS
  'Maximum days of this leave type that may be taken within one leave_limit_period. Counts half-days as 0.5, because it aggregates hr_calc_leave_days output.';

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_period_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  t record;
  w record;
  v_this numeric;
  v_used numeric := 0;
BEGIN
  -- A request leaving pending/approved/escalated is leaving the counted set and
  -- cannot breach anything. Checking it would make an over-cap row impossible to
  -- cancel — permanently stuck inside the total it exceeds. This is the same
  -- deadlock that 20260722260000 had to unpick for Short Time Off.
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

  -- Computed here, NEVER read from NEW.total_days. Two independent reasons:
  --   1. Trigger names sort alphabetically within a timing, and
  --      'trg_hla_leave_period_cap' precedes 'trg_hla_populate_total_days' —
  --      so on INSERT that column is still NULL when this runs.
  --   2. Nothing fires on a bare UPDATE OF total_days, so the stored value can
  --      be edited directly to poison the comparison.
  v_this := public.hr_calc_leave_days(
    NEW.start_date, NEW.end_date, NEW.duration_type,
    COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
    NEW.hr_organization_id
  );

  IF v_this > t.leave_max_days_per_period THEN
    RAISE EXCEPTION
      'This request is % day(s); the maximum per % for % is % day(s).',
      v_this, t.leave_limit_period, t.leave_type_name, t.leave_max_days_per_period;
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(
    t.leave_limit_period, NEW.academic_year_id, NEW.start_date);

  -- A missing window would make BETWEEN match nothing, the sum come back 0 and
  -- the cap silently stop applying. Fail loudly instead.
  IF w.period_start IS NULL OR w.period_end IS NULL THEN
    RAISE EXCEPTION 'Cannot determine the % period for this request; contact HR.',
      t.leave_limit_period;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text, 0)
  );

  -- Siblings recomputed from their own dates, for reason 2 above. Pending counts
  -- toward the cap, otherwise several queued requests each pass individually and
  -- together breach it.
  SELECT COALESCE(sum(
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id)
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
END $fn$;

-- Fires on UPDATE too: a pending request edited to a longer span, a different
-- date or a different type must be re-checked, and status is included so a
-- withdrawn row cannot be revived past the cap.
DROP TRIGGER IF EXISTS trg_hla_leave_period_cap ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_leave_period_cap
  BEFORE INSERT OR UPDATE OF start_date, end_date, duration_type,
                             leave_type_id, status
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_enforce_period_cap();

-- Readout for the apply drawer, mirroring hr_sto_usage(). It recomputes days
-- exactly the way the trigger does; a readout that disagreed with enforcement
-- would show a remaining figure that is not the one actually applied.
CREATE OR REPLACE FUNCTION public.hr_leave_period_usage(
  p_staff_id uuid,
  p_leave_type_id uuid,
  p_academic_year_id uuid DEFAULT NULL,
  p_on date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
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
    t.leave_limit_period, p_academic_year_id, p_on);

  -- Reported explicitly rather than as 'not limited': telling someone they are
  -- unlimited while the trigger refuses every submission is the worse lie.
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
             a.hr_organization_id)
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
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_period_usage(uuid, uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_period_usage(uuid, uuid, uuid, date) TO authenticated;
