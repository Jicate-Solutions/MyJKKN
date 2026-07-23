-- Optimistic upgrade (2/3): room-pick confirm flips the category immediately on the
-- reserve path (records original on the hold for revert), instead of staging pending.
-- (Applied via MCP; this file mirrors the live definition. Only the "stage pending" line
-- changed to "record from + flip category".)
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(p_new_category_id uuid, p_room_id uuid, p_bed_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text;
  v_gate jsonb; v_hold_days int; v_bed_status text; v_existing uuid;
  v_inst uuid; v_ay uuid; v_expires timestamptz; v_result jsonb; v_has_alloc boolean;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid; v_meets boolean;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can book or upgrade a room';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');

  -- Gate: upgrades disabled for the resident's current room category. First-booking
  -- (no active allocation) is exempt — that path is initial room selection, not an upgrade.
  IF v_has_alloc AND NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Room upgrades are currently disabled for your category';
  END IF;

  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id
    FROM fn_my_room_options(p_new_category_id) o
    WHERE o.room_id = p_room_id
    ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN
      RAISE EXCEPTION 'No available bed left in that room. Pick another room.';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fn_my_room_options(p_new_category_id) o
    WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);
  v_meets := (v_gate->>'meets')::boolean;

  IF NOT v_has_alloc AND v_meets THEN
    v_result := public._cl_execute_first_booking(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('new_fee', v_new_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;

  IF v_has_alloc THEN
    SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
      WHERE hostel_year_id = v_year AND is_active
        AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
    v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
    IF v_meets AND COALESCE(v_upgrade_fee, 0) <= 0 THEN
      v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
      RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
    END IF;
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

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
     AND target_hostel_category_id = p_new_category_id AND held_bed_id IS NOT NULL;

  UPDATE hostel_beds SET status='reserved' WHERE id = p_bed_id;

  SELECT upgrade_hold_days INTO v_hold_days FROM hostel_categories WHERE id = p_new_category_id;
  v_expires := now() + make_interval(days => COALESCE(v_hold_days, 5));

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade'
      AND target_hostel_category_id = p_new_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist
       SET held_room_id=p_room_id, held_bed_id=p_bed_id, hold_expires_at=v_expires, updated_at=now()
     WHERE id = v_existing;
  ELSE
    INSERT INTO hostel_waitlist (
      institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at
    ) VALUES (
      v_inst, v_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, p_room_id, p_bed_id, v_expires
    ) RETURNING id INTO v_existing;
  END IF;

  -- Optimistic upgrade: flip the category now (record original on the hold for revert),
  -- instead of staging it as pending. Expiry restores from_hostel_category_id if unpaid.
  UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_existing;
  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = v_lp;

  IF v_has_alloc AND v_meets THEN
    SELECT upgrade_bill_id INTO v_bill_id FROM hostel_waitlist WHERE id = v_existing;
    IF v_bill_id IS NULL THEN
      v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'hostel', v_upgrade_fee,
                  format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
      v_bill_id := (v_bill->>'bill_id')::uuid;
      UPDATE hostel_waitlist SET upgrade_bill_id = v_bill_id, updated_at=now() WHERE id = v_existing;
    END IF;
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment',
      'waitlist_id', v_existing, 'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
      'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
      'old_fee', v_cur_fee, 'new_fee', v_new_fee);
  END IF;

  RETURN jsonb_build_object('success', true, 'state', 'waitlisted',
    'waitlist_id', v_existing,
    'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
    'total_billed', v_gate->'total_billed', 'total_paid', v_gate->'total_paid',
    'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee);
END $function$;
