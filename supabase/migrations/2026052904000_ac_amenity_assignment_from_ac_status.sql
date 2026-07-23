-- PR ι-b — Decouple AC from room category (correct the AC=Premium backfill).
--
-- BACKGROUND (decisions 26-29, locked 2026-05-28):
--   AC is a SEPARATE billable amenity, ORTHOGONAL to room category. Classic+AC
--   is valid; Premium-without-AC is valid. Boobalan's prior migration
--   20260528000011_backfill_room_category_by_ac.sql set room CATEGORY *from* AC
--   presence (AC -> Premium, Non-AC -> Classic) as a heuristic. The Director
--   confirmed that heuristic is wrong-in-principle: a room's category and its AC
--   status are independent facts.
--
-- WHAT THIS MIGRATION DOES (the correction, forward — NOT a revert):
--   Move the AC FACT into the billable-amenity system (PR #1112 substrate) so
--   the fee engine (lib/services/campus-living/hostel-fee-compute-service.ts via
--   v_room_effective_billable_amenities) reads AC INDEPENDENTLY of category.
--   For every room whose actual ac_status = 'ac', INSERT a
--   hostel_room_billable_amenities row linking it to the "Air Conditioner"
--   billable amenity (present = true), with a config_override DERIVED FROM THE
--   ROOM'S OWN recorded AC facts.
--
-- WHAT THIS MIGRATION DOES *NOT* DO:
--   * Does NOT touch hostel_rooms.category_id — categories stay exactly as they
--     are (Director-controlled). Only the AC fact moves into the amenity system.
--   * Does NOT revert Boobalan's migration.
--
-- CONFIG_OVERRIDE DERIVATION (FLAGGED for Director confirmation):
--   The fee engine computes ac_annual = tonnage × base_inr_per_month_24h × 12.
--   To make the amenity system reproduce each room's ALREADY-RECORDED annual AC
--   cost (hostel_rooms.ac_annual_cost_inr), we set:
--       tonnage                = hostel_rooms.ac_tonnage_tons
--       base_inr_per_month_24h = ac_annual_cost_inr / (ac_tonnage_tons × 12)
--   This is per-room, derived from the room's own facts — NOT a magic default.
--   When tonnage or annual cost is missing/zero we fall back to a sensible
--   default (tonnage 1.5, base 6222.22 ≈ ₹112000/yr) and FLAG those rooms via
--   the config note key so a warden can confirm.
--
-- IDEMPOTENT: PK is (room_id, billable_id); ON CONFLICT DO NOTHING means a
-- re-run won't clobber any later manual config_override.

DO $$
DECLARE
  v_ac_billable_id uuid;
BEGIN
  SELECT id INTO v_ac_billable_id
  FROM public.hostel_billable_amenities
  WHERE code = 'air_conditioner'
  LIMIT 1;

  IF v_ac_billable_id IS NULL THEN
    RAISE EXCEPTION 'Air Conditioner billable amenity (code=air_conditioner) not found — PR #1112 substrate missing.';
  END IF;

  INSERT INTO public.hostel_room_billable_amenities
    (room_id, billable_id, present, config_override)
  SELECT
    r.id,
    v_ac_billable_id,
    true,
    jsonb_build_object(
      'tonnage',
      COALESCE(NULLIF(r.ac_tonnage_tons, 0), 1.5),
      'base_inr_per_month_24h',
      CASE
        WHEN COALESCE(r.ac_annual_cost_inr, 0) > 0
             AND COALESCE(NULLIF(r.ac_tonnage_tons, 0), 0) > 0
        THEN round(r.ac_annual_cost_inr::numeric / (r.ac_tonnage_tons * 12), 2)
        ELSE 6222.22  -- fallback ≈ ₹112000/yr at 1.5 ton; FLAGGED below
      END,
      'derived_from',
      CASE
        WHEN COALESCE(r.ac_annual_cost_inr, 0) > 0
             AND COALESCE(NULLIF(r.ac_tonnage_tons, 0), 0) > 0
        THEN 'room.ac_annual_cost_inr'
        ELSE 'fallback_default_needs_warden_confirmation'
      END
    )
  FROM public.hostel_rooms r
  WHERE r.ac_status = 'ac'
  ON CONFLICT (room_id, billable_id) DO NOTHING;

  RAISE NOTICE 'AC billable assignment backfill complete for billable_id=%', v_ac_billable_id;
END $$;
