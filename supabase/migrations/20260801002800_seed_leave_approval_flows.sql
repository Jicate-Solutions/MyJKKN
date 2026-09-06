-- ─── Phase 2 — seed leave approval flows ────────────────────────────────────
-- 2026-07-21 (applied via MCP as `seed_leave_approval_flows`)
--
-- WHY. hr_approval_flows held 26 rows, ALL of them flow_for='recruitment_approval'.
-- Zero leave flows existed, so LeaveService.buildApprovalChain() had nothing to
-- build from and threw "No approval flow configured" on every submission —
-- the third hard block on leave, behind the RLS tenancy gate and the
-- hr_employees identity break. (The query itself was also reading five columns
-- that do not exist on this table; fixed in the same change.)
--
-- SHAPE. One catch-all flow per hr_organization: empty `conditions`, so it
-- applies to every staff leave type. buildApprovalChain prefers a flow whose
-- conditions name a specific leave_type_id and falls back to this, so HR can
-- add per-type overrides later without touching these rows.
--
-- WHY A SINGLE STEP. Per the approved routing decision (2026-07-21),
-- approval is PERMISSION-BASED and institution-scoped, not manager-based.
-- Manager routing is not implementable: hr_staff_details.reports_to_staff_id is
-- populated for 0 of 543 rows, and departments.head_of_department_id for 0 of
-- 79. Any multi-step hod -> principal chain seeded today would resolve to
-- nobody and strand applications exactly as the learner-side flows did (54 of
-- 60 stuck with zero approver rows).
--
-- So: one step, approver_user_id null, approver_role a semantic marker rather
-- than a profiles.role lookup. Authorization is enforced where it actually
-- lives —
--   * RLS hla_update requires user_has_permission('hr.leave.approve') AND the
--     row's org to be in fn_my_hr_organization_ids()
--   * LeaveService.assertCanDecide() blocks self-approval, including for HR
--     staff who legitimately hold the approve key
-- and hr.leave.approve is deliberately narrow (5 of 75 roles).
--
-- WHEN THE ORG CHART LANDS: add steps with approver_user_id pinned to concrete
-- people. buildApprovalChain already carries that field through, and
-- assertCanDecide already enforces it when non-null. Do NOT seed role-name
-- steps and hope runtime resolution finds someone — that is precisely the
-- failure mode documented for the learner flows.
--
-- KNOWN GAP (not fixed here): the submit notification at
-- app/api/hr/leave/applications/route.ts resolves approvers via
-- `profiles.role = firstStep.approver_role` with NO institution filter — it
-- would notify every matching user group-wide. With approver_role set to
-- 'hr_approver' (not a real profiles.role value) it simply matches nobody, so
-- this seed does not trigger that bug. Fixing the notification to resolve by
-- permission + institution is separate work.
--
-- IDEMPOTENT: skips any organization that already has an active leave flow.

INSERT INTO public.hr_approval_flows
  (hr_organization_id, flow_for, flow_name, conditions, steps,
   is_active, escalate_after_hours)
SELECT
  o.id,
  'leave_approval',
  'Staff Leave — permission-based approval (default)',
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'step_type',            'final',
      'chain_order',          1,
      'approver_name',        'HR / Approving Authority',
      'approver_role',        'hr_approver',
      'approver_user_id',     NULL,
      'escalate_after_hours', 48
    )
  ),
  true,
  48
FROM public.hr_organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_approval_flows f
  WHERE f.hr_organization_id = o.id
    AND f.flow_for = 'leave_approval'
    AND f.is_active
);
