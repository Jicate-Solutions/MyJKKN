-- ============================================================================
-- Migration: 20260429000015_audit_faculty_page_size_policy
-- Phase 1.5a follow-up — retire 3 hardcoded page-size constants
-- ============================================================================
-- Director's standing rule (2026-04-29):
--   "Every policy decision = config-table row + super_admin UI."
--
-- Retires 3 hardcoded constants by seeding policy_keys consumed via
-- getPolicyInt() in the corresponding TS services:
--
--   * audit.discovery.max_page_size      = 100  (was MAX_PAGE_SIZE in
--       lib/services/audit/audit-discovery-service.ts)
--   * audit.discovery.default_page_size  = 100  (was DEFAULT_PAGE_SIZE in
--       same file)
--   * faculty.initiative.default_page_size = 20 (was DEFAULT_PAGE_SIZE in
--       lib/services/faculty-innovation/faculty-initiative-service.ts)
--
-- Substrate-extending: reuses platform_policies (PR #595, Phase 1.5a) +
-- fn_get_policy_int resolver. No new tables, no new functions.
--
-- Idempotent. Safe to re-apply (ON CONFLICT DO NOTHING).
--
-- Behavior at deploy = identical to pre-migration: each consumer passes
-- its previous hardcoded constant as the `defaultValue` arg to
-- getPolicyInt(...), so values don't change until a super_admin edits
-- the rows through future Policies UI.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Seed 3 policy rows (scope_type='global', data_type='number')
-- ---------------------------------------------------------------------------
-- platform_policies.data_type CHECK allows: number | string | boolean | array | object | enum.
-- ON CONFLICT must reference matching column expressions (the partial
-- unique index uq_platform_policies_key_scope), not constraint name.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system) VALUES
  (
    'audit.discovery.max_page_size',
    'global',
    NULL,
    '100'::jsonb,
    'Hard upper bound on page_size for AuditDiscoveryService.runQuery. Mirrored client-side + DB-side. Tweakable via super_admin Policies UI — no deploy needed.',
    'number',
    NULL,
    false
  ),
  (
    'audit.discovery.default_page_size',
    'global',
    NULL,
    '100'::jsonb,
    'Default page_size used by AuditDiscoveryService.runQuery when caller omits options.page_size. Tweakable via super_admin Policies UI — no deploy needed.',
    'number',
    NULL,
    false
  ),
  (
    'faculty.initiative.default_page_size',
    'global',
    NULL,
    '20'::jsonb,
    'Default page size for FacultyInitiativeService.list when caller omits filters.limit. Tweakable via super_admin Policies UI — no deploy needed.',
    'number',
    NULL,
    false
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verification: confirm seed rows are present and resolver works
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM platform_policies
  WHERE policy_key IN (
    'audit.discovery.max_page_size',
    'audit.discovery.default_page_size',
    'faculty.initiative.default_page_size'
  )
    AND scope_type = 'global'
    AND scope_id IS NULL;

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 page-size policy rows, found %', v_count;
  END IF;

  -- Functional smoke test: fn_get_policy_int resolves each key correctly
  IF fn_get_policy_int('audit.discovery.max_page_size', -1, NULL) <> 100 THEN
    RAISE EXCEPTION 'fn_get_policy_int failed for audit.discovery.max_page_size';
  END IF;
  IF fn_get_policy_int('audit.discovery.default_page_size', -1, NULL) <> 100 THEN
    RAISE EXCEPTION 'fn_get_policy_int failed for audit.discovery.default_page_size';
  END IF;
  IF fn_get_policy_int('faculty.initiative.default_page_size', -1, NULL) <> 20 THEN
    RAISE EXCEPTION 'fn_get_policy_int failed for faculty.initiative.default_page_size';
  END IF;
END
$$;
