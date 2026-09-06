-- =====================================================================
-- _cl_execute_room_upgrade: carry batch_id onto the new allocation      2026-06-17
--
-- BUG: when an auto-allocated learner is upgraded, the room move vacates the old
-- allocation and INSERTs a new (transfer) one — but the new allocation didn't
-- copy batch_id. The Allocation Batch detail page lists hostel_allocations by
-- batch_id, so it kept showing the OLD (vacated) room and never the upgraded one
-- (the new allocation had batch_id NULL). The live Allocations page reads the
-- learner's current active allocation, so it was correct — only the batch page lagged.
--
-- FIX: carry the old allocation's batch_id to the new one, so the upgraded
-- allocation stays linked to its batch. getBatch then dedupes the old vacated +
-- new active rows per learner (service-side) and shows the live one.
-- =====================================================================
CREATE OR REPLACE FUNCTION public._cl_execute_room_upgrade(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid, p_bed_id uuid, p_from_hold boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric;
  v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb; v_linked_bill uuid;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF p_from_hold THEN
    IF v_bed_status IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'Held bed is no longer reserved'; END IF;
  ELSE
    IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;
  END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id, batch_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = p_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No active allocation to upgrade from'; END IF;

  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, batch_id
  )
  SELECT v_old.institution_id, p_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, p_profile, v_old.batch_id
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=p_profile WHERE id = p_bed_id;

  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;

  SELECT upgrade_bill_id INTO v_linked_bill FROM hostel_waitlist
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting'
     AND upgrade_bill_id IS NOT NULL
   LIMIT 1;
  IF v_linked_bill IS NULL THEN
    SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
      WHERE hostel_year_id = v_year AND is_active
        AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
    v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
    v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
                format('Hostel room upgrade: %s -> %s', COALESCE(v_cur_name,'-'), v_new_name));
  ELSE
    v_upgrade_fee := NULL;
    v_bill := jsonb_build_object('action','linked','bill_id',v_linked_bill);
  END IF;

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc,
         held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'state', 'upgraded',
    'old_allocation_id', v_old.id, 'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $function$;
