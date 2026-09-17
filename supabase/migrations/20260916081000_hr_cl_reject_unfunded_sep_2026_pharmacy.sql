-- ============================================================================
-- Reject Casual Leave requests that outrun the corrected Jun-Aug 2026 balance.
-- Created: 2026-09-16. Follow-up to 20260916080000/20260916080500 (Pharmacy batch).
--
-- Checked all 23 pending Sep 2026 CL requests among the 57 corrected staff
-- against fn_hr_leave_accrued_days as of each request's own date (the same
-- check hr_trig_leave_enforce_balance would run). 6 exceed it:
--
--   COP001... no -- exact list below, each `used` already includes the
--   corrected Jun-Aug total, accrued is cumulative CL accrual by that date:
--     COP015 Rajkumar J      12 Sep (1 day)   used 4.5, accrued 4
--     COP016 Ramya G          8 Sep (1 day)   used 3.5, accrued 4  (3.5+1=4.5 > 4)
--     COP017 Janashree M      1 Sep (0.5 day) used 4.0, accrued 4  (4+0.5=4.5 > 4)
--     COP019 Senthil M       12 Sep (0.5 day) used 6.5, accrued 4
--     COP020 Thamaraiselvi K  7 Sep (1 day)   used 5.0, accrued 4
--     COP026 Deetchana N      3 Sep (1 day)   used 4.0, accrued 4  (4+1=5 > 4)
--
-- The other 17 pending Sep requests (across the same 57 people) still fit and
-- are left alone. All 6 are PENDING (never approved), so this is a status-only
-- change with no attendance side effect -- unlike an approved rejection.
-- ============================================================================

UPDATE public.hr_leave_applications
   SET status = 'rejected',
       rejection_reason =
         'Jun-Aug 2026 Casual Leave was corrected against payroll-verified '
         'figures; no balance remains for this request as of its date.',
       updated_at = now()
 WHERE id IN (
   'd718a49d-f83f-4144-8897-20eacb550a5a', -- COP015, 12 Sep
   '9327b6b1-21c3-4318-b5f5-0a11776ece50', -- COP016, 8 Sep
   'd4ebda22-c9f7-48a7-8304-97af32142709', -- COP017, 1 Sep
   'ee03f6c9-9112-42c9-8e65-d1b11424074b', -- COP019, 12 Sep
   'f66311f0-bc15-4ccb-b25c-197a7bdd5180', -- COP020, 7 Sep
   '4cf0d066-ce70-4995-9569-6aa209823a55'  -- COP026, 3 Sep
 )
   AND leave_type_id = '412b64fd-75ec-4d5a-abef-20a7bcda1331'
   AND status = 'pending';
