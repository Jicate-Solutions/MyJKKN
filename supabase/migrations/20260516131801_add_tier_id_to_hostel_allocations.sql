-- ============================================================================
-- Premium Stay Phase 1 — hostel_allocations.tier_id + override_reason
-- ============================================================================
-- Created: 2026-05-16
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (Wave 1, decision-#1)
-- Companion: 20260516131800_create_hostel_tier_policy.sql (table this references)
--
-- Adds two columns to the per-bed allocation row:
--   tier_id          uuid  — which tier this allocation belongs to (standard
--                            by default; premium / premium_plus for paid SKU)
--   override_reason  text  — populated only when chief_warden forcibly
--                            re-allocates a premium-picked bed. RLS on
--                            UPDATE allows the chief_warden role iff this
--                            column is non-null (audit trail).
--
-- Per spec decision-#12: net-new only. All existing rows backfill to the
-- standard tier global row. Premium opt-in is only for new allocations
-- post-launch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Add columns nullable first so backfill can populate them
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostel_allocations
  ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES public.hostel_tier_policy(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS override_reason text;

COMMENT ON COLUMN public.hostel_allocations.tier_id IS
  'Premium Stay Phase 1: tier this allocation belongs to. Defaults to the global standard tier row in hostel_tier_policy. Set to premium / premium_plus by the premium-allocation service when learner opts in. Drives fee calc + maintenance SLA + curfew quota.';
COMMENT ON COLUMN public.hostel_allocations.override_reason IS
  'Premium Stay Phase 1: chief_warden audit trail. Populated when chief_warden overrides a premium learner''s pick. RLS UPDATE policy gates this column non-null. Triggers learner notification + refund-or-rematch downstream (Phase 2).';

-- ---------------------------------------------------------------------------
-- 2) Backfill all existing rows to the standard tier
--
--    Resolution rule: prefer per-institution standard row when present, else
--    fall back to the global standard row. Today there are 0 per-institution
--    rows seeded; the per-institution branch is future-proofing.
-- ---------------------------------------------------------------------------
UPDATE public.hostel_allocations a
   SET tier_id = (
     SELECT htp.id
       FROM public.hostel_tier_policy htp
      WHERE htp.tier_key = 'standard'
        AND (htp.institution_id = a.institution_id OR htp.institution_id IS NULL)
      ORDER BY (htp.institution_id IS NULL) ASC  -- per-institution wins over global
      LIMIT 1
   )
 WHERE tier_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Lock NOT NULL after backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostel_allocations
  ALTER COLUMN tier_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Index for tier-aware queries (e.g. dashboard heatmap)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_tier
  ON public.hostel_allocations (tier_id);

CREATE INDEX IF NOT EXISTS idx_hostel_allocations_institution_tier
  ON public.hostel_allocations (institution_id, tier_id);

-- ---------------------------------------------------------------------------
-- 5) Verification — confirm zero NULLs, all rows resolved to a tier
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_null_count integer;
  v_total integer;
  v_distinct_tiers integer;
BEGIN
  SELECT count(*) INTO v_null_count FROM public.hostel_allocations WHERE tier_id IS NULL;
  SELECT count(*) INTO v_total FROM public.hostel_allocations;
  SELECT count(DISTINCT tier_id) INTO v_distinct_tiers FROM public.hostel_allocations;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Premium Stay backfill failed: % rows still have NULL tier_id', v_null_count;
  END IF;

  RAISE NOTICE 'hostel_allocations backfilled: % rows across % distinct tier(s), 0 NULL', v_total, v_distinct_tiers;
END $$;
