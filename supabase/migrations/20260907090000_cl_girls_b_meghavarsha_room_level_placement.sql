-- Girls Hostel B — place MEGHAVARSHA E, the one row 20260906120000 skipped.
--
-- The occupancy sheet assigns BOTH KALAIVANI R and MEGHAVARSHA E to GHB R21
-- bed 2. KALAIVANI R already held it, so the reconciliation refused to guess
-- and logged MEGHAVARSHA E as 'skipped' rather than displace someone.
--
-- Operator decision (2026-09-07): the sheet's ROOM is the instruction; its bed
-- number is not. Where the named bed is taken by another learner, that learner
-- keeps their bed and the sheet learner is placed on a free bed IN THE SAME
-- ROOM. This is consistent with the sheet's own bed column being unreliable —
-- GHB R25 lists five different learners all on "Bed 1".
--
-- GHB R21 is a 3-bed Deluxe room. Bed 1 is JESSIKA S, bed 2 is KALAIVANI R, and
-- bed 3 fell vacant during 20260906120000 when DEEPA T upgraded out to GHC R9.
-- MEGHAVARSHA E takes bed 3: her sheet room is honoured, KALAIVANI R is
-- untouched, and no one is displaced.
--
-- She is Deluxe Room and GHB R21 is a Deluxe room, so this is a pure move:
-- no category change and no bill. As in the parent migration it is an in-place
-- UPDATE of room_id/bed_id/block_id, never a vacate+insert, so
-- trg_allocation_sync_learner_categories stays unfired.

DO $mig$
DECLARE
  v_run       uuid := gen_random_uuid();
  v_lp        uuid := '8047e0ee-ab90-4119-bc25-caa2f8b5fc40';  -- learners_profiles.id
  v_profile   uuid := 'e05e9338-86a7-41a5-b601-04ef2b8b82b8';  -- profiles.id
  v_room      uuid;
  v_bed       uuid;
  v_block     uuid;
  v_alloc     uuid;
  v_old_bed   uuid;
  v_cat       uuid;
  v_room_cat  uuid;
  v_bedno     text;
BEGIN
  SELECT r.id, r.block_id, r.category_id
    INTO v_room, v_block, v_room_cat
    FROM hostel_rooms r
    JOIN hostel_blocks b ON b.id = r.block_id AND b.code = 'GHB'
   WHERE r.room_number = '21';
  IF v_room IS NULL THEN RAISE EXCEPTION 'GHB room 21 not found'; END IF;

  SELECT id, bed_id INTO v_alloc, v_old_bed
    FROM hostel_allocations
   WHERE learner_id = v_profile AND status = 'active' AND check_out_date IS NULL
   ORDER BY allocation_date DESC LIMIT 1
   FOR UPDATE;
  IF v_alloc IS NULL THEN
    RAISE EXCEPTION 'MEGHAVARSHA E holds no active allocation to move';
  END IF;

  SELECT hostel_category_id INTO v_cat FROM learners_profiles WHERE id = v_lp;
  IF v_cat IS DISTINCT FROM v_room_cat THEN
    RAISE EXCEPTION 'MEGHAVARSHA E is not on the room category of GHB R21 — this was meant to be a pure move';
  END IF;

  -- Lowest free bed in the room. Deliberately NOT the sheet's bed 2, which
  -- KALAIVANI R keeps.
  SELECT bd.id, bd.bed_number INTO v_bed, v_bedno
    FROM hostel_beds bd
   WHERE bd.room_id = v_room
     AND bd.status = 'available'
     AND NOT EXISTS (SELECT 1 FROM hostel_allocations h
                      WHERE h.bed_id = bd.id AND h.status IN ('active','pending_approval')
                        AND h.check_out_date IS NULL)
   ORDER BY bd.bed_number
   LIMIT 1;
  IF v_bed IS NULL THEN
    RAISE EXCEPTION 'GHB R21 has no free bed — MEGHAVARSHA E cannot be placed at room level either';
  END IF;

  UPDATE hostel_allocations
     SET room_id = v_room, bed_id = v_bed, block_id = v_block,
         allocation_type = 'transfer', updated_at = now()
   WHERE id = v_alloc;

  IF v_old_bed IS NOT NULL AND v_old_bed <> v_bed THEN
    UPDATE hostel_beds SET status = 'available', current_occupant_id = NULL, updated_at = now()
     WHERE id = v_old_bed;
  END IF;
  UPDATE hostel_beds SET status = 'occupied', current_occupant_id = v_profile, updated_at = now()
   WHERE id = v_bed;

  UPDATE public.cl_girls_bc_reconcile_log
     SET outcome = 'applied',
         after_allocation_id = v_alloc,
         after_category_id = v_cat,
         target_block_id = v_block,
         target_room_id = v_room,
         target_bed_id = v_bed,
         target_category_id = v_cat,
         note = note || ' — resolved 2026-09-07 at room level: placed on bed '
                     || v_bedno || ', KALAIVANI R keeps bed 2'
   WHERE learner_name = 'MEGHAVARSHA E' AND outcome = 'skipped';

  -- Same guard the parent migration ends on.
  IF EXISTS (
    SELECT 1 FROM hostel_allocations h
      JOIN hostel_blocks b ON b.id = h.block_id
     WHERE h.status = 'active' AND h.check_out_date IS NULL AND b.hostel_type = 'girls'
     GROUP BY h.bed_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A girls-hostel bed now holds more than one live allocation';
  END IF;

  RAISE NOTICE 'MEGHAVARSHA E placed in GHB R21 bed % (run %)', v_bedno, v_run;
END
$mig$;
