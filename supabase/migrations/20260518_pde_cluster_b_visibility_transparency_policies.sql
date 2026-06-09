-- =====================================================================
-- PDE Cluster B — Visibility & Transparency Policies (PR 2 of 5)
-- Date: 2026-05-18
-- =====================================================================
-- Seeds 4 platform_policies rows under the `pde.visibility.*` namespace.
-- These govern when learners see their Agency Index, how cohort comparisons
-- are scoped across the institution, how capability certifications are
-- treated as definitions evolve, and what each learner sees about their
-- own metrics (numeric score, percentile, audit trail).
--
-- Pattern: every governance decision = row in platform_policies. Director
-- edits via /pde/admin/policies/visibility UI → behavior changes on next
-- learner view. Zero deploys, zero developer round-trips.
--
-- Read at runtime via fn_get_policy('pde.visibility.<key>', institution_id).
-- Scope: global (institution overrides will come later via the same UI).
-- Idempotent: ON CONFLICT DO NOTHING against the existing unique index
-- uq_platform_policies_key_scope (policy_key, scope_type, scope_id).
-- =====================================================================

INSERT INTO platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  data_type,
  enum_options,
  description,
  validation_schema,
  is_system,
  is_active
) VALUES
  (
    'pde.visibility.agency_index_mode',
    'global',
    NULL,
    '"live"'::jsonb,
    'enum',
    '["live", "semester_end", "live_coarse"]'::jsonb,
    'Controls when learners see their Agency Index score. live=real-time with full audit trail. semester_end=score revealed only at semester close. live_coarse=traffic-light (on-track/attention/concerning) without precise numbers.',
    NULL,
    false,
    true
  ),
  (
    'pde.visibility.cohort_comparison_scope',
    'global',
    NULL,
    '"institution_wide"'::jsonb,
    'enum',
    '["institution_wide", "deans_only", "aggregated_only"]'::jsonb,
    'Who sees inter-college Agency Index comparisons. institution_wide=faculty + learners see per-college breakdowns. deans_only=only deans and Director. aggregated_only=no per-college breakdown anywhere internally.',
    NULL,
    false,
    true
  ),
  (
    'pde.visibility.capability_versioning_policy',
    'global',
    NULL,
    '{"mode": "grandfather_with_upgrade", "show_version_tag": true, "expire_after_years": null}'::jsonb,
    'object',
    NULL,
    'How to treat old capability certifications when definitions evolve. mode=grandfather_with_upgrade keeps old certs valid forever with version tag, offers optional re-demonstration. mode=auto_expire forces refresh after expire_after_years. mode=version_tag_only keeps certs valid forever with tag visible.',
    NULL,
    false,
    true
  ),
  (
    'pde.visibility.individual_metric_display',
    'global',
    NULL,
    '{"show_numeric_score": true, "show_percentile": true, "show_audit_trail": true}'::jsonb,
    'object',
    NULL,
    'What learners see about their own metrics. show_numeric_score=raw Agency Index 0-100. show_percentile=cohort percentile rank. show_audit_trail=full event log of modifications and blind acceptances.',
    NULL,
    false,
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Verification (SELECT only — safe against NOT NULL columns):
-- SELECT policy_key, scope_type, value FROM platform_policies
--   WHERE policy_key LIKE 'pde.visibility.%' ORDER BY policy_key;
-- Expected: 4 rows.
