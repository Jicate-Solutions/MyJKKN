-- Backfill: materialize hostel_beds for student rooms that have capacity but no bed rows.
--
-- ROOT CAUSE (incident, 2026-06-19): Boys Hostel A/B/C had 62/14/16 student rooms with a
-- declared capacity but ZERO hostel_beds rows (281/43/48 beds missing). Beds normally
-- auto-materialize via trigger trg_hostel_rooms_ensure_beds, which fires only AFTER INSERT
-- OR UPDATE OF capacity, room_purpose. These rooms were imported before that mechanism
-- existed (or via a path that bypassed the trigger), so they never got beds, and the one-time
-- backfill 20260531000005_materialize_hostel_beds_from_capacity.sql did not cover them.
--
-- SYMPTOM: Auto-allocation (fn_auto_allocate_classic) and its preview (fn_auto_allocate_candidates)
-- always assign a learner to a specific hostel_beds row. With no bed rows, physical_rule_ok was
-- true (rooms of the right category/gender exist) but bed_available was false, so every otherwise-
-- eligible learner fell through to the misleading verdict "Their category rooms are full — no free bed".
--
-- FIX: call the system's own idempotent generator for every bedless student room (any block, so this
-- is self-healing for future gaps too). fn_hostel_ensure_room_beds creates `capacity` beds at
-- status='available' with the room's primary institution, and skips beds that already exist.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT rm.id
    FROM hostel_rooms rm
    WHERE rm.room_purpose = 'student'
      AND rm.capacity >= 1
      AND NOT EXISTS (SELECT 1 FROM hostel_beds b WHERE b.room_id = rm.id)
  LOOP
    PERFORM public.fn_hostel_ensure_room_beds(r.id);
  END LOOP;
END $$;
