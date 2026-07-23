-- =====================================================================
-- Room upgrades move into the new room IMMEDIATELY (drop pay-to-confirm)  2026-06-17
--
-- Office decision: when a learner is upgraded to a room-picked category (e.g.
-- Deluxe -> Premium), move them into the new room NOW (vacate old, allocate new)
-- and bill the upgrade fee — instead of reserving a bed and waiting for payment
-- (which, with the fail-closed academic-fee threshold, meant the move almost
-- never happened: category said Premium, room stayed Deluxe forever).
--
-- Applies to BOTH self-service and admin room upgrades (they share the core
-- _cl_upgrade_room_category). Category-only AUTO upgrades (Classic/Deluxe, no
-- room pick) and mess are unaffected. The optimistic pre-flip + reserve/waitlist
-- branch is removed from the room path; _cl_execute_room_upgrade does the
-- flip + bill + move in one atomic step.
--
-- Part B backfills the learners already stuck mid-flight (category flipped,
-- bed reserved, still in old room): revert category to the recorded original so
-- the fee computes correctly, then complete the move into the held room.
-- =====================================================================

-- Part A — move-now core --------------------------------------------------
CREATE OR REPLACE FUNCTION public._cl_upgrade_room_category(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid,
  p_bed_id uuid DEFAULT NULL, p_enforce_self_gates boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lp uuid := p_lp; v_profile uuid := p_profile;
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_gate jsonb; v_has_alloc boolean; v_result jsonb; v_orig uuid;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');

  -- If a prior request already optimistically flipped the category to the target,
  -- revert to the recorded original so the upgrade fee computes original -> target.
  IF v_cur_cat = p_new_category_id THEN
    SELECT from_hostel_category_id INTO v_orig FROM hostel_waitlist
     WHERE learner_id = v_profile AND entry_kind='upgrade' AND target_hostel_category_id = p_new_category_id
       AND from_hostel_category_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1;
    IF v_orig IS NOT NULL THEN
      UPDATE learners_profiles SET hostel_category_id = v_orig WHERE id = v_lp;
      v_cur_cat := v_orig;
    END IF;
  END IF;

  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  -- Self-service opt-in gate (admins bypass via p_enforce_self_gates=false).
  IF p_enforce_self_gates AND v_has_alloc
     AND NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Room upgrades are currently disabled for your category';
  END IF;

  -- Clear any prior in-flight holds so no bed/bill is orphaned by the move-now.
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id <> p_new_category_id;
  UPDATE hostel_waitlist
     SET held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id = p_new_category_id;

  -- Resolve / validate the bed (after freeing reserved beds so they reappear as available).
  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id FROM _cl_room_options(v_profile, v_lp, p_new_category_id) o
    WHERE o.room_id = p_room_id ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN RAISE EXCEPTION 'No available bed left in that room. Pick another room.'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _cl_room_options(v_profile, v_lp, p_new_category_id) o
                 WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for this learner';
  END IF;

  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);  -- reporting only (no longer gates the move)

  -- Move now.
  IF NOT v_has_alloc THEN
    v_result := public._cl_execute_first_booking(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('new_fee', v_new_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;

  v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
  RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
END $$;

-- Part B — complete the learners already stuck mid-flight -----------------
-- (waiting hold + reserved bed + manual target = a room upgrade that never moved).
DO $$
DECLARE r RECORD; v_lp uuid;
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
      -- revert the optimistic flip so the bill computes original -> target
      IF r.from_hostel_category_id IS NOT NULL THEN
        UPDATE learners_profiles SET hostel_category_id = r.from_hostel_category_id
         WHERE id = v_lp AND hostel_category_id = r.target;
      END IF;
      PERFORM public._cl_execute_room_upgrade(r.profile_id, v_lp, r.target, r.held_room_id, r.held_bed_id, true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'room move-now backfill failed for waitlist %: %', r.wid, SQLERRM;
    END;
  END LOOP;
END $$;
