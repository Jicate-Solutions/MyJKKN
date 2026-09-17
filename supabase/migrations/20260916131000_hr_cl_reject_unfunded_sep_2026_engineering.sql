-- ============================================================================
-- Reject Casual Leave requests that outrun the corrected Jun-Aug 2026 balance.
-- Created: 2026-09-16. Follow-up to 20260916130000 (Engineering batch).
--
-- Checked all pending Sep 2026 CL requests among the 47 corrected Engineering
-- staff (excludes the 16 unresolved outliers) against fn_hr_leave_accrued_days
-- as of each request's date. 6 exceed it, across 5 people:
--   Banumathi R (CET019)          7 Sep (1 day)  used 8.0, accrued 4
--   Muthulakshmi M (CET021)      12 Sep (1 day)  used 5.0, accrued 4
--   Mouniga G (CET052)           15 Sep (1 day)  used 4.0, accrued 4
--   Sneka P (NOTCET018)           7 Sep (1 day)  used 4.0, accrued 4
--   Muralidharan R.T (NOTCET024)  4 Sep (1 day)  used 4.0, accrued 4
--   Muralidharan R.T (NOTCET024) 11 Sep (1 day)  used 4.0, accrued 4
--     (both of Muralidharan's requests independently exceed the accrual on
--     their own, since neither had been approved yet)
-- 10 others checked and left alone, fitting within accrual: Ramya S, Akalya K
-- (x2), Shaanthanu K, Lavanya L, Mahendiran S, Kalaivani S, Revathi S,
-- Tamilan.K, Vinu V. All 6 rejected are PENDING -- status-only change.
-- ============================================================================

UPDATE public.hr_leave_applications
   SET status = 'rejected',
       rejection_reason =
         'Jun-Aug 2026 Casual Leave was corrected against payroll-verified '
         'figures; no balance remains for this request as of its date.',
       updated_at = now()
 WHERE id IN (
   '82a43ffb-d4af-4fe3-b6d7-580737662318', -- Banumathi R (CET019), 7 Sep
   '8ba574a7-4e7d-4ddd-8c6f-32b062ef756f', -- Muthulakshmi M (CET021), 12 Sep
   '4e40503e-d641-4406-8cbe-4e685addbd89', -- Mouniga G (CET052), 15 Sep
   'd45aa786-c60a-4df4-9183-225360c83eee', -- Sneka P (NOTCET018), 7 Sep
   '5ac5ed49-2e88-422f-a818-6edad2c8f4f0', -- Muralidharan R.T (NOTCET024), 4 Sep
   '73b0bafc-dd50-44ca-9b2a-37188d4ff9bd'  -- Muralidharan R.T (NOTCET024), 11 Sep
 )
   AND leave_type_id = 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'
   AND status = 'pending';
