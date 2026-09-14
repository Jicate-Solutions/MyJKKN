-- Compensatory off claims that pass their expiry undecided are rejected
-- automatically, and an expired claim can no longer be approved.
--
-- HR decision 2026-09-11. A claim's credit expires one calendar month after the
-- day worked (20260911170000). When nobody decides the claim in time, approving
-- it afterwards mints a credit that can never be booked -- 7 such claims sat in
-- Approvals -> Comp Off Claims the day this shipped. Now:
--   * fn_hr_comp_off_reject_expired_claims() rejects every pending claim whose
--     expires_on is before TODAY IN ASIA/KOLKATA, with a reason the claimant
--     sees in their ledger; pg_cron runs it nightly at 00:20 IST;
--   * trg_hcoc_block_expired_approval refuses pending -> approved on such a
--     claim, covering the gap between expiry and the next run. Rejecting it by
--     hand is still allowed.
-- No notification is sent -- a manual decision sends none either (HR's choice).
--
-- "Today" is IST, the convention of fn_deactivate_ended_timetables: a claim is
-- good THROUGH its expiry day and is rejected just after that IST midnight.
--
-- LOCKED MONTHS ARE SKIPPED, not forced. trg_hcoc_block_locked_period refuses
-- any update of a claim whose worked day sits in a closed attendance month --
-- a manual reject included -- and one such row would abort the whole batch.
-- Its predicate is mirrored below; skipped rows are counted in a NOTICE and stay
-- pending until HR reopens the month.

CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_reject_expired_claims()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_today   date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_count   integer;
  v_skipped integer;
BEGIN
  WITH locked AS (
    SELECT c.id
    FROM public.hr_comp_off_credits c
    JOIN public.staff s ON s.id = c.employee_id
    JOIN public.hr_attendance_periods ap
      ON ap.institution_id = s.institution_id
     AND ap.status = 'locked'
     AND make_date(ap.period_year, ap.period_month, 1) <= c.worked_date
     AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > c.worked_date
    WHERE c.status = 'pending' AND c.expires_on < v_today
  )
  UPDATE public.hr_comp_off_credits c
     SET status = 'rejected',
         approved_at = now(),
         rejection_reason = format(
           'Automatically rejected: not approved before the credit''s one-month expiry on %s.',
           to_char(c.expires_on, 'DD/MM/YYYY'))
   WHERE c.status = 'pending'
     AND c.expires_on < v_today
     AND c.id NOT IN (SELECT id FROM locked);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT count(*) INTO v_skipped
  FROM public.hr_comp_off_credits c
  WHERE c.status = 'pending' AND c.expires_on < v_today;

  IF v_count > 0 OR v_skipped > 0 THEN
    RAISE NOTICE 'fn_hr_comp_off_reject_expired_claims: rejected %, left pending in locked months %',
      v_count, v_skipped;
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_comp_off_reject_expired_claims() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_block_expired_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'pending'
     AND NEW.status = 'approved'
     AND NEW.expires_on < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION
      'This claim expired on %, so it can no longer be approved. It will be rejected automatically overnight.',
      to_char(NEW.expires_on, 'DD/MM/YYYY')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_trig_comp_off_block_expired_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hcoc_block_expired_approval ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_block_expired_approval
  BEFORE UPDATE OF status ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_comp_off_block_expired_approval();

-- Nightly at 00:20 IST (18:50 UTC), after deactivate-ended-timetables.
-- Unscheduled first so re-running this migration is idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('hr-comp-off-reject-expired-claims');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END;
$$;

SELECT cron.schedule(
  'hr-comp-off-reject-expired-claims',
  '50 18 * * *',
  $$ SELECT public.fn_hr_comp_off_reject_expired_claims(); $$
);

-- Clear the backlog now rather than waiting for tonight.
SELECT public.fn_hr_comp_off_reject_expired_claims();
