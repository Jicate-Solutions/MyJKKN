-- ─── Let staff READ the leave approval flow that governs their application ──
-- 2026-07-21 (applied via MCP as `hr_approval_flows_leave_read`)
--
-- CAUGHT BY IMPERSONATION, not by reasoning. After seeding 14 leave flows in
-- 20260801002800, acting as a real staff member returned 0 visible flows:
--
--   SET LOCAL request.jwt.claims = '{"sub":"<staff profile>", ...}';
--   SELECT count(*) FROM hr_approval_flows
--    WHERE flow_for='leave_approval' AND hr_organization_id = <their org>;
--   -- 0
--
-- hr_approval_flows carries a single cmd=ALL policy gated on
-- auth_hr_organization_id(), which reads user_hr_access (1 row / 844 staff).
-- It is one of the 26 cmd=ALL HR policies deliberately left dormant by the
-- Phase 0b retrofit — but LeaveService.buildApprovalChain() reads this table
-- with the CALLER'S client, so leave submission depended on a table the
-- caller cannot see. It would have thrown "No leave approval flow is
-- configured for your organization" for every employee: a fourth hard block,
-- created by the decision to route around that cluster rather than fix it.
--
-- FIX: a narrow ADDITIVE permissive SELECT policy. Postgres ORs permissive
-- policies together, so this grants read without touching the existing cmd=ALL
-- policy or widening writes by a single row. Two constraints keep it tight:
--   * flow_for = 'leave_approval' only — the 26 recruitment_approval flows
--     stay invisible to ordinary staff (they carry candidate CTC approver
--     chains and pinned approver identities)
--   * organization scoped through fn_my_hr_organization_ids()
--
-- Read-only by construction: FOR SELECT, no WITH CHECK. The cmd=ALL policy
-- remains the only write path and remains dormant.

CREATE POLICY hr_approval_flows_leave_read
  ON public.hr_approval_flows
  FOR SELECT
  USING (
    flow_for = 'leave_approval'
    AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
  );
