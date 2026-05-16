-- ============================================================================
-- Migration: 20260429000014_permissions_audit_limits_policy
-- Phase 1.5a — Retire 4 hardcoded list-limit constants in permissions-audit
-- services as platform_policies rows.
-- ============================================================================
-- Replaces hardcoded constants in:
--   - lib/services/permissions-audit/compliance-report-service.ts
--       ORPHAN_LIST_LIMIT      = 25
--       MISMATCH_LIST_LIMIT    = 25
--       TOP_RLS_TABLES_LIMIT   = 10
--   - lib/services/permissions-audit/impact-preview-service.ts
--       AFFECTED_USERS_LIMIT   = 50
--
-- Director's standing rule (2026-04-29): every policy decision = config-table
-- row + super_admin UI. Tweakable without redeploying.
--
-- Idempotent: WHERE NOT EXISTS pattern. Safe to re-apply.
-- Already seeded on prod 2026-04-29; this migration is the source-controlled
-- record of those rows.
-- ============================================================================

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT
  'permissions_audit.orphan_list_limit',
  'global',
  NULL::uuid,
  '25'::jsonb,
  'Max number of orphan users (profiles with no user_roles row) listed in the Compliance Report PDF before truncation. Read by lib/services/permissions-audit/compliance-report-service.ts.',
  'number',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'permissions_audit.orphan_list_limit'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT
  'permissions_audit.mismatch_list_limit',
  'global',
  NULL::uuid,
  '25'::jsonb,
  'Max number of role mismatches (profiles.role differs from primary user_roles role_key) listed in the Compliance Report PDF before truncation.',
  'number',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'permissions_audit.mismatch_list_limit'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT
  'permissions_audit.top_rls_tables_limit',
  'global',
  NULL::uuid,
  '10'::jsonb,
  'Max number of "top tables by RLS policy count" listed in the Compliance Report PDF.',
  'number',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'permissions_audit.top_rls_tables_limit'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT
  'permissions_audit.impact_preview_affected_users_limit',
  'global',
  NULL::uuid,
  '50'::jsonb,
  'Max number of affected users returned by the role-edit impact preview before truncation. Read by lib/services/permissions-audit/impact-preview-service.ts.',
  'number',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'permissions_audit.impact_preview_affected_users_limit'
    AND scope_type = 'global'
    AND scope_id IS NULL
);
