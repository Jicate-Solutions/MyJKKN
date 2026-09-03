-- Comp off: refuse to create a credit that is already expired.
--
-- REPORTED: the COO saw compensatory off credits in his ledger but Apply said
-- "0 credits available" and refused to submit.
--
-- CAUSE. Policy is 1 day earned per day worked, expiring 90 days after the
-- WORKED date (20260722150000, confirmed with the product owner). The claim
-- form guards only against a FUTURE worked date; nothing guards against one
-- that is already outside its own 90-day window. On 2026-08-21 the COO claimed
-- 2026-05-10 — 103 days earlier — and hr_comp_off_set_expiry dutifully stamped
-- expires_on = 2026-08-08, thirteen days in the past. The row was inserted
-- already dead: it shows on the Balance tab and counts toward `earned`, but
-- hr_comp_off_balance's `available` filter (expires_on >= CURRENT_DATE) can
-- never see it, and hr_trig_comp_off_consume can never spend it. Three such
-- rows exist across the group; one was approved on 2026-08-28, because the
-- approval queue renders "Would Expire" as ordinary text and gives the
-- approver nothing to notice.
--
-- FIX. The invariant is simply: a credit is never born dead. Enforced in the
-- same BEFORE trigger that derives the expiry, so it holds for every client,
-- not just the dialog that happens to ask nicely.
--
-- SCOPE — only when the expiry was DERIVED (the caller passed NULL). An
-- explicit expires_on stays the documented escape hatch for an HR backfill or
-- an hr_grant that deliberately carries its own dates; overriding it here would
-- turn a data-repair tool into an unusable one.
--
-- NOT CHANGED: approving a claim that lapsed WHILE pending. That credit is
-- equally worthless, but blocking the decision would strand the row in the
-- approver's queue forever with no way to clear it. The queue now flags those
-- rows instead, so the approver rejects them knowingly rather than minting a
-- dead credit by accident.
--
-- Existing born-dead rows are left in place: they are a truthful record of
-- what was claimed and decided, and deleting approved history to tidy a
-- balance is how ledgers stop being trustworthy.

CREATE OR REPLACE FUNCTION public.hr_comp_off_set_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_derived boolean := NEW.expires_on IS NULL;
BEGIN
  IF v_derived THEN
    NEW.expires_on := NEW.worked_date + INTERVAL '90 days';

    -- A credit whose derived expiry is already past can never be spent. Refuse
    -- it at the source rather than letting it sit in the ledger looking real.
    IF TG_OP = 'INSERT' AND NEW.expires_on < CURRENT_DATE THEN
      RAISE EXCEPTION
        'Compensatory off must be claimed within 90 days of the day worked. % was % days ago, so the credit would have expired on %.',
        to_char(NEW.worked_date, 'DD/MM/YYYY'),
        (CURRENT_DATE - NEW.worked_date),
        to_char(NEW.expires_on, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.hr_comp_off_set_expiry() IS
  'Derives expires_on = worked_date + 90 days when the caller leaves it NULL, and refuses an INSERT whose derived expiry is already in the past — such a credit could never be spent. An explicit expires_on bypasses both, for HR backfills and grants.';
