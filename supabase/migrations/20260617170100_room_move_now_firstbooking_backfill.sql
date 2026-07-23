-- =====================================================================
-- Move-now backfill, pass 2: first-booking holds                       2026-06-17
--
-- The 20260617170000 backfill only handled learners WITH an active allocation
-- (_cl_execute_room_upgrade). Learners with NO active allocation who reserved a
-- room-pick (manual) bed are first-BOOKINGS, not upgrades — they need
-- _cl_execute_first_booking. Complete them into their held room/bed so the
-- allocation reflects the booked Premium room (the going-forward core already
-- routes the no-allocation case to first_booking).
-- =====================================================================
DO $$
DECLARE r RECORD; v_lp uuid; v_has_alloc boolean;
BEGIN
  FOR r IN
    SELECT w.id AS wid, w.learner_id AS profile_id, w.target_hostel_category_id AS target,
           w.held_room_id, w.held_bed_id, w.from_hostel_category_id
    FROM hostel_waitlist w
    JOIN hostel_categories c ON c.id = w.target_hostel_category_id
    WHERE w.entry_kind='upgrade' AND w.status='waiting' AND w.held_bed_id IS NOT NULL
      AND c.allocation_mode='manual'
  LOOP
    BEGIN
      SELECT lp.id INTO v_lp FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id WHERE p.id = r.profile_id;
      IF v_lp IS NULL THEN CONTINUE; END IF;
      v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = r.profile_id AND status='active');
      IF v_has_alloc THEN
        IF r.from_hostel_category_id IS NOT NULL THEN
          UPDATE learners_profiles SET hostel_category_id = r.from_hostel_category_id
           WHERE id = v_lp AND hostel_category_id = r.target;
        END IF;
        PERFORM public._cl_execute_room_upgrade(r.profile_id, v_lp, r.target, r.held_room_id, r.held_bed_id, true);
      ELSE
        PERFORM public._cl_execute_first_booking(r.profile_id, v_lp, r.target, r.held_room_id, r.held_bed_id, true);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'room move-now backfill pass2 failed for waitlist %: %', r.wid, SQLERRM;
    END;
  END LOOP;
END $$;
