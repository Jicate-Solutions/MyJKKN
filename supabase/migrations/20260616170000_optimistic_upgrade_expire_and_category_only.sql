-- Optimistic upgrade (1/3): expiry restores the original category; category-only confirm
-- flips the category immediately + records the original on the waitlist row.
-- (Applied via MCP; this file mirrors the live definitions.)

CREATE OR REPLACE FUNCTION public.fn_cl_expire_upgrade_holds()
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  WITH expired AS (
    UPDATE hostel_waitlist w
       SET status='expired', updated_at=now()
     WHERE w.entry_kind='upgrade' AND w.status='waiting'
       AND w.hold_expires_at IS NOT NULL AND w.hold_expires_at < now()
       AND NOT EXISTS (
         SELECT 1 FROM billing_student_bills bb
         WHERE bb.id = w.upgrade_bill_id
           AND COALESCE((SELECT SUM(ri.amount_paid) FROM billing_receipt_items ri WHERE ri.bill_id = bb.id),0) >= bb.final_amount
       )
     RETURNING w.learner_id, w.target_hostel_category_id, w.from_hostel_category_id, w.held_bed_id, w.upgrade_bill_id
  ), released AS (
    UPDATE hostel_beds b SET status='available'
    FROM expired e WHERE b.id = e.held_bed_id AND b.status='reserved'
    RETURNING b.id
  ), bills_cancelled AS (
    UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM expired e
    WHERE bb.id = e.upgrade_bill_id AND bb.status='unpaid'
      AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id)
    RETURNING bb.id
  ), category_reverted AS (
    UPDATE learners_profiles lp
       SET hostel_category_id = CASE
             WHEN e.from_hostel_category_id IS NOT NULL AND lp.hostel_category_id = e.target_hostel_category_id
             THEN e.from_hostel_category_id ELSE lp.hostel_category_id END,
           pending_hostel_category_id = CASE
             WHEN lp.pending_hostel_category_id = e.target_hostel_category_id
             THEN NULL ELSE lp.pending_hostel_category_id END,
           updated_at=now()
    FROM expired e JOIN profiles pr ON pr.id = e.learner_id
    WHERE lp.id = pr.learner_id
      AND ( (e.from_hostel_category_id IS NOT NULL AND lp.hostel_category_id = e.target_hostel_category_id)
            OR lp.pending_hostel_category_id = e.target_hostel_category_id )
    RETURNING lp.id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN COALESCE(v_count, 0);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_category_only(p_new_category_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text; v_upgrade_fee numeric; v_hold_days int;
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
  SELECT name, upgrade_hold_days INTO v_new_name, v_hold_days FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id, institution_id, academic_year_id INTO v_cur_cat, v_inst, v_ay
    FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  IF NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Upgrades are currently disabled for your category';
  END IF;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);

  IF COALESCE(v_upgrade_fee,0) <= 0 THEN
    UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = v_lp;
    RETURN jsonb_build_object('success', true, 'state', 'upgraded',
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id, 'upgrade_fee', 0);
  END IF;

  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id=v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id IS NULL AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id=bb.id);
  UPDATE hostel_waitlist SET status='declined', updated_at=now()
   WHERE learner_id=v_profile AND entry_kind='upgrade' AND status='waiting'
     AND held_bed_id IS NULL AND target_hostel_category_id <> p_new_category_id;

  SELECT id, upgrade_bill_id INTO v_wl, v_bill_id FROM hostel_waitlist
    WHERE learner_id=v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NULL AND target_hostel_category_id = p_new_category_id LIMIT 1;
  IF v_bill_id IS NOT NULL THEN
    UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_wl;
    UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = v_lp;
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_wl,
      'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id);
  END IF;

  v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'hostel', v_upgrade_fee,
              format('Hostel category upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
  v_bill_id := (v_bill->>'bill_id')::uuid;

  UPDATE billing_student_bills
     SET due_date = now() + make_interval(days => COALESCE(v_hold_days, 30))
   WHERE id = v_bill_id;

  IF v_wl IS NOT NULL THEN
    UPDATE hostel_waitlist SET upgrade_bill_id=v_bill_id,
      hold_expires_at = now() + make_interval(days => COALESCE(v_hold_days, 5)), updated_at=now() WHERE id=v_wl;
  ELSE
    INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at, upgrade_bill_id)
    VALUES (v_inst, v_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, NULL, NULL, now() + make_interval(days => COALESCE(v_hold_days, 5)), v_bill_id) RETURNING id INTO v_wl;
  END IF;

  UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_wl;
  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = v_lp;

  RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_wl,
    'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee);
END $function$;
