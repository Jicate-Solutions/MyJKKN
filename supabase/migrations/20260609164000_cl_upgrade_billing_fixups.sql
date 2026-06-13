-- 20260609164000_cl_upgrade_billing_fixups.sql
-- Review fixes: (1) honest billed amount when the new-category bill already exists;
-- (2) room-fee lookups constrained to mess_category_id IS NULL.

CREATE OR REPLACE FUNCTION public._cl_apply_category_bill_change(
  p_learner_lp     uuid,
  p_hostel_year_id uuid,
  p_old_item_cat   uuid,
  p_new_item_cat   uuid,
  p_new_amount     numeric,
  p_description    text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst       uuid;
  v_old_id     uuid;
  v_old_final  numeric;
  v_old_bal    numeric;
  v_paid       numeric := 0;
  v_bill_total numeric;
  v_desc       text := p_description;
  v_action     text;
  v_inserted   int := 0;
BEGIN
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_lp;

  IF p_old_item_cat IS NOT NULL THEN
    SELECT id, final_amount, balance_amount
      INTO v_old_id, v_old_final, v_old_bal
      FROM billing_student_bills
     WHERE student_id = p_learner_lp
       AND hostel_year_id = p_hostel_year_id
       AND item_category_id = p_old_item_cat
       AND fee_source = 'hostel_category'
       AND status <> 'cancelled'
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  IF v_old_id IS NOT NULL THEN
    v_paid := GREATEST(0, COALESCE(v_old_final,0) - COALESCE(v_old_bal,0));
  END IF;

  IF v_old_id IS NULL THEN
    v_bill_total := p_new_amount;
    v_action := 'created';
  ELSIF v_paid = 0 THEN
    UPDATE billing_student_bills SET status='cancelled', updated_at=now() WHERE id = v_old_id;
    v_bill_total := p_new_amount;
    v_action := 'replaced';
  ELSE
    v_bill_total := GREATEST(0, p_new_amount - v_paid);
    v_desc := p_description || ' (upgrade differential)';
    v_action := 'differential';
  END IF;

  IF v_bill_total > 0 THEN
    INSERT INTO billing_student_bills (
      student_id, institution_id, item_category_id, hostel_year_id, fee_source,
      bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
      balance_amount, status
    ) VALUES (
      p_learner_lp, v_inst, p_new_item_cat, p_hostel_year_id, 'hostel_category',
      v_desc, now() + interval '30 day', 1, v_bill_total, v_bill_total, v_bill_total,
      v_bill_total, 'unpaid'
    ) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    -- A non-cancelled bill for the new category already existed (e.g. re-upgrade to a
    -- previously-held category): nothing was newly billed. Report honestly.
    IF v_inserted = 0 THEN
      v_action := 'exists';
      v_bill_total := 0;
    END IF;
  END IF;

  RETURN jsonb_build_object('action', v_action, 'new_amount', p_new_amount,
                            'billed', v_bill_total, 'old_bill_id', v_old_id);
END $$;

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
RETURNS TABLE (category_id uuid, name text, type text, current_year_fee numeric, available_beds int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;

  RETURN QUERY
  SELECT mc.id, mc.name, mc.type, hf.amount,
         (SELECT count(*)::int FROM fn_my_room_options(mc.id))
  FROM fn_my_manual_categories() mc
  JOIN hostel_fees hf
    ON hf.hostel_category_id = mc.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE mc.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount >= v_cur_fee
  ORDER BY hf.amount;
END $$;

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(
  p_new_category_id uuid, p_room_id uuid, p_bed_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can upgrade';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fn_my_room_options(p_new_category_id) o
    WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = v_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'You have no active allocation to upgrade from'; END IF;

  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  )
  SELECT v_old.institution_id, v_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, v_profile
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile WHERE id = p_bed_id;

  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = v_lp;
  v_bill := public._cl_apply_category_bill_change(v_lp, v_year, v_cur_cat, p_new_category_id, v_new_fee, v_new_name);

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'old_allocation_id', v_old.id,
    'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'bill', v_bill);
END $$;
