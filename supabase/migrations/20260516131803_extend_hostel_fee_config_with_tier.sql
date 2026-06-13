-- ============================================================================
-- Premium Stay Phase 1 — hostel_fee_config.tier_id
-- ============================================================================
-- Created: 2026-05-16
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#4 fees-per-tier)
--
-- Lets fees vary by tier × room_type × ac_status. Existing rows keep their
-- semantics (standard tier) via backfill; per-institution premium / premium_plus
-- fee rows are created by chief warden via admin UI as part of premium launch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Add nullable column for backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostel_fee_config
  ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES public.hostel_tier_policy(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.hostel_fee_config.tier_id IS
  'Premium Stay Phase 1: which tier this fee row applies to. Backfilled to standard for all existing rows. Per-institution premium / premium_plus fee rows are added via /admin/campus-living/tier-policy as part of premium SKU launch.';

-- ---------------------------------------------------------------------------
-- 2) Backfill existing rows to standard tier
-- ---------------------------------------------------------------------------
UPDATE public.hostel_fee_config fc
   SET tier_id = (
     SELECT htp.id
       FROM public.hostel_tier_policy htp
      WHERE htp.tier_key = 'standard'
        AND (htp.institution_id = fc.institution_id OR htp.institution_id IS NULL)
      ORDER BY (htp.institution_id IS NULL) ASC
      LIMIT 1
   )
 WHERE tier_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Lock NOT NULL after backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostel_fee_config
  ALTER COLUMN tier_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Index for tier-aware fee lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hostel_fee_config_inst_tier
  ON public.hostel_fee_config (institution_id, tier_id, is_active);

-- ---------------------------------------------------------------------------
-- 5) Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_null_count integer;
  v_total integer;
BEGIN
  SELECT count(*) INTO v_null_count FROM public.hostel_fee_config WHERE tier_id IS NULL;
  SELECT count(*) INTO v_total FROM public.hostel_fee_config;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'hostel_fee_config backfill failed: % NULL tier_id', v_null_count;
  END IF;
  RAISE NOTICE 'hostel_fee_config backfilled: % rows, 0 NULL', v_total;
END $$;
