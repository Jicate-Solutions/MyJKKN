-- HR Compensatory Off — let the claimant withdraw their own PENDING claim.
--
-- THE GAP
-- -------
-- A claim is raised as status='pending' and then only HR can touch it:
--
--   hcoc_update USING (is_super_admin()
--                      OR (hr.leave.approve AND hr_organization_id IN fn_my_hr_organization_ids()))
--
-- So a member of staff who claimed the wrong worked day had no way to take it
-- back — they had to ask an approver to reject it, which records a rejection
-- against them for their own clerical slip. Leave and short time off already
-- have this: hla_update admits `employee_id IN fn_my_staff_ids()`, which is how
-- withdrawApplication() works today.
--
-- TWO CHANGES, BOTH NARROW
--
-- 1. 'withdrawn' joins the status CHECK. Not 'cancelled': leave already uses
--    withdrawn for "the applicant took it back before a decision" and cancelled
--    for "an approved one was undone afterwards". Reusing the same word for the
--    same act keeps one vocabulary across the module.
--
-- 2. An ADDITIVE policy, not an edit to hcoc_update. Policies for the same
--    command are OR'd, so widening the existing one would also loosen what an
--    approver may do. This one grants exactly: my own claim, currently pending,
--    becoming withdrawn — and nothing else. The WITH CHECK is what pins the new
--    value; USING alone would let the owner set any status they liked.
--
-- A withdrawn claim is NOT deleted. The row is the only record that the day was
-- ever claimed, and an expiring credit window is worth being able to audit.

ALTER TABLE public.hr_comp_off_credits
  DROP CONSTRAINT IF EXISTS hr_comp_off_credits_status_check;

ALTER TABLE public.hr_comp_off_credits
  ADD CONSTRAINT hr_comp_off_credits_status_check
  CHECK (status::text = ANY (ARRAY[
    'pending'::text, 'approved'::text, 'rejected'::text,
    'consumed'::text, 'withdrawn'::text
  ]));

DROP POLICY IF EXISTS hcoc_withdraw_own_pending ON public.hr_comp_off_credits;
CREATE POLICY hcoc_withdraw_own_pending ON public.hr_comp_off_credits
  FOR UPDATE
  USING (
    employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    AND status = 'pending'
  )
  WITH CHECK (
    employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    AND status = 'withdrawn'
  );

COMMENT ON POLICY hcoc_withdraw_own_pending ON public.hr_comp_off_credits IS
  'The claimant may take back their own claim while it is still pending. USING pins the old status, WITH CHECK pins the new one, so this grants withdrawal and nothing else.';
