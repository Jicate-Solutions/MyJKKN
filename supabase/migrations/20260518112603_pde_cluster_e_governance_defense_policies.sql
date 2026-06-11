-- =====================================================================
-- PDE Cluster E — Gamification & Defense Policies (PR 5 of 5)
-- Date: 2026-05-18
-- =====================================================================
-- Seeds 4 platform_policies rows under the `pde.governance.*` namespace.
-- These govern how the Principal Development Engine (PDE) defends itself
-- against gaming, handles 360-degree feedback identity, responds to
-- year-1 placement signals, and brands the 7-category framework publicly.
--
-- Pattern: every governance decision = row in platform_policies. Director
-- edits via /pde/admin/policies/governance UI → behavior changes on next
-- reporting cycle. Zero deploys, zero developer round-trips.
--
-- Read at runtime via fn_get_policy('pde.governance.<key>', institution_id).
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
    'pde.governance.agency_gaming_defense',
    'global',
    NULL,
    '{"mode": "judgment_of_judgment_audit", "audit_sample_rate": 0.1}'::jsonb,
    'object',
    NULL,
    'Defense against gaming the Agency Index. mode=judgment_of_judgment_audit: faculty periodically audits modification quality (sample rate 0-1). mode=relative_percentile: score is rank within cohort. mode=rotating_metrics: optimization target moves annually.',
    '{"type": "object", "required": ["mode", "audit_sample_rate"], "properties": {"mode": {"enum": ["judgment_of_judgment_audit", "relative_percentile", "rotating_metrics"]}, "audit_sample_rate": {"type": "number", "min": 0, "max": 1}}}'::jsonb,
    false,
    true
  ),
  (
    'pde.governance.feedback_identity_policy',
    'global',
    NULL,
    '{"mode": "attributed_moderated", "moderator_role": "faculty"}'::jsonb,
    'object',
    NULL,
    'How 360-degree leadership feedback identity is handled in Phase 8. mode=attributed_moderated: attributed but faculty-reviewed before record. mode=fully_anonymous: maximum honesty, unverifiable. mode=fully_attributed: maximum accountability, self-censorship risk.',
    NULL,
    false,
    true
  ),
  (
    'pde.governance.placement_signal_response',
    'global',
    NULL,
    '"active_briefing"'::jsonb,
    'enum',
    '["active_briefing", "wait_2_cycles", "scope_reduction"]'::jsonb,
    'How to respond to year-1 PDE-graduate placement signal. active_briefing=Director outreach to 30-50 recruiters, treat as recognition investment. wait_2_cycles=patience, employer recognition lags 18-24mo. scope_reduction=if placement same/lower than peers, pull back PDE scope.',
    NULL,
    false,
    true
  ),
  (
    'pde.governance.framework_branding',
    'global',
    NULL,
    '"attribution_and_claim"'::jsonb,
    'enum',
    '["attribution_and_claim", "cite_only", "original_synthesis"]'::jsonb,
    'How to publicly attribute the 7-category framework. attribution_and_claim=Synthesized at JKKN, drawing on Fink/OECD/NEP. cite_only=Cite Fink+OECD+NEP only, no JKKN claim. original_synthesis=Claim entirely as JKKN original (high scrutiny risk).',
    NULL,
    false,
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Verification (SELECT only — safe against NOT NULL columns):
-- SELECT policy_key, scope_type, value FROM platform_policies
--   WHERE policy_key LIKE 'pde.governance.%' ORDER BY policy_key;
-- Expected: 4 rows.
