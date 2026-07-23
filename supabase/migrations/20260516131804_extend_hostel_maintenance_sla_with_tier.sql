-- ============================================================================
-- Premium Stay Phase 1 — hostel_maintenance_sla_config.tier_id
-- ============================================================================
-- Created: 2026-05-16
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#4 SLA-per-tier)
--
-- Premium Plus has a tighter maintenance SLA (e.g. 4hr response). Letting
-- SLA hours vary by tier lets institutions price the SLA improvement
-- alongside the room/roommate pick features.
--
-- Existing rows backfill to standard tier. Per-institution premium SLA rows
-- are added by chief warden via admin UI on demand.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Add nullable column for backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostel_maintenance_sla_config
  ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES public.hostel_tier_policy(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.hostel_maintenance_sla_config.tier_id IS
  'Premium Stay Phase 1: which tier this SLA row applies to. NULL is forbidden post-backfill; existing rows resolve to standard tier; new premium / premium_plus SLA rows added via admin UI.';

-- ---------------------------------------------------------------------------
-- 2) Backfill to standard
-- ---------------------------------------------------------------------------
UPDATE public.hostel_maintenance_sla_config sla
   SET tier_id = (
     SELECT htp.id
       FROM public.hostel_tier_policy htp
      WHERE htp.tier_key = 'standard'
        AND (htp.institution_id = sla.institution_id OR htp.institution_id IS NULL)
      ORDER BY (htp.institution_id IS NULL) ASC
      LIMIT 1
   )
 WHERE tier_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Lock NOT NULL
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostel_maintenance_sla_config
  ALTER COLUMN tier_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_sla_config_inst_tier
  ON public.hostel_maintenance_sla_config (institution_id, tier_id, category);

-- ---------------------------------------------------------------------------
-- 5) Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_null_count integer;
  v_total integer;
BEGIN
  SELECT count(*) INTO v_null_count FROM public.hostel_maintenance_sla_config WHERE tier_id IS NULL;
  SELECT count(*) INTO v_total FROM public.hostel_maintenance_sla_config;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'hostel_maintenance_sla_config backfill failed: % NULL tier_id', v_null_count;
  END IF;
  RAISE NOTICE 'hostel_maintenance_sla_config backfilled: % rows, 0 NULL', v_total;
END $$;
