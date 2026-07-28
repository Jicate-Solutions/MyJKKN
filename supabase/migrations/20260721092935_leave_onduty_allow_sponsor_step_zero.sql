-- Allow current_step = 0 on leave_onduty_applications (sponsor-approval gate).
--
-- Background
-- ----------
-- 20260128_create_leave_onduty_system.sql defined:
--     CONSTRAINT valid_current_step CHECK (current_step >= 1)
-- which encoded the original assumption that the approval chain always starts
-- at the first academic approver (step_order = 1).
--
-- 20260411_add_onduty_sponsor_and_jkkn_categories.sql introduced a sponsor
-- pre-approval gate that uses `current_step = 0` to mean "waiting for sponsor";
-- the academic chain (HOD -> Principal) begins at step 1 once the sponsor
-- approves (see LeaveOndutyService.processSponsorApproval, which advances
-- 0 -> 1). That migration added the sponsor_approval_status constraint but
-- never relaxed valid_current_step.
--
-- Result: every sponsor-gated OnDuty application failed at INSERT with
--   new row for relation "leave_onduty_applications" violates check
--   constraint "valid_current_step"
-- The feature had a 100% failure rate from 2026-04-11 until this migration --
-- all 60 pre-existing rows sit at current_step = 1 with a NULL sponsor status,
-- i.e. not one sponsor-gated application was ever created.
--
-- Affected: 8 OnDuty sub-categories across 10 institutions (club_activities,
-- event, event_meeting, event_participation, event_planning, media_work,
-- solve_for_100, young_indians). Leave and non-sponsor OnDuty were unaffected.
--
-- Step 0 is safe for the academic chain: flow steps use step_order >= 1 and
-- approver surfacing keys off `application.current_step = step.step_order`, so
-- a step-0 application matches no academic approver and stays invisible to the
-- HOD until the sponsor advances it.
--
-- This is a constraint RELAXATION, so it cannot invalidate existing rows.

ALTER TABLE leave_onduty_applications
  DROP CONSTRAINT IF EXISTS valid_current_step;

ALTER TABLE leave_onduty_applications
  ADD CONSTRAINT valid_current_step CHECK (current_step >= 0);

COMMENT ON CONSTRAINT valid_current_step ON leave_onduty_applications IS
  'current_step >= 0. Step 0 = awaiting sponsor pre-approval; the academic approval chain starts at step 1.';
