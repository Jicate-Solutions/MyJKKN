-- =====================================================================
-- PDE Cluster A — Scoring & Integrity Policies (PR 1 of 5)
-- Date: 2026-05-18
-- =====================================================================
-- Seeds 4 platform_policies rows under the `pde.scoring.*` namespace.
-- These govern how Principal Development Engine (PDE) demonstration gates
-- are scored, how peer bias is detected, how rubber-stamping faculty are
-- audited, and how AI-built deliverables are credited.
--
-- Pattern: every governance decision = row in platform_policies. Director
-- edits via /pde/admin/policies/scoring UI → behavior changes on next
-- demonstration submission. Zero deploys, zero developer round-trips.
--
-- Read at runtime via fn_get_policy('pde.scoring.<key>', institution_id).
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
  description,
  validation_schema,
  is_system,
  is_active
) VALUES
  (
    'pde.scoring.demonstration_weights',
    'global',
    NULL,
    '{"faculty": 50, "peer": 30, "ai": 20}'::jsonb,
    'object',
    'Demonstration gate scoring weights — three components must sum to 100. faculty=expert judgment, peer=cohort calibration, ai=technical correctness check.',
    '{"type": "object", "required": ["faculty", "peer", "ai"], "properties": {"faculty": {"type": "number", "min": 0, "max": 100}, "peer": {"type": "number", "min": 0, "max": 100}, "ai": {"type": "number", "min": 0, "max": 100}}}'::jsonb,
    false,
    true
  ),
  (
    'pde.scoring.peer_bias_detection_enabled',
    'global',
    NULL,
    'true'::jsonb,
    'boolean',
    'When true, system detects peer reviewers whose scores systematically diverge from cohort averages and flags them for human moderation. Recommended ON for Indian campus settings.',
    NULL,
    false,
    true
  ),
  (
    'pde.scoring.validator_audit_threshold',
    'global',
    NULL,
    '0.95'::jsonb,
    'number',
    'Faculty whose demonstration approval rate (0.0-1.0) exceeds this threshold are flagged for calibration audit. Default 0.95 = if faculty approves >95% of submissions with no rejections, system asks if they are rubber-stamping. Lower = stricter audit.',
    '{"type": "number", "min": 0, "max": 1}'::jsonb,
    false,
    true
  ),
  (
    'pde.scoring.ai_deliverable_credit_policy',
    'global',
    NULL,
    '{"mode": "full_credit_if_agency_proven", "min_agency_score": 60, "require_disclosure": false}'::jsonb,
    'object',
    'Policy for crediting student deliverables built with heavy AI use. mode options: full_credit_if_agency_proven | reduced_credit_proportional | disclosure_required_full_credit. min_agency_score is the Agency Index threshold (0-100) above which full credit applies in mode 1.',
    NULL,
    false,
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Verification (SELECT only — safe against NOT NULL columns):
-- SELECT policy_key, scope_type, value FROM platform_policies
--   WHERE policy_key LIKE 'pde.scoring.%' ORDER BY policy_key;
-- Expected: 4 rows.
