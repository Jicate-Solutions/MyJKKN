-- =====================================================================================
-- Remove the recruitment approvals viewer-scoping / role-match policy rows
-- (2026-07-06). The /hr/admin/recruitment-approvals-scope page and its engine
-- (resolveViewerScope + policy-toggled role-match in approveCandidate) were
-- removed from the codebase: the dynamic approval-flow builder
-- (/hr/admin/recruitment-approval-flows) is now the single source of truth,
-- and step-approver enforcement is always on (pinned user / role holders /
-- super-admin), driven by the frozen chain itself. RLS keeps bounding rows.
-- Reverses seeds 20260511110000 + 20260516120000.
-- =====================================================================================

DELETE FROM platform_policies
WHERE policy_key IN (
  'hr.recruitment.approvals.enforce_scoping',
  'hr.recruitment.approvals.scope_rules',
  'hr.recruitment.approvals.enforce_role_match',
  'hr.recruitment.approvals.override_roles'
);
