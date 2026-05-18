-- ============================================================================
-- Premium Stay Phase 1 — hostel_tier_policy table (config-row substrate)
-- ============================================================================
-- Created: 2026-05-16
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (Wave 1)
-- Locked initiative: ~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md row
--                    premium-stay-phase1 (verdict-date 2026-08-14)
--
-- Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
-- every policy decision = config-table row + super_admin UI to write + reader fn.
-- Zero deploys, zero PRs, zero developer round-trips for future tweaks.
--
-- Purpose
-- -------
-- Two-tier paid SKU layered on the existing hostel-allocation substrate.
--   standard       (0% uplift, no features)         — DEFAULT for all existing rows
--   premium        (configurable uplift, 3 features) — self-pick block/room/bed/roommate
--   premium_plus   (configurable uplift, 5 features) — above + extended curfew + premium SLA
--
-- Tier rows are per-institution by default (each college can customize uplift %).
-- A "global" scope row may be present as the platform default (created on demand
-- by Director UI). Companion seed migration creates global default rows.
--
-- Pattern source: consultant_tier_policy (PR #874, 2026-05-13). This migration
-- mirrors that 1:1 with the cardinal difference being the bundle is "feature
-- pack" not "conversion threshold ladder".
--
-- Companion service:   lib/services/campus-living/hostel-tier-service.ts
-- Companion admin UI:  app/(routes)/admin/campus-living/tier-policy/page.tsx
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hostel_tier_policy (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id                uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  tier_key                      text NOT NULL CHECK (tier_key IN ('standard', 'premium', 'premium_plus')),
  tier_display_name             text NOT NULL,
  fee_uplift_percentage_default numeric(6,2) NOT NULL DEFAULT 0 CHECK (fee_uplift_percentage_default >= 0),
  tier_features                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active                     boolean NOT NULL DEFAULT true,
  sort_order                    integer NOT NULL DEFAULT 0,
  description                   text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid REFERENCES auth.users(id),
  updated_by                    uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.hostel_tier_policy IS
  'Premium Stay Phase 1 — per-institution tier ladder (standard / premium / premium_plus). NULL institution_id = global platform default. Editable via super_admin UI at /admin/campus-living/tier-policy. Referenced by hostel_allocations.tier_id (per-bed assignment) + hostel_fee_config.tier_id (per-tier fees) + hostel_maintenance_sla_config.tier_id (per-tier SLA).';
COMMENT ON COLUMN public.hostel_tier_policy.institution_id IS
  'NULL = global platform default (Director UI), set = per-institution override.';
COMMENT ON COLUMN public.hostel_tier_policy.tier_key IS
  'Stable machine key. CHECK constraint locks to standard/premium/premium_plus — adding a fourth tier requires migration + UI work, not just a config row.';
COMMENT ON COLUMN public.hostel_tier_policy.tier_display_name IS
  'Human-friendly label shown in admin UI and learner-facing pricing pages. e.g. "Premium", "Premium Plus".';
COMMENT ON COLUMN public.hostel_tier_policy.fee_uplift_percentage_default IS
  'Default uplift percent over the standard hostel fee. Per-institution-per-tier exact amounts live in hostel_fee_config.tier_id rows (added by sister migration). This column is the suggested default the Director UI prefills when creating a new fee config row.';
COMMENT ON COLUMN public.hostel_tier_policy.tier_features IS
  'JSONB array of feature keys (e.g. ["pick_block_and_room","pick_specific_bed","pick_roommate_with_consent"]). UI renders these as English checkboxes (Director-view). Service layer reads to gate-check user actions (e.g. fn_hostel_premium_evaluate).';

-- (institution_id, tier_key) is unique. NULL institution_id (global) collapses
-- with COALESCE so two global rows with the same tier_key are rejected.
-- Mirrors platform_policies + consultant_tier_policy unique-index shape.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_tier_policy_inst_tier
  ON public.hostel_tier_policy (
    tier_key,
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_hostel_tier_policy_active
  ON public.hostel_tier_policy (institution_id, is_active);

-- ---------------------------------------------------------------------------
-- 2) updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hostel_tier_policy_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hostel_tier_policy_updated_at ON public.hostel_tier_policy;
CREATE TRIGGER trg_hostel_tier_policy_updated_at
  BEFORE UPDATE ON public.hostel_tier_policy
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_hostel_tier_policy_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3) RLS — super_admin/admin write; super_admin/admin + campus_living
--    permission holders SELECT (so admin UIs render the dropdown for wardens
--    too). chief_warden write is captured via user_has_permission grant in
--    the seed/maintenance migrations, not hardcoded here.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostel_tier_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_tier_policy_select ON public.hostel_tier_policy;
CREATE POLICY hostel_tier_policy_select ON public.hostel_tier_policy
  FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.premium.view_dashboard')
    OR user_has_permission('campus_living.settings.view')
    OR user_has_permission('campus_living.view')
  );

