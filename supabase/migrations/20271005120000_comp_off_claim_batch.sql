-- Comp off: claim several individual worked days in one submission.
--
-- Each selected day stays its OWN hr_comp_off_credits row — its own expiry
-- (hr_comp_off_set_expiry: worked_date + 1 calendar month), its own biometric
-- check and its own approve / reject. claim_batch_id only ties together the
-- rows one submission inserted, so the approvals queue can show "Day 2 of 3"
-- and offer "approve all days". NULL for single-day claims, hr_grant and
-- attendance credits, and every row that existed before this.
--
-- RLS: unchanged. hcoc_insert_claim / hcoc_select / hcoc_update are row-level
-- and already enabled; grants on this table are table-level, so the new
-- column inherits them.

ALTER TABLE public.hr_comp_off_credits
  ADD COLUMN IF NOT EXISTS claim_batch_id uuid NULL;

COMMENT ON COLUMN public.hr_comp_off_credits.claim_batch_id IS
  'Shared by the credit rows of one multi-day claim submission; NULL for a single-day claim or a non-claim credit.';

CREATE INDEX IF NOT EXISTS idx_hr_comp_off_credits_claim_batch
  ON public.hr_comp_off_credits (claim_batch_id)
  WHERE claim_batch_id IS NOT NULL;
