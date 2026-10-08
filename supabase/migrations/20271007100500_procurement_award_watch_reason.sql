-- Why a vendor on Watch (grade D, see lib/procurement/vendor-score.ts) was still chosen.
-- Written by the store keeper when sending the award for approval; shown to the approver.
ALTER TABLE public.procurement_rfqs ADD COLUMN IF NOT EXISTS award_watch_reason text;
COMMENT ON COLUMN public.procurement_rfqs.award_watch_reason IS
  'Reason given for awarding a Watch-grade vendor; shown on the final approval.';
