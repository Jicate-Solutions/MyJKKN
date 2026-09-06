-- One-time production reset: clear every staff leave and Short Time Off
-- application so the new group-wide STO policy (20260728000000 — 120 min per
-- month, 30–60 min per request) starts from an empty ledger.
--
-- WHY A RAW DELETE IS SAFE HERE, verified before running:
--
--   hr_leave_balances       used = 0.00 on all 5,496 rows. No leave application
--                           was ever approved (0 approved in category 'leave'),
--                           so no balance was ever decremented. This matters
--                           because NO TRIGGER ON hr_leave_applications FIRES ON
--                           DELETE — all six are INSERT/UPDATE only. Had any row
--                           been approved, its days would have stayed burnt into
--                           hr_leave_balances.used with no application left to
--                           explain them.
--   hr_leave_application_comments   0 rows (FK is ON DELETE CASCADE anyway).
--   hr_comp_off_credits             1 row, consumed_by_application_id already
--                                   NULL, so no credit needs releasing.
--   hr_attendance_records           0 rows with recomputed_from_event_id, and 0
--                                   matching hr_attendance_audit_log entries —
--                                   fn_recompute_attendance_on_leave_approval
--                                   never flipped a work day to LEAVE.
--
-- DELIBERATELY OUT OF SCOPE — these are learner/holiday data, not staff leave,
-- despite the similar names:
--   leave_onduty_applications  70 rows  learner on-duty (FKs to learners_profiles)
--   institution_leaves/leave_approvals  holiday calendar, not applications
--   pp_leave_requests           1 row
--   hostel_leave_requests       0 rows
--
-- The snapshot below is the undo. Restore with:
--   INSERT INTO public.hr_leave_applications
--   SELECT * FROM public.hr_leave_applications_backup_20260728;
-- Drop it once the fresh start is confirmed good.

CREATE TABLE IF NOT EXISTS public.hr_leave_applications_backup_20260728 AS
  SELECT * FROM public.hr_leave_applications;

COMMENT ON TABLE public.hr_leave_applications_backup_20260728 IS
  'Snapshot of hr_leave_applications taken 2026-07-28 immediately before the fresh-start purge. Safe to drop once the new Short Time Off policy is confirmed working.';

DELETE FROM public.hr_leave_applications;
