-- ============================================================================
-- Analytics Engagement Query Limit Policy — Director's standing rule
-- "Every policy decision = config-table row + super_admin UI."
--
-- Purpose
-- -------
-- Convert hardcoded STUDENT_QUERY_LIMIT = 10000 (3 sites) and
-- AT_RISK_QUERY_LIMIT = 10000 (1 site) inside lib/services/analytics/
-- engagement-service.ts into a single platform_policies-driven runtime read.
--
-- Sites consolidated (all 4 share the same semantic — student-row fetch cap):
--   * EngagementService.getEngagementMetrics()      (line 202)
--   * EngagementService.getStudentEngagement()      (line 369)
--   * EngagementService.getAtRiskStudents()         (line 447)
--
-- Substrate-extending: reuses platform_policies (PR #595, Phase 1.5a) +
-- fn_get_policy(p_key, p_scope_id) resolver. No new tables.
--
-- Behavior at deploy = identical to pre-migration: each call site passes
-- 10000 as the in-code default, so the limit doesn't change until a
-- super_admin edits the row through the UI.
--
-- NOTE: SECTION_COMPARISON_LIMIT = 500 (line 543) is a DIFFERENT semantic
-- value (section-row cap, not student-row cap). It remains hardcoded and
-- will be migrated in a follow-up PR with its own seeded key.
--
-- This row is ALREADY SEEDED on prod (manual ops). This migration is the
-- documented, idempotent re-seed for staging/local + future prod restores.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Seed 1 policy row (scope_type='global', data_type='number')
-- ---------------------------------------------------------------------------
-- platform_policies unique constraint is a partial unique index
-- (uq_platform_policies_key_scope) over
-- (policy_key, scope_type, COALESCE(scope_id, '00000...'::uuid)).
-- ON CONFLICT must reference matching column expressions, not constraint name.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system) VALUES
  (
    'analytics.engagement.query_limit',
    'global',
    NULL,
    '10000'::jsonb,
    'Maximum number of student_engagement_scores rows fetched per query in EngagementService (getEngagementMetrics, getStudentEngagement, getAtRiskStudents). Tweakable via super_admin UI — no deploy needed.',
    'number',
    false
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verification: confirm seed row is present and resolver works
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INT;
  v_value INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM platform_policies
  WHERE policy_key = 'analytics.engagement.query_limit'
    AND scope_type = 'global'
    AND scope_id IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected 1 analytics.engagement.query_limit policy row, found %', v_count;
  END IF;

  -- Functional smoke test: fn_get_policy resolves the key correctly
  SELECT (fn_get_policy('analytics.engagement.query_limit', NULL))::int INTO v_value;
  IF v_value <> 10000 THEN
    RAISE EXCEPTION 'fn_get_policy returned % for analytics.engagement.query_limit (expected 10000)', v_value;
  END IF;
END
$$;
