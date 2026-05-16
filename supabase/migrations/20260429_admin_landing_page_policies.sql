-- ============================================================================
-- Admin Landing Page Policies — Director's standing rule (2026-04-29)
-- "Every policy decision = config-table row + super_admin UI."
--
-- Purpose
-- -------
-- Convert 3 hardcoded admin landing-page redirects (currently `redirect(...)`
-- calls inside server components) into platform_policies-driven values that
-- super_admins can re-target via /admin/landing-pages UI (Agent K's PR) —
-- zero deploy needed.
--
-- Routes affected
--   * /admin/         → reads nav.admin.default_landing     (was '/admin/bug-reports')
--   * /admin/lti/     → reads nav.admin.lti.default_landing (was '/admin/lti/launches')
--   * /admin/pde/     → reads nav.admin.pde.default_landing (was '/admin/pde/assessments')
--
-- Substrate-extending: reuses platform_policies (PR #595, Phase 1.5a) +
-- fn_get_policy_text(p_key, p_default, p_scope_id) resolver. No new tables.
--
-- Behavior at deploy = identical to pre-migration: each page.tsx passes the
-- pre-existing redirect target as `p_default`, so the redirect path doesn't
-- change until a super_admin edits the row through the UI.
--
-- See:
--   * memory/feedback_policy_decisions_must_be_config_rows.md
--   * PR feat/admin-landing-pages-crud-policy
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Seed 3 policy rows (scope_type='global', data_type='string')
-- ---------------------------------------------------------------------------
-- platform_policies.data_type CHECK allows: number | string | boolean | array | object | enum.
-- Plain URL paths are stored as JSON strings → use 'string'.
--
-- Note: platform_policies unique constraint is a partial unique index
-- (uq_platform_policies_key_scope) over
-- (policy_key, scope_type, COALESCE(scope_id, '00000...'::uuid)).
-- ON CONFLICT must reference matching column expressions, not constraint name.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system) VALUES
  (
    'nav.admin.default_landing',
    'global',
    NULL,
    '"/admin/bug-reports"'::jsonb,
    'Default redirect target when user navigates to /admin/. Tweakable via /admin/landing-pages UI — no deploy needed.',
    'string',
    false
  ),
  (
    'nav.admin.lti.default_landing',
    'global',
    NULL,
    '"/admin/lti/launches"'::jsonb,
    'Default redirect target when user navigates to /admin/lti/. Tweakable via /admin/landing-pages UI — no deploy needed.',
    'string',
    false
  ),
  (
    'nav.admin.pde.default_landing',
    'global',
    NULL,
    '"/admin/pde/assessments"'::jsonb,
    'Default redirect target when user navigates to /admin/pde/. Tweakable via /admin/landing-pages UI — no deploy needed.',
    'string',
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
    'nav.admin.default_landing',
    'nav.admin.lti.default_landing',
    'nav.admin.pde.default_landing'
  )
    AND scope_type = 'global'
    AND scope_id IS NULL;

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 admin landing policy rows, found %', v_count;
  END IF;

  -- Functional smoke test: fn_get_policy_text resolves each key correctly
  IF fn_get_policy_text('nav.admin.default_landing', '/fallback', NULL) <> '/admin/bug-reports' THEN
    RAISE EXCEPTION 'fn_get_policy_text failed for nav.admin.default_landing';
  END IF;
  IF fn_get_policy_text('nav.admin.lti.default_landing', '/fallback', NULL) <> '/admin/lti/launches' THEN
    RAISE EXCEPTION 'fn_get_policy_text failed for nav.admin.lti.default_landing';
  END IF;
  IF fn_get_policy_text('nav.admin.pde.default_landing', '/fallback', NULL) <> '/admin/pde/assessments' THEN
    RAISE EXCEPTION 'fn_get_policy_text failed for nav.admin.pde.default_landing';
  END IF;
END
$$;
