-- ============================================================================
-- Migration: 20260516120000_seed_recruitment_role_enforcement_policies
-- Adds 2 platform_policies rows that gate /api/hr/recruitment/candidates/[id]/approve
-- so only users whose role matches approval_chain[current_step].approver_role
-- can approve (with an override-roles list for break-glass admins).
-- TIER-0 safe-additive: new rows only, no schema change, idempotent via ON CONFLICT.
-- ============================================================================
--
-- Context (2026-05-16):
--   Today ANY user with permission hr.recruitment.approve can approve any chain
--   step regardless of whether their role matches approval_chain[current_step]
--   .approver_role. Director needs a flippable enforcement toggle plus an
--   always-allowed override list (super_administrator, administrator).
--
-- Approach (extends platform_policies — the canonical substrate; same shape as
-- the sister recruitment-approvals-scope policies seeded by
-- 20260511110000_seed_hr_recruitment_approvals_scope_policies.sql):
--
--   1. hr.recruitment.approvals.enforce_role_match (boolean, default FALSE)
--      Master toggle. When FALSE: approveCandidate behaves exactly as today
--      (back-compat ship). When TRUE: the calling user's role_keys must
--      contain approval_chain[current_step].approver_role OR overlap with
--      override_roles OR the caller must be super_admin (is_super_admin()).
--
--   2. hr.recruitment.approvals.override_roles (array of role_keys)
--      Always-allowed approvers. Members bypass the role-match check when
--      enforce_role_match=TRUE. Default ["super_administrator","administrator"].
--
-- Sister UI (this PR): /admin/hr/recruitment-approvals-scope adds a new
-- "Role Enforcement on Approve" section below the existing scope-rules UI.
-- ============================================================================

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system) VALUES
('hr.recruitment.approvals.enforce_role_match', 'global', NULL, 'false'::jsonb,
  'Master toggle for role-match enforcement on /api/hr/recruitment/candidates/[id]/approve. When ON: only users whose role matches approval_chain[current_step].approver_role can approve a chain step. Override roles in hr.recruitment.approvals.override_roles bypass this check. When OFF (default today): anyone with the hr.recruitment.approve permission can approve any step. Toggle via /admin/hr/recruitment-approvals-scope.',
  'boolean', true),
('hr.recruitment.approvals.override_roles', 'global', NULL,
  '["super_administrator","administrator"]'::jsonb,
  'Role keys that bypass enforce_role_match. Always-allowed approvers (admins / break-glass roles). Edit via /admin/hr/recruitment-approvals-scope.',
  'array', true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
