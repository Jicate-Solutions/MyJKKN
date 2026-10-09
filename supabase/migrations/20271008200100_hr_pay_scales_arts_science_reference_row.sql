-- ============================================================================
-- Migration: 20271008200100_hr_pay_scales_arts_science_reference_row
-- Date: 2026-09-28
-- Data-only INSERT into platform_policies. No DDL, no functions, no grants.
-- ============================================================================
--
-- Purpose: give JKKN Arts & Science an EMPTY hr.pay_scales policy row so the
-- pay-scale screen (/hr/admin/policies/pay-scales) can save to it. Without a
-- row, a save updated zero rows. The Director loads the year ladders himself
-- from that screen, so this row carries NO ladders and an empty pay_matrix.
--
-- REFERENCE ONLY — changes nobody's pay. hr.pay_scales is a reference band;
-- no salary table is read or written here, and nothing reads this row to
-- write a salary.
--
-- Modelled on 20260605_hr_compensation_seeds.sql (same columns, same
-- ON CONFLICT target). ON CONFLICT DO NOTHING: an existing row is never
-- overwritten. Touches only policy_key = 'hr.pay_scales' for
-- institution b0b8a724-7c65-4f07-8047-2a38e8100ad5 (JKKN Arts & Science).
--
-- Version note (renumbered 2026-10-08): first written as 20270415090000,
-- which main later used for 20270415090000_learner_leave_types_and_role_flows.
-- 20271008200100 is absent from supabase/migrations on jicate/main and matches
-- no PR (gh pr list --search, 2026-10-08). The newest version applied live was
-- 20271008160000 per the coordinator's read that day; the ledger itself was not
-- read by this lane.
-- ============================================================================

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES
(
  'hr.pay_scales',
  'institution',
  'b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid,
  '{
    "pay_matrix": [],
    "overrides": {"net_set_basic": null},
    "fixation_basis": ["qualification", "experience"],
    "selection_committee_authority": true,
    "higher_pay_package_approver": "Trust Secretary"
  }'::jsonb,
  'JKKN Arts & Science — Pay Scale reference band. Reference only: changes nobody''s pay. Starts empty; year ladders are loaded from /hr/admin/policies/pay-scales.',
  'object',
  true
)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;
