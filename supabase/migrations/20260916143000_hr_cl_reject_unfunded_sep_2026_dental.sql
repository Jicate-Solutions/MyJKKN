-- ============================================================================
-- Reject Casual Leave requests that outrun the corrected Jun-Aug 2026 balance.
-- Created: 2026-09-16. Follow-up to 20260916141000 (Dental batch).
--
-- Checked all pending Sep 2026 CL requests among the 125 corrected Dental
-- staff (excludes Santhoshkumar K, Muthuswamy R, and the 3 unmatched names)
-- against fn_hr_leave_accrued_days as of each request's date. 11 exceed it:
--   Santhosh S (DCH016)         7 Sep (1 day)   used 5.5, accrued 4
--   Karkuzhali M (DCH019)       8 Sep (0.5 day) used 5.0, accrued 4
--   Gokulapriya S (DCH031)     12 Sep (1 day)   used 4.0, accrued 4
--   Maheshwari S (DCH032)      12 Sep (1 day)   used 4.0, accrued 4
--   Kalaranjeni N (DCH037)      2 Sep (2 days)  used 7.5, accrued 4
--   Nivethitha M (DCH038)      15 Sep (1 day)   used 6.0, accrued 4
--   Dhineshkumar T (DCH039)     5 Sep (1 day)   used 6.5, accrued 4
--   Indhumathi S (DCH068)       1 Sep (2 days)  used 9.5, accrued 4
--   Sruthi Srivaisnavi S.N (DCH074) 8 Sep (1 day) used 5.5, accrued 4
--   Hariharan M (DCH076)        3 Sep (1 day)   used 7.0, accrued 4
--   Malathi M (NOTDCH006)       1 Sep (1 day)   used 7.5, accrued 4
-- 2 others checked and left alone, fitting within accrual: Dhinesh Kumar C
-- (DCH013), Jagadesan N (DCH026). All 11 rejected are PENDING -- status-only
-- change.
-- ============================================================================

UPDATE public.hr_leave_applications
   SET status = 'rejected',
       rejection_reason =
         'Jun-Aug 2026 Casual Leave was corrected against payroll-verified '
         'figures; no balance remains for this request as of its date.',
       updated_at = now()
 WHERE id IN (
   'dec6c61b-3f43-454b-bb39-bb2769c7bf63', -- Santhosh S (DCH016), 7 Sep
   'b9952f48-e088-421d-ba39-602251246b22', -- Karkuzhali M (DCH019), 8 Sep
   'b5d563dd-73d8-4bdf-9644-45717e205d3f', -- Gokulapriya S (DCH031), 12 Sep
   'd1a7d662-eb44-443a-b166-02218e44f595', -- Maheshwari S (DCH032), 12 Sep
   'f0598e15-e185-4ae8-a589-c3ab00c6f7c5', -- Kalaranjeni N (DCH037), 2 Sep
   '259482ed-3f2a-489e-a649-e46ae8d3a6ad', -- Nivethitha M (DCH038), 15 Sep
   '4662aa83-f82a-4c33-ad24-4b64c40f6678', -- Dhineshkumar T (DCH039), 5 Sep
   '612bf656-2b59-48f1-94b0-5e65f1e547a7', -- Indhumathi S (DCH068), 1 Sep
   '744310fe-29bb-4df2-8909-2405a2d85bfa', -- Sruthi Srivaisnavi S.N (DCH074), 8 Sep
   'c8ddffba-f9af-466d-a7bd-b50b19e1f9bc', -- Hariharan M (DCH076), 3 Sep
   'e1c97fc8-31c0-4599-9ad7-70bd7efac258'  -- Malathi M (NOTDCH006), 1 Sep
 )
   AND leave_type_id = '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'
   AND status = 'pending';
