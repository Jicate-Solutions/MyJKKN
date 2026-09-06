-- 20260609163000_cl_upgrade_action_rpcs.sql
-- Instant self-service category upgrades (no approval). Dual keying:
--   v_profile = auth.uid()        -> hostel_allocations / hostel_waitlist.learner_id
--   v_lp      = get_my_learner_id -> learners_profiles.id / billing student_id

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
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND is_active LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_mess_category(p_new_mess_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_allow uuid[]; v_bill jsonb;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RAISE EXCEPTION 'Only a hostel resident can upgrade'; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE mess_category_id = p_new_mess_category_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected mess category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM mess_categories WHERE id = p_new_mess_category_id;

  SELECT array_agg(category_id) INTO v_allow FROM fn_hostel_learner_mess_categories(v_lp);
  IF v_allow IS NOT NULL AND NOT (p_new_mess_category_id = ANY(v_allow)) THEN
    RAISE EXCEPTION 'You are not eligible for this mess category';
  END IF;

  SELECT mess_category_id INTO v_cur_mess FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE mess_category_id = v_cur_mess AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  UPDATE learners_profiles SET mess_category_id = p_new_mess_category_id, updated_at=now() WHERE id = v_lp;
  v_bill := public._cl_apply_category_bill_change(v_lp, v_year, v_cur_mess, p_new_mess_category_id, v_new_fee, v_new_name);

  RETURN jsonb_build_object('success', true, 'old_category_id', v_cur_mess,
    'new_category_id', p_new_mess_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'bill', v_bill);
END $$;

CREATE OR REPLACE FUNCTION public.fn_self_join_upgrade_waitlist(p_target_category_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_inst uuid; v_ay uuid; v_existing uuid; v_id uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can join the waitlist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fn_my_manual_categories() mc WHERE mc.id = p_target_category_id) THEN
    RAISE EXCEPTION 'You are not eligible for this category';
  END IF;

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id=v_profile AND entry_kind='upgrade'
      AND target_hostel_category_id=p_target_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist SET updated_at=now() WHERE id=v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind, target_hostel_category_id)
  VALUES (v_inst, v_profile, v_ay, 'waiting', 'upgrade', p_target_category_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid,uuid,uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_mess_category(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_join_upgrade_waitlist(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_mess_category(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_join_upgrade_waitlist(uuid) TO authenticated;
