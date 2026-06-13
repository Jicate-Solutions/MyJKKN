-- =====================================================================
-- PDE Cluster D — Quest & Supply Policies (PR 4 of 5)
-- Date: 2026-05-18
-- =====================================================================
-- Seeds 4 platform_policies rows under the `pde.quests.*` namespace.
-- These govern how PDE quests are sourced, classified by risk, who
-- supplies them, how contributors are compensated, and what happens
-- when a learner fails a real-world quest.
--
-- Pattern: every governance decision = row in platform_policies. Director
-- edits via /pde/admin/policies/quests UI → behavior changes on next
-- quest sourcing run. Zero deploys, zero developer round-trips.
--
-- Read at runtime via fn_get_policy('pde.quests.<key>', institution_id).
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
    'pde.quests.risk_tiers',
    'global',
    NULL,
    '{"enabled": true, "tiers": ["experimental", "production"], "default_tier": "experimental", "production_eligibility": "after_2_experimental_passes"}'::jsonb,
    'object',
    NULL,
    'Risk tier system for quest sourcing. experimental=learners can fail without department impact. production=must deliver, dept counting on it. Learners earn production eligibility after 2 successful experimental passes. Protects quest-supply trust pipeline with Solutions Departments.',
    NULL,
    false,
    true
  ),
  (
    'pde.quests.supply_sources',
    'global',
    NULL,
    '["internal_departments", "industry_partners", "alumni_led", "student_proposed"]'::jsonb,
    'array',
    NULL,
    'Active quest supply sources. internal_departments=44 JKKN Solutions Departments (30-40 quests/month cap). industry_partners=external companies. alumni_led=alumni-network problems. student_proposed=learner-curated, faculty-vetted. Multiple sources scale supply beyond internal cap.',
    NULL,
    false,
    true
  ),
  (
    'pde.quests.compensation_model',
    'global',
    NULL,
    '"reciprocal_credit"'::jsonb,
    'enum',
    '["voluntary_recognition", "reciprocal_credit", "honorarium_per_quest"]'::jsonb,
    'How quest contributors are compensated. voluntary_recognition=listed publicly only, no compensation. reciprocal_credit=contributors get priority access to PDE-graduate intern support. honorarium_per_quest=cash compensation per used quest (adds budget line).',
    NULL,
    false,
    true
  ),
  (
    'pde.quests.failed_quest_recovery',
    'global',
    NULL,
    '{"mode": "department_set_risk_tiers", "faculty_recovery_enabled": false}'::jsonb,
    'object',
    NULL,
    'What happens when a learner fails a real-world quest. mode=department_set_risk_tiers (default): production-tier quests require learner eligibility, experimental-tier accepts failure. faculty_recovery_enabled=faculty steps in to complete deliverable (preserves dept trust, costs faculty time).',
    NULL,
    false,
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Verification (SELECT only — safe against NOT NULL columns):
-- SELECT policy_key, scope_type, value FROM platform_policies
--   WHERE policy_key LIKE 'pde.quests.%' ORDER BY policy_key;
-- Expected: 4 rows.
