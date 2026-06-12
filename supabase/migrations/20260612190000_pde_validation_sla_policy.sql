-- ============================================================================
-- PDE validation SLA policy — connector PR 2 (validation SLA + latency
-- visibility). Spec: specs/pde-bos-outcome-connector-2026-06-11.md §9 +
-- CARE corrective move A (docs/modules/pde/2026-06-12-AUDIT-care-pde-demonstrations.md):
-- "Every submitted demonstration receives a validator note within 7 days."
--
-- Config-table pattern: the SLA is a policy row, tunable without deploy.
-- Read by PDEValidatorService.validationVisibilityStats via fn_get_policy_json.
-- ============================================================================

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active, classification, publication_state)
SELECT
  'pde.scoring.validation_sla_days', 'global', NULL,
  '7'::jsonb,
  'Days a submitted PDE demonstration may wait for first validator acknowledgment before it counts as an SLA breach (aging badge on /pde/admin/demonstrations + latency KPI). CARE audit 2026-06-12 corrective move A (A3 scored 1 — nothing bounded time-to-first-acknowledgment). Tune without deploy.',
  'number', true, true, 'major', 'published'
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'pde.scoring.validation_sla_days');

NOTIFY pgrst, 'reload schema';
