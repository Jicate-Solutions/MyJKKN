-- ============================================================================
-- Premium Stay Phase 1 — hostel_rooms.tier_access
-- ============================================================================
-- Created: 2026-05-16
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#5)
--
-- Tier-tagged room protection: each room is marked premium_only OR either.
-- premium_only rooms can only be allocated to premium / premium_plus tiers.
-- either rooms are pool-shared (mixed-tier ok). Chief warden sets per-room
-- via admin UI.
--
-- Default: 'either' for all existing rooms (no breakage). Chief warden may
-- tag rooms premium_only as part of premium SKU launch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Add column with safe default
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostel_rooms
  ADD COLUMN IF NOT EXISTS tier_access text NOT NULL DEFAULT 'either'
    CHECK (tier_access IN ('premium_only', 'either'));

COMMENT ON COLUMN public.hostel_rooms.tier_access IS
  'Premium Stay Phase 1: room-level tier gating. premium_only = reserved for premium / premium_plus allocations; either = pool-shared (default). Toggle via /admin/campus-living/blocks/rooms or premium dashboard. Service layer enforces gate in fn_hostel_premium_evaluate + premium-allocation-service.';

-- ---------------------------------------------------------------------------
-- 2) Index for fast filtering on the learner pick UI ("show me premium-only
--    rooms in this block")
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hostel_rooms_tier_access
  ON public.hostel_rooms (tier_access)
  WHERE tier_access = 'premium_only';

-- ---------------------------------------------------------------------------
-- 3) Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_either integer;
  v_premium_only integer;
BEGIN
  SELECT count(*) INTO v_either FROM public.hostel_rooms WHERE tier_access = 'either';
  SELECT count(*) INTO v_premium_only FROM public.hostel_rooms WHERE tier_access = 'premium_only';
  RAISE NOTICE 'hostel_rooms.tier_access: % either, % premium_only (expected all-either at launch)', v_either, v_premium_only;
END $$;
