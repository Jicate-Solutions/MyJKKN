-- ============================================================================
-- Migration: 20260429000020_attention_bar_l1_return_secondary_policy
-- Phase 5+ — Director-tunable Attention Bar L1 secondary emission
-- ============================================================================
-- Seeds the canonical policy row consumed by lib/attention-bar/layers/layer-1.ts
-- (via getPolicyBool('attention_bar.layer1.return_secondary', false)) and
-- written by the Tab 2 admin toggle in the system/attention-bar UI.
--
-- When ON  → L1 returns BOTH the role-specific entry AND the catch-all as two
--            distinct hits, so the split bar renders by default on every page
--            even when no L2 rule has been configured.
-- When OFF → L1 returns a single most-specific match (current behaviour).
--
-- Default seed: false  → on day 1 nothing changes for any existing user.
--
-- Idempotent: WHERE NOT EXISTS guard mirrors the 12 policies seeded earlier
-- today on 2026-04-29. Safe to re-apply.
-- ============================================================================

INSERT INTO public.platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  is_system,
  is_active
)
SELECT * FROM (VALUES
  (
    'attention_bar.layer1.return_secondary',
    'global',
    NULL::uuid,
    'false'::jsonb,
    'When true, Layer 1 returns BOTH the role-specific entry AND the catch-all as two distinct hits, making the split bar render on every page by default. When false (default), L1 returns a single most-specific match (current behavior).',
    'boolean',
    true,
    true
  )
) AS r(
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  is_system,
  is_active
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.platform_policies p
  WHERE p.policy_key = r.policy_key
    AND p.scope_type = r.scope_type
    AND COALESCE(p.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(r.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