DROP POLICY IF EXISTS hostel_tier_policy_insert ON public.hostel_tier_policy;
CREATE POLICY hostel_tier_policy_insert ON public.hostel_tier_policy
  FOR INSERT
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.premium.configure_tier')
  );

DROP POLICY IF EXISTS hostel_tier_policy_update ON public.hostel_tier_policy;
CREATE POLICY hostel_tier_policy_update ON public.hostel_tier_policy
  FOR UPDATE
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.premium.configure_tier')
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.premium.configure_tier')
  );

DROP POLICY IF EXISTS hostel_tier_policy_delete ON public.hostel_tier_policy;
CREATE POLICY hostel_tier_policy_delete ON public.hostel_tier_policy
  FOR DELETE
  USING (
    is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- 4) Seed: 3 global default rows (idempotent). Per-institution overrides are
--    created via admin UI on demand. tier_features mirror the locked spec
--    decision-#4 bundles.
-- ---------------------------------------------------------------------------
INSERT INTO public.hostel_tier_policy (
  institution_id, tier_key, tier_display_name, fee_uplift_percentage_default,
  tier_features, is_active, sort_order, description
)
SELECT * FROM (VALUES
  (
    NULL::uuid,
    'standard',
    'Standard',
    0::numeric,
    '[]'::jsonb,
    true,
    1,
    'Default tier — every existing and new hostel_allocation defaults here. No self-selection features; allocation is admin-driven.'
  ),
  (
    NULL::uuid,
    'premium',
    'Premium',
    25::numeric,
    '["pick_block_and_room","pick_specific_bed","pick_roommate_with_consent"]'::jsonb,
    true,
    2,
    'Lower premium tier. Learner self-picks block, room, bed, and (with consent) a roommate. Suggested default uplift 25%; per-institution exact fee configured via hostel_fee_config.tier_id.'
  ),
  (
    NULL::uuid,
    'premium_plus',
    'Premium Plus',
    50::numeric,
    '["pick_block_and_room","pick_specific_bed","pick_roommate_with_consent","extended_curfew_quota","premium_maintenance_sla"]'::jsonb,
    true,
    3,
    'Top premium tier. Includes Premium features + 4 late-returns/month curfew quota + premium maintenance SLA (4hr response). Suggested default uplift 50%.'
  )
) AS r(institution_id, tier_key, tier_display_name, fee_uplift_percentage_default, tier_features, is_active, sort_order, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hostel_tier_policy htp
   WHERE htp.institution_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 5) Verification (SELECT-only — no INSERT smoke test per
--    feedback_smoke_test_must_include_all_not_null_columns.md)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_row_count integer;
  v_tier_count integer;
BEGIN
  SELECT count(*) INTO v_row_count FROM public.hostel_tier_policy WHERE institution_id IS NULL;
  SELECT count(DISTINCT tier_key) INTO v_tier_count FROM public.hostel_tier_policy WHERE institution_id IS NULL;

  IF v_row_count < 3 THEN
    RAISE EXCEPTION 'Premium Stay seed failed: expected >= 3 global rows, got %', v_row_count;
  END IF;

  IF v_tier_count < 3 THEN
    RAISE EXCEPTION 'Premium Stay seed failed: expected >= 3 distinct tier_keys, got %', v_tier_count;
  END IF;

  RAISE NOTICE 'hostel_tier_policy seeded: % global rows across % distinct tiers', v_row_count, v_tier_count;
END $$;
