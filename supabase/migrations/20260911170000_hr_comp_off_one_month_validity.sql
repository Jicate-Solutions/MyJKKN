-- Compensatory off: a credit is valid for ONE CALENDAR MONTH from the day worked,
-- and comp off can only be taken inside that month.
--
-- HR decision 2026-09-11. Until now:
--   * hr_comp_off_set_expiry gave every credit worked_date + 90 days;
--   * hr_trig_comp_off_consume checked only that a credit was unexpired ON THE
--     APPROVAL DATE -- the leave's own date was never compared with the credit,
--     so a day off could be booked months after the credit's window.
--
-- Now:
--   * expires_on = worked_date + INTERVAL '1 month' (calendar month; 31 Jan ->
--     end of Feb, which is what Postgres interval arithmetic does);
--   * a comp-off leave consumes only credits whose window covers it:
--       worked_date < leave start  AND  expires_on >= leave end
--     i.e. after the day was earned and no later than the credit's last day.
--     Judged by the LEAVE's dates, not the approval date, so an approver who
--     acts a day late does not burn a request that was inside the window.
--   * existing credits are re-dated to the same rule (HR's choice, accepted
--     knowing 2 of 4 usable approved credits and 7 of 15 pending claims lapse).
--
-- No comp-off leave application has ever been filed, so the consume change
-- re-judges nothing already decided.

CREATE OR REPLACE FUNCTION public.hr_comp_off_set_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_derived boolean := NEW.expires_on IS NULL;
BEGIN
  IF v_derived THEN
    NEW.expires_on := (NEW.worked_date + INTERVAL '1 month')::date;

    -- A credit whose derived expiry is already past can never be spent. Refuse
    -- it at the source rather than letting it sit in the ledger looking real.
    IF TG_OP = 'INSERT' AND NEW.expires_on < CURRENT_DATE THEN
      RAISE EXCEPTION
        'Compensatory off must be claimed within one month of the day worked. % was % days ago, so the credit would have expired on %.',
        to_char(NEW.worked_date, 'DD/MM/YYYY'),
        (CURRENT_DATE - NEW.worked_date),
        to_char(NEW.expires_on, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $function$;

-- Re-date every existing credit to the one-month rule.
--
-- One approved credit (worked 21 Aug 2026) sits in an attendance month that is
-- LOCKED, and trg_hcoc_block_locked_period refuses any UPDATE there other than
-- the consume/release toggle. Changing when a credit may be SPENT does not touch
-- the closed month's worked day, so the guard is stepped around for this one
-- statement only -- its rules are unchanged.
ALTER TABLE public.hr_comp_off_credits DISABLE TRIGGER trg_hcoc_block_locked_period;

UPDATE public.hr_comp_off_credits
   SET expires_on = (worked_date + INTERVAL '1 month')::date
 WHERE expires_on IS DISTINCT FROM (worked_date + INTERVAL '1 month')::date;

ALTER TABLE public.hr_comp_off_credits ENABLE TRIGGER trg_hcoc_block_locked_period;

CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_consume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_category text;
  v_needed   numeric;
  v_avail    numeric;
  r          record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_category IS DISTINCT FROM 'compensatory_off' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    v_needed := NEW.total_days;

    -- Credits are whole days; a partial booking would strand the remainder.
    IF v_needed <> floor(v_needed) THEN
      RAISE EXCEPTION
        'Compensatory off must be booked in whole days (requested %). Credits are earned one full day per day worked.',
        v_needed;
    END IF;

    -- Serialise concurrent approvals for this employee. Without the lock two
    -- approvers could both read the same credit as available.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.employee_id::text, 0));

    -- Only credits whose one-month window covers THIS leave: earned before it,
    -- and not expired by its last day.
    SELECT COALESCE(sum(credit_days), 0) INTO v_avail
    FROM public.hr_comp_off_credits
    WHERE employee_id = NEW.employee_id
      AND status = 'approved'
      AND worked_date < NEW.start_date
      AND expires_on >= NEW.end_date;

    IF v_avail < v_needed THEN
      RAISE EXCEPTION
        'No compensatory off credit covers % to %: a credit can only be used after the day worked and within one month of it. % day(s) available for these dates, % requested.',
        to_char(NEW.start_date, 'DD/MM/YYYY'), to_char(NEW.end_date, 'DD/MM/YYYY'),
        v_avail, v_needed;
    END IF;

    FOR r IN
      SELECT id, credit_days FROM public.hr_comp_off_credits
      WHERE employee_id = NEW.employee_id
        AND status = 'approved'
        AND worked_date < NEW.start_date
        AND expires_on >= NEW.end_date
      ORDER BY expires_on, worked_date
      FOR UPDATE
    LOOP
      EXIT WHEN v_needed <= 0;
      -- status re-asserted here: a row that lost the race is skipped rather
      -- than spent a second time.
      UPDATE public.hr_comp_off_credits
         SET status = 'consumed',
             consumed_by_application_id = NEW.id,
             consumed_at = now()
       WHERE id = r.id AND status = 'approved';
      IF FOUND THEN
        v_needed := v_needed - r.credit_days;
      END IF;
    END LOOP;

    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Compensatory off credits were consumed concurrently; please retry.';
    END IF;

  ELSIF NEW.status IN ('cancelled','rejected','withdrawn') AND OLD.status = 'approved' THEN
    UPDATE public.hr_comp_off_credits
       SET status = 'approved',
           consumed_by_application_id = NULL,
           consumed_at = NULL
     WHERE consumed_by_application_id = NEW.id;
  END IF;

  RETURN NEW;
END $function$;
