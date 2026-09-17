-- ============================================================================
-- Reject Casual Leave requests that outrun the corrected Jun-Aug 2026 balance.
-- Created: 2026-09-16. Follow-up to 20260916070100 (JKKN College of Education).
--
-- WHY
-- ---
-- 20260916070100 corrected Jun-Aug 2026 CL against payroll-verified figures.
-- For MISS. MONISHA A (staff_id NOTCOE001), that correction pushed `used` to
-- 6.5 days while accrual-to-date by 7 Sep 2026 is only 4
-- (fn_hr_leave_accrued_days = 4, confirmed). She still has one PENDING CL
-- request dated 7 Sep 2026 (0.5 day, second_half, id 12f7d04c-274f-4d92-a6a0-
-- 59fc1a5cfda8) left over from before the correction. Approving it would need
-- 7.0 days against 4 accrued -- there is no balance behind it, so per HR's
-- instruction it is rejected here rather than left to be caught (or silently
-- approved by a reviewer who is not carrying this context) later.
--
-- Rajendiran K M and Sambooranam M have no CL applications dated September
-- 2026 or later at all -- nothing else to reject in this batch.
--
-- SAFE AS A DIRECT UPDATE: this is a PENDING -> rejected transition, so
-- hr_trig_update_leave_balance's approved-> and ->approved branches both
-- early-return (neither matches OLD.status='pending') -- `used` is correctly
-- left untouched, since a pending request never added to it. September is not
-- a locked attendance period for this institution, so
-- hr_trig_block_leave_in_locked_period does not apply. No attendance was ever
-- stamped for a pending request, so there is nothing to un-stamp -- unlike an
-- approved->rejected transition, this has no attendance follow-up.
-- ============================================================================

UPDATE public.hr_leave_applications
   SET status = 'rejected',
       rejection_reason =
         'Jun-Aug 2026 Casual Leave was corrected against payroll-verified '
         'figures (used 6.5 of 4 days accrued by 7 Sep 2026) -- no balance '
         'remains for this request.',
       updated_at = now()
 WHERE id = '12f7d04c-274f-4d92-a6a0-59fc1a5cfda8'
   AND employee_id = 'd1160fe2-e7ab-4312-80d0-1d29cf688acf'
   AND leave_type_id = '913b2e58-83cf-4eae-8b26-8afa920bf373'
   AND status = 'pending';
