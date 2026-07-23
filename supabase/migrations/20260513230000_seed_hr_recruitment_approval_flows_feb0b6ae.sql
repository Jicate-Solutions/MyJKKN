-- ============================================================================
-- Migration: 20260513230000_seed_hr_recruitment_approval_flows_feb0b6ae
--
-- Reconstructs the 7 recruitment_approval flow seeds for the JKKN org
-- (hr_organization_id = feb0b6ae-b040-4c21-94e0-d2243155ff5d).
--
-- HISTORY
--   The original migration file (version 20260513230000) was lost during a
--   2026-05-16 sibling-session HEAD move while the file was still untracked.
--   The 7 rows exist in prod (they were applied via direct INSERT during the
--   original session) but neither the file nor the schema_migrations bookkeeping
--   row was preserved.
--
--   This file reconstructs the canonical migration from the live prod rows so
--   that:
--     1. Future fresh-clone setups apply the same 7 rows.
--     2. supabase_migrations.schema_migrations carries the 20260513230000
--        bookkeeping row (registered separately, this file is the SQL receipt).
--
-- IDEMPOTENCY
--   Safe to re-apply. ON CONFLICT (id) DO NOTHING means existing rows are
--   never overwritten. The id PKs come straight from the live rows so a
--   re-apply on prod is a no-op.
--
-- SCOPE
--   TIER-0 safe-additive INSERT only. No DDL. No row modifications. No deletes.
-- ============================================================================

INSERT INTO public.hr_approval_flows (
  id,
  hr_organization_id,
  flow_for,
  flow_name,
  conditions,
  steps,
  is_active,
  created_at
) VALUES
  (
    '5f228e49-2aff-4a23-bf68-04a85cb08b4d',
    'feb0b6ae-b040-4c21-94e0-d2243155ff5d',
    'recruitment_approval',
    'Contract & Temporary Staff',
    '{"role_category":"contract"}'::jsonb,
    '[{"chain_order":1,"approver_role":"hr_head","escalate_after_hours":72}]'::jsonb,
    true,
    '2026-04-15 17:20:44.834033+00'::timestamptz
  ),
  (
    '630b2a76-73ff-4ce6-acb8-b7dc7fe2f18e',
    'feb0b6ae-b040-4c21-94e0-d2243155ff5d',
    'recruitment_approval',
    'Medical & Clinical Staff',
    '{"role_category":"medical"}'::jsonb,
    '[{"chain_order":1,"approver_role":"medical_superintendent","escalate_after_hours":72},{"chain_order":2,"approver_role":"director","escalate_after_hours":72}]'::jsonb,
    true,
    '2026-04-15 17:20:44.834033+00'::timestamptz
  ),
  (
    '28e8dde3-1033-4a4a-90af-e304f58e457c',
    'feb0b6ae-b040-4c21-94e0-d2243155ff5d',
    'recruitment_approval',
    'Non-Teaching Staff',
    '{"role_category":"non_teaching"}'::jsonb,
    '[{"chain_order":1,"approver_role":"coo","escalate_after_hours":72},{"chain_order":2,"approver_role":"hr_head","escalate_after_hours":72}]'::jsonb,
    true,
    '2026-04-15 17:20:44.834033+00'::timestamptz
  ),
  (
    'd591ba92-c365-4e1b-9866-7633739aaff6',
    'feb0b6ae-b040-4c21-94e0-d2243155ff5d',
    'recruitment_approval',
    'Senior Leadership',
    '{"role_category":"senior_leadership"}'::jsonb,
    '[{"chain_order":1,"approver_role":"director","escalate_after_hours":72},{"chain_order":2,"approver_role":"board","escalate_after_hours":72}]'::jsonb,
    true,
    '2026-04-15 17:20:44.834033+00'::timestamptz
  ),
  (
    '0b83a803-7538-4bd9-bf06-7fce101cff05',
    'feb0b6ae-b040-4c21-94e0-d2243155ff5d',
    'recruitment_approval',
    'Teaching Faculty — ₹50k-₹1L/month',
    '{"role_category":"teaching_faculty","monthly_salary_band":"50k_to_1L"}'::jsonb,
    '[{"chain_order":1,"approver_role":"principal","escalate_after_hours":72},{"chain_order":2,"approver_role":"coo","escalate_after_hours":72}]'::jsonb,
    true,
    '2026-04-15 17:20:44.834033+00'::timestamptz
  ),
  (
    'efcedcec-edab-4f15-b1d5-3de1205a85d2',
    'feb0b6ae-b040-4c21-94e0-d2243155ff5d',
    'recruitment_approval',
    'Teaching Faculty — Over ₹1L/month (Director)',
    '{"role_category":"teaching_faculty","monthly_salary_band":"over_1L"}'::jsonb,
    '[{"chain_order":1,"approver_role":"director","escalate_after_hours":72}]'::jsonb,
    true,
    '2026-04-15 17:20:44.834033+00'::timestamptz
  ),
  (
    'd4992a9f-9f55-4ec8-b2af-489c559ba05a',
    'feb0b6ae-b040-4c21-94e0-d2243155ff5d',
    'recruitment_approval',
    'Teaching Faculty — Under ₹50k/month',
    '{"role_category":"teaching_faculty","monthly_salary_band":"under_50k"}'::jsonb,
    '[{"chain_order":1,"approver_role":"principal","escalate_after_hours":72},{"chain_order":2,"approver_role":"hod","escalate_after_hours":72}]'::jsonb,
    true,
    '2026-04-15 17:20:44.834033+00'::timestamptz
  )
ON CONFLICT (id) DO NOTHING;
