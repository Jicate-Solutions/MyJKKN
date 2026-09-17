-- ============================================================================
-- Reject Casual Leave requests that outrun the corrected Jun-Aug 2026 balance.
-- Created: 2026-09-16. Follow-up to 20260916090000 (Nursing batch).
--
-- Checked all pending Sep 2026 CL requests among the 21 corrected Nursing
-- staff against fn_hr_leave_accrued_days as of each request's own date. 5
-- exceed it:
--   CNR002 Arockiamary M  10 Sep (1 day)    used 4.5, accrued 4
--   CNR002 Arockiamary M  12 Sep (1 day)    used 4.5, accrued 4 (second pending)
--   CNR009 Renuka M       10 Sep (1 day)    used 3.5, accrued 4  (3.5+1=4.5 > 4)
--   CNR011 Dhanapriya S   10 Sep (0.5 day)  used 4.0, accrued 4  (4+0.5=4.5 > 4)
--   CNR016 Dharshini R     9 Sep (1 day)    used 3.5, accrued 4  (3.5+1=4.5 > 4)
--
-- All 5 are PENDING (never approved), so this is a status-only change with no
-- attendance side effect.
-- ============================================================================

UPDATE public.hr_leave_applications
   SET status = 'rejected',
       rejection_reason =
         'Jun-Aug 2026 Casual Leave was corrected against payroll-verified '
         'figures; no balance remains for this request as of its date.',
       updated_at = now()
 WHERE id IN (
   'a861b1dc-2c38-49f6-abc7-b87f34be7105', -- CNR002, 10 Sep
   'a2f990f1-9745-4d5a-a9ca-53841d74fdf6', -- CNR002, 12 Sep
   '76f7a722-ddf4-4d71-9d1b-c2e382eb8b1c', -- CNR009, 10 Sep
   '0f3be948-fbef-4bb2-8260-81c53d58a94b', -- CNR011, 10 Sep
   '37b8ff20-986b-4ac5-8ac3-ac07c154019c'  -- CNR016, 9 Sep
 )
   AND leave_type_id = '64e6a1b1-dfe5-4392-8abb-d780e31dfa70'
   AND status = 'pending';
