-- ============================================================================
-- Migration: 20260511110000_seed_hr_recruitment_approvals_scope_policies
-- Adds 2 platform_policies rows so /hr/recruitment/approvals is scoped per
-- viewer (institution / department / hr_organization). TIER-0 safe-additive:
-- new rows only, no schema change, idempotent via ON CONFLICT.
-- ============================================================================
--
-- Context (2026-05-11):
--   Director surfaced that /hr/recruitment/approvals currently returns ALL
--   candidates to every viewer because lib/services/hr/recruitment-service.ts
--   listCandidates() applies institution_id / hr_organization_id filters
--   ONLY when explicitly passed by the caller. Auto-scoping by viewer's
--   institution / department / role didn't exist.
--
--   Directive: "every one of those policy decisions should be a row in a
--   config table and CRUDable that SQL functions READ at runtime, with a
--   super-admin UI that WRITES to the table. always director's view
--   (English consequences, visual cascade) for daily operation."
--
-- Approach (extends platform_policies — the canonical substrate from PR #595;
-- does NOT create a parallel hr_recruitment_scope_config table):
--
--   1. hr.recruitment.approvals.enforce_scoping (boolean, default FALSE)
--      Acts as the master toggle. When FALSE: listCandidates behaves
--      exactly as today (back-compat ship). When TRUE: scope filter
--      applies based on viewer's role + scope_rules.
--
--   2. hr.recruitment.approvals.scope_rules (object)
--      Per-role mapping. Keys are role_keys from custom_roles
--      (super_admin/admin/md/principal/coo/registrar/cao/hod/hr_officer).
--      Special key "_default" applies when viewer has no matching role
--      assignment. Values: { "scope": "all" | "institution" | "department"
--      | "hr_organization" | "self" }.
--
-- Sister PR (Agent B, parallel) builds the super-admin UI at
-- /admin/hr/recruitment-approvals-scope that edits these two keys with
-- English consequences (checkboxes/toggles, not raw JSONB).
-- ============================================================================

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system) VALUES
('hr.recruitment.approvals.enforce_scoping', 'global', NULL, 'false'::jsonb,
  'Master toggle for /hr/recruitment/approvals scoping. When ON: viewers see only candidates within their scope (institution / department / hr_organization) per hr.recruitment.approvals.scope_rules. When OFF (default): every approver sees the full queue. Toggle via /admin/hr/recruitment-approvals-scope.',
  'boolean', true),
('hr.recruitment.approvals.scope_rules', 'global', NULL,
  '{"super_admin":{"scope":"all"},"admin":{"scope":"all"},"md":{"scope":"all"},"principal":{"scope":"institution"},"coo":{"scope":"institution"},"registrar":{"scope":"institution"},"cao":{"scope":"institution"},"hod":{"scope":"department"},"hr_officer":{"scope":"hr_organization"},"_default":{"scope":"self"}}'::jsonb,
  'Per-role scope mapping for /hr/recruitment/approvals when enforce_scoping=true. Keys are role_keys from custom_roles. Special key "_default" applies when no role matches. Values: { "scope": "all" | "institution" | "department" | "hr_organization" | "self" }. Edit via /admin/hr/recruitment-approvals-scope.',
  'object', true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
