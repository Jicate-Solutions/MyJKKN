-- ============================================================================
-- Reject Casual Leave requests that outrun the corrected Jun-Aug 2026 balance.
-- Created: 2026-09-16. Follow-up to 20260916110000 (Main Office batch).
--
-- Checked all pending Sep 2026 CL requests (filtered to CL leave_type_id per
-- institution -- several other pending Sep requests on this staff are a
-- different, hourly-denominated leave type and irrelevant here) against
-- fn_hr_leave_accrued_days as of each request's date. 4 exceed it:
--   Ramesh S (NOTJIC001, Jicate)         5 Sep (1 day)  used 5.5, accrued 4
--   Radhakrishnan T (NOTJMO025, Main Off) 10 Sep (1 day) used 5.5, accrued 4
--   Gowrisankar M.N (NOTJMO051, Main Off) 12 Sep (1 day) used 4.0, accrued 4
--   Seerangan G (NOTJMO055, Main Off)     7 Sep (1 day)  used 3.5, accrued 4
-- 4 others fit and are left alone: Mohanraj D, Nithya R, Dhuraimurugan G,
-- Viswanathan S. All 4 rejected are PENDING -- status-only change.
-- ============================================================================

UPDATE public.hr_leave_applications
   SET status = 'rejected',
       rejection_reason =
         'Jun-Aug 2026 Casual Leave was corrected against payroll-verified '
         'figures; no balance remains for this request as of its date.',
       updated_at = now()
 WHERE id IN (
   '25637463-c562-439b-8d2b-9c130be75eef', -- Ramesh S, 5 Sep
   '63d6a717-d304-47cb-b861-ffb13d0e4b99', -- Radhakrishnan T, 10 Sep
   'eb09e0ce-6338-444b-bd42-bc4394420335', -- Gowrisankar M.N, 12 Sep
   '26e65c52-adae-40e4-b7dd-66cd671bc79b'  -- Seerangan G, 7 Sep
 )
   AND leave_type_id IN ('17e62724-e2f0-41bd-8dda-43a3a8d0c299', '1a5778c3-c974-455e-94e7-e7d40ecc0c68')
   AND status = 'pending';
