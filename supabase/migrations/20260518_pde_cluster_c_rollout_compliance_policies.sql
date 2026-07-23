-- =====================================================================
-- PDE Cluster C — Rollout & Compliance Policies (PR 3 of 5)
-- Date: 2026-05-18
-- =====================================================================
-- Seeds 4 platform_policies rows under the `pde.rollout.*` namespace.
-- These govern the institutional pace of PDE adoption, which durable-value
-- categories each college targets, how blocking HODs are escalated, and
-- which course tiers are eligible for PDE wrapping.
--
-- Pattern: every governance decision = row in platform_policies. Director
-- edits via /pde/admin/policies/rollout UI → behavior changes on next
-- coordinator onboarding cycle. Zero deploys, zero developer round-trips.
--
-- Read at runtime via fn_get_policy('pde.rollout.<key>', institution_id).
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
  enum_options,
  is_system,
  is_active
) VALUES
  (
    'pde.rollout.pace_cap_coordinators_per_60d',
    'global',
    NULL,
    '30'::jsonb,
    'number',
    'Maximum number of new course coordinators onboarded into PDE per 60-day window. Default 30 reflects current institutional capacity for white-glove support across 8 colleges. Lower for tighter pace, higher to accelerate.',
    '{"type": "number", "min": 1, "max": 500}'::jsonb,
    NULL,
    false,
    true
  ),
  (
    'pde.rollout.per_college_compliance_targets',
    'global',
    NULL,
    '{"medical": ["judgment", "embodied", "accountability", "credential"], "pharmacy": ["judgment", "embodied", "accountability", "credential"], "nursing": ["judgment", "embodied", "social_leadership", "credential"], "dental": ["judgment", "embodied", "accountability", "credential"], "engineering": ["judgment", "problem_finding", "accountability", "social_leadership", "credential"], "education": ["judgment", "social_leadership", "cultural_civic", "credential"], "arts_science": ["judgment", "problem_finding", "cultural_civic", "credential"], "default": ["judgment", "problem_finding", "accountability", "credential"]}'::jsonb,
    'object',
    'Which of the 7 durable-value categories each college targets for PDE compliance. medical/pharmacy/nursing/dental prioritize embodied (Phase 7). engineering prioritizes problem-finding + social_leadership. education + arts prioritize cultural_civic (Phase 9). All colleges target judgment + credential as baseline.',
    NULL,
    NULL,
    false,
    true
  ),
  (
    'pde.rollout.hod_blocking_escalation',
    'global',
    NULL,
    '"dean_kpi"'::jsonb,
    'enum',
    'How to handle an HOD who refuses PDE in their department. respect_no=wait for first-mover successes. bypass_hod_to_coordinator=work directly with willing coordinators. dean_kpi=make PDE adoption part of dean-level KPIs.',
    NULL,
    '["respect_no", "bypass_hod_to_coordinator", "dean_kpi"]'::jsonb,
    false,
    true
  ),
  (
    'pde.rollout.tier_eligibility',
    'global',
    NULL,
    '{"tier_1": "natural_fit_only", "tier_2": "after_tier_1_success", "tier_3": "not_eligible"}'::jsonb,
    'object',
    'Which course tiers are eligible for PDE wrapping. tier_1=capstones/projects/clinical/internships (natural fit). tier_2=mid-curriculum applied (after tier_1 success). tier_3=pure-theory or memorization (excluded — quest model degrades outcomes).',
    NULL,
    NULL,
    false,
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Verification (SELECT only — safe against NOT NULL columns):
-- SELECT policy_key, scope_type, value FROM platform_policies
--   WHERE policy_key LIKE 'pde.rollout.%' ORDER BY policy_key;
-- Expected: 4 rows.
