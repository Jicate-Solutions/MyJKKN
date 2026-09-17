-- ============================================================================
-- Reject Casual Leave requests that outrun the corrected Jun-Aug 2026 balance.
-- Created: 2026-09-16. Follow-up to the Arts batch (20260916100100 + fixes).
--
-- Checked all pending Sep 2026 CL requests among the corrected Arts +
-- Main Office spillover staff against fn_hr_leave_accrued_days as of each
-- request's date. 6 exceed it:
--   Sasikala A.D (CAS002)      2 Sep (1 day)  used 4.0, accrued 4
--   Indhumathi M (CAS019)     12 Sep (1 day)  used 3.5, accrued 4 (3.5+1=4.5>4)
--   Jegadishkumar A (CAS023)   3 Sep (1 day)  used 4.0, accrued 4
--   Govindharaj S (CAS031)     2 Sep (2 days) used 4.0, accrued 4
--   Nandhini G (CAS053)        9 Sep (1 day)  used 2.5, accrued 4 (2.5+1(7 Sep,
--                              kept)+1(9 Sep) = 4.5>4 -- the 7 Sep one alone
--                              fits (2.5+1=3.5<=4), so 9 Sep is the one that
--                              doesn't)
--   Sathya S (CAS063)          4 Sep (1 day)  used 3.5, accrued 4 (3.5+1=4.5>4)
-- All are PENDING -- status-only change, no attendance side effect.
-- ============================================================================

UPDATE public.hr_leave_applications
   SET status = 'rejected',
       rejection_reason =
         'Jun-Aug 2026 Casual Leave was corrected against payroll-verified '
         'figures; no balance remains for this request as of its date.',
       updated_at = now()
 WHERE id IN (
   '4d40c895-d688-48d8-bc46-399cf6d17093', -- CAS002, 2 Sep
   '233dc41d-f5f0-40cd-832d-2ce7873b5aea', -- CAS019, 12 Sep
   '37ae6335-0876-40f3-b294-f81b943a5bd0', -- CAS023, 3 Sep
   'f738c4ae-45bb-4fae-a0c1-393b20d58685', -- CAS031, 2 Sep
   '1dc213bc-8bee-4df9-9f61-99122a927b6e', -- CAS053, 9 Sep
   '28079356-a2bd-4887-a4ef-cec9e289e776'  -- CAS063, 4 Sep
 )
   AND leave_type_id = 'f0143572-bb82-4fec-9367-9408d2b39911'
   AND status = 'pending';
