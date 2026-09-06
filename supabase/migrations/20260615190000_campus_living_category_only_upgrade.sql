-- Campus Living — pure CATEGORY-ONLY upgrade for auto categories (Classic/Deluxe).
--
-- Operator model: upgrading to an auto category should generate the upgrade bill, and on
-- full payment change ONLY the learner's category — NO room is reserved or allocated (the
-- room is assigned later via the auto-allocation module). Manual categories keep the
-- room-reserve flow (fn_self_upgrade_room_category).

-- 1) New self-service RPC: bill now, change category on payment, no room.
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_category_only(p_new_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text; v_upgrade_fee numeric;
  v_inst uuid; v_ay uuid; v_bill jsonb; v_bill_id uuid; v_wl uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can upgrade their category';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id, institution_id, academic_year_id INTO v_cur_cat, v_inst, v_ay
    FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);

  -- Nothing to bill (free upgrade) -> apply the category change immediately.
  IF COALESCE(v_upgrade_fee,0) <= 0 THEN
    UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = v_lp;
    RETURN jsonb_build_object('success', true, 'state', 'upgraded',
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id, 'upgrade_fee', 0);
  END IF;

  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  -- Drop any prior room-less category-upgrade intent for a DIFFERENT target + its unpaid bill.
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id=v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id IS NULL AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id=bb.id);
  UPDATE hostel_waitlist SET status='declined', updated_at=now()
   WHERE learner_id=v_profile AND entry_kind='upgrade' AND status='waiting'
     AND held_bed_id IS NULL AND target_hostel_category_id <> p_new_category_id;

  -- Reuse a room-less intent for the SAME target if it already has a bill.
  SELECT id, upgrade_bill_id INTO v_wl, v_bill_id FROM hostel_waitlist
    WHERE learner_id=v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NULL AND target_hostel_category_id = p_new_category_id LIMIT 1;
  IF v_bill_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_wl,
      'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id);
  END IF;

  v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'hostel', v_upgrade_fee,
              format('Hostel category upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
  v_bill_id := (v_bill->>'bill_id')::uuid;

  IF v_wl IS NOT NULL THEN
    UPDATE hostel_waitlist SET upgrade_bill_id=v_bill_id, updated_at=now() WHERE id=v_wl;
  ELSE
    INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at, upgrade_bill_id)
    VALUES (v_inst, v_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, NULL, NULL, NULL, v_bill_id) RETURNING id INTO v_wl;
  END IF;

  RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_wl,
    'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_category_only(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_category_only(uuid) TO authenticated, service_role;

-- 2) Extend the payment-confirmation engine: confirm room-less category-only intents by
--    changing the category on full payment (loop B). Loop A (room reservations) is unchanged.
CREATE OR REPLACE FUNCTION public.fn_cl_process_upgrade_holds(p_student_lp uuid)
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_row RECORD; v_gate jsonb; v_count int := 0;
  v_has_alloc boolean; v_year uuid; v_cur_cat uuid; v_cur_fee numeric;
  v_new_fee numeric; v_cur_name text; v_new_name text;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid;
  v_bill_amount numeric; v_bill_paid numeric; v_bill_status text;
BEGIN
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_student_lp;
  IF v_profile IS NULL THEN RETURN 0; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;

  -- (A) Room-reservation upgrades: confirm by moving the learner into the held bed.
  FOR v_row IN
    SELECT id, target_hostel_category_id, held_room_id, held_bed_id, upgrade_bill_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NOT NULL AND hold_expires_at > now()
    ORDER BY created_at
  LOOP
    BEGIN
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF NOT (v_gate->>'meets')::boolean THEN CONTINUE; END IF;
      v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status='active');
      IF NOT v_has_alloc THEN
        PERFORM public._cl_execute_first_booking(v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1; CONTINUE;
      END IF;
      v_bill_id := v_row.upgrade_bill_id;
      IF v_bill_id IS NOT NULL THEN
        SELECT final_amount, status INTO v_bill_amount, v_bill_status FROM billing_student_bills WHERE id = v_bill_id;
        IF v_bill_amount IS NULL OR v_bill_status IN ('cancelled','superseded') THEN v_bill_id := NULL; END IF;
      END IF;
      IF v_bill_id IS NULL THEN
        SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_student_lp;
        SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
          WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
        SELECT amount INTO v_new_fee FROM hostel_fees
          WHERE hostel_category_id = v_row.target_hostel_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
        SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
          WHERE hostel_year_id = v_year AND is_active
            AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = v_row.target_hostel_category_id LIMIT 1;
        v_upgrade_fee := COALESCE(v_upgrade_fee, COALESCE(v_new_fee,0) - COALESCE(v_cur_fee,0));
        IF COALESCE(v_upgrade_fee, 0) <= 0 THEN
          PERFORM public._cl_execute_room_upgrade(v_profile, p_student_lp, v_row.target_hostel_category_id,
            v_row.held_room_id, v_row.held_bed_id, true);
          v_count := v_count + 1; CONTINUE;
        END IF;
        SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
        SELECT name INTO v_new_name FROM hostel_categories WHERE id = v_row.target_hostel_category_id;
        v_bill := public._cl_apply_upgrade_fee_bill(p_student_lp, v_year, 'hostel', v_upgrade_fee,
                    format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
        UPDATE hostel_waitlist SET upgrade_bill_id = (v_bill->>'bill_id')::uuid, updated_at=now() WHERE id = v_row.id;
        CONTINUE;
      END IF;
      SELECT COALESCE(SUM(ri.amount_paid),0) INTO v_bill_paid FROM billing_receipt_items ri WHERE ri.bill_id = v_bill_id;
      IF v_bill_paid >= v_bill_amount THEN
        PERFORM public._cl_execute_room_upgrade(v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_cl_process_upgrade_holds (room): % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;

  -- (B) Category-only upgrades (no room held): confirm by changing the category on full
  -- payment. The physical room is assigned separately via the auto-allocation module.
  FOR v_row IN
    SELECT id, target_hostel_category_id, upgrade_bill_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NULL AND upgrade_bill_id IS NOT NULL
    ORDER BY created_at
  LOOP
    BEGIN
      SELECT final_amount, status INTO v_bill_amount, v_bill_status FROM billing_student_bills WHERE id = v_row.upgrade_bill_id;
      IF v_bill_amount IS NULL OR v_bill_status IN ('cancelled','superseded') THEN CONTINUE; END IF;
      SELECT COALESCE(SUM(ri.amount_paid),0) INTO v_bill_paid FROM billing_receipt_items ri WHERE ri.bill_id = v_row.upgrade_bill_id;
      IF v_bill_paid >= v_bill_amount THEN
        UPDATE learners_profiles SET hostel_category_id = v_row.target_hostel_category_id, updated_at=now() WHERE id = p_student_lp;
        UPDATE hostel_waitlist SET status='allocated', updated_at=now() WHERE id = v_row.id;
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_cl_process_upgrade_holds (category): % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;

  RETURN v_count;
END $function$;
