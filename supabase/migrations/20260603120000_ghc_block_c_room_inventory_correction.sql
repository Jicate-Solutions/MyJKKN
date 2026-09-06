-- Girls Hostel C (GHC, block a4022e63-62b2-4777-a36f-7527de0795aa) room-level
-- inventory correction, derived from 'girls hostel inventory - C BLOCK.tsv'.
--
-- The C-block sheet is a per-occupant roster; only each room's header row holds
-- room-level data. Per 2026-06-03 decisions: STUDENT NAME / DEPARTMENT and the
-- ROOM STATUS occupancy are ignored (all rooms available, no allocations
-- touched); the TILES column is skipped; the unnumbered 3rd-floor TV Hall is
-- skipped (room 10 simply reverts to a student room); AC follows the TSV.
--
-- Only the 10 rooms that drifted are touched. category_id moves with purpose:
-- student rooms get the premium-tier category, special-purpose rooms get none.
DO $$
DECLARE
  v_block   uuid := 'a4022e63-62b2-4777-a36f-7527de0795aa';
  v_premium uuid := 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d';
BEGIN
  -- Purpose fixes — rooms 10 & 13 are student rooms (premium category).
  UPDATE hostel_rooms SET room_purpose = 'student', category_id = v_premium
    WHERE block_id = v_block AND room_number IN ('10','13');

  -- Room 14 is the Dental Staff room (no category).
  UPDATE hostel_rooms SET room_purpose = 'dental_staff', category_id = NULL
    WHERE block_id = v_block AND room_number = '14';

  -- Room 44 is the 2nd-floor TV Room (no category).
  UPDATE hostel_rooms SET room_purpose = 'tv_hall', category_id = NULL
    WHERE block_id = v_block AND room_number = '44';

  -- Room 49 is the Warden room (no category).
  UPDATE hostel_rooms SET room_purpose = 'warden', category_id = NULL
    WHERE block_id = v_block AND room_number = '49';

  -- AC follows the TSV exactly: these rooms are AC.
  UPDATE hostel_rooms SET ac_status = 'ac'
    WHERE block_id = v_block AND room_number IN ('13','15','17','48','50','52');

  -- Rooms 14 & 49 are NOT AC in the TSV; flip to non-AC and drop the now-
  -- orphaned AC tonnage/cost figures.
  UPDATE hostel_rooms
    SET ac_status = 'non_ac', ac_tonnage_tons = NULL, ac_annual_cost_inr = NULL
    WHERE block_id = v_block AND room_number IN ('14','49');
END $$;
