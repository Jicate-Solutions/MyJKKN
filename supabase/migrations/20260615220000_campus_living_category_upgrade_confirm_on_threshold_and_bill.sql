-- Category-only upgrade confirmation: change the category only when BOTH the tuition
-- (academic-fee) threshold for the target category is met AND the upgrade bill is fully paid.
-- The bill is still generated immediately at upgrade time (fn_self_upgrade_category_only);
-- the threshold now gates only the FINAL confirmation, not bill generation.

-- 1) Restore the per-category upgrade thresholds cleared by 20260615150000 (operators set
--    these in the Category module; restore the prior values so the gate is active).
UPDATE hostel_categories c
SET upgrade_threshold_pct = b.upgrade_threshold_pct
FROM _bak_hostel_categories_threshold_20260615 b
WHERE b.id = c.id AND c.upgrade_threshold_pct IS NULL AND b.upgrade_threshold_pct IS NOT NULL;

-- 2) Add the tuition threshold gate to the category-only confirmation loop (B).
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

  -- (B) Category-only upgrades (no room held): confirm by changing the category only when
  -- the tuition threshold for the target category is met AND the upgrade bill is fully paid.
  FOR v_row IN
    SELECT id, target_hostel_category_id, upgrade_bill_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NULL AND upgrade_bill_id IS NOT NULL
    ORDER BY created_at
  LOOP
    BEGIN
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF NOT (v_gate->>'meets')::boolean THEN CONTINUE; END IF;   -- tuition not yet at threshold
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
