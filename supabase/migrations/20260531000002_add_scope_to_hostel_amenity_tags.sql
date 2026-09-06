-- ============================================================================
-- Add a `scope` dimension to the amenity catalog (hostel_amenity_tags).
-- ============================================================================
-- WHY: amenities are not universal — some apply at the block level (e.g. Lift
-- Access), some at the room level (e.g. Attached Bath), some at both (Wi-Fi).
-- The Block Add/Edit form fetches scope IN ('block','both'); the Room form
-- fetches scope IN ('room','both'). Replaces the old static JSONB amenities
-- toggles on hostel_blocks (dropped in a later migration).
-- ============================================================================

ALTER TABLE public.hostel_amenity_tags
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'both'
  CHECK (scope IN ('block','room','both'));

-- Backfill the 8 seeded rows sensibly (others remain the 'both' default).
UPDATE public.hostel_amenity_tags SET scope = 'block'
  WHERE code = 'lift_access';

UPDATE public.hostel_amenity_tags SET scope = 'room'
  WHERE code IN ('attached_bath','balcony','wardrobe','study_table','hot_water_geyser','window_view');
-- 'wifi_basic' intentionally left as 'both'.
