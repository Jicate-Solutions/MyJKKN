-- =====================================================================
-- _cl_apply_upgrade_fee_bill: accumulate instead of duplicate-INSERT     2026-06-17
--
-- BUG: a 2nd category/room upgrade in the same hostel year (e.g. Deluxe->Premium
-- then Premium->Premium+AC) tried to INSERT a 2nd upgrade-fee bill, violating the
-- partial-unique index uq_bill_dedup_category (student_id, hostel_year_id,
-- item_category_id WHERE fee_source IN academic/hostel_category AND status NOT IN
-- cancelled/superseded). All hostel-category upgrade bills share one
-- item_category_id, so the 2nd INSERT 23505'd — surfaced once room upgrades went
-- move-now (the engine always bills the leg).
--
-- FIX: if a live upgrade bill for this (student, hostel year, upgrade kind)
-- already exists, ADD the new leg's amount onto it (chained upgrades roll up into
-- one bill). Each leg is the differential from the current category, so the sum
-- equals the cumulative original->final fee. Balance/status recompute against
-- anything already paid. No existing bill -> INSERT as before.
-- =====================================================================
CREATE OR REPLACE FUNCTION public._cl_apply_upgrade_fee_bill(
  p_learner_lp uuid, p_hostel_year_id uuid, p_kind text, p_upgrade_amount numeric, p_description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_ay uuid; v_bcat uuid; v_bill_id uuid;
  v_existing RECORD; v_paid numeric; v_new_final numeric; v_new_balance numeric; v_new_status text;
BEGIN
  IF p_upgrade_amount IS NULL OR p_upgrade_amount <= 0 THEN
    RETURN jsonb_build_object('action','none','new_amount',COALESCE(p_upgrade_amount,0),
                              'billed',0,'bill_id',NULL,'old_bill_id',NULL);
  END IF;
  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = p_learner_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id = v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  v_bcat := public._cl_ensure_upgrade_billing_category(p_kind);

  -- Existing live upgrade bill for the same dedup key? Accumulate onto it.
  SELECT id, final_amount, balance_amount, total_amount, bill_description
    INTO v_existing
    FROM billing_student_bills
   WHERE student_id = p_learner_lp AND hostel_year_id = p_hostel_year_id AND item_category_id = v_bcat
     AND fee_source = 'hostel_category' AND status NOT IN ('cancelled','superseded')
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_paid := COALESCE(v_existing.final_amount,0) - COALESCE(v_existing.balance_amount,0);
    v_new_final := COALESCE(v_existing.final_amount,0) + p_upgrade_amount;
    v_new_balance := v_new_final - v_paid;
    v_new_status := CASE WHEN v_paid <= 0 THEN 'unpaid'
                         WHEN v_paid >= v_new_final THEN 'paid'
                         ELSE 'partially_paid' END;
    UPDATE billing_student_bills
       SET final_amount = v_new_final,
           total_amount = COALESCE(total_amount,0) + p_upgrade_amount,
           unit_amount = v_new_final, quantity = 1,
           balance_amount = v_new_balance, status = v_new_status,
           bill_description = left(
             CASE WHEN COALESCE(v_existing.bill_description,'') = '' THEN p_description
                  ELSE v_existing.bill_description || ' + ' || p_description END, 500),
           updated_at = now()
     WHERE id = v_existing.id;
    RETURN jsonb_build_object('action','accumulated','new_amount',v_new_final,
                              'billed',p_upgrade_amount,'bill_id',v_existing.id,'old_bill_id',v_existing.id);
  END IF;

  INSERT INTO billing_student_bills (
    student_id, institution_id, academic_year_id, item_category_id, hostel_year_id, fee_source,
    bill_description, due_date, quantity, unit_amount, total_amount, final_amount, balance_amount, status
  ) VALUES (
    p_learner_lp, v_inst, v_ay, v_bcat, p_hostel_year_id, 'hostel_category',
    p_description, now() + interval '30 day', 1, p_upgrade_amount, p_upgrade_amount,
    p_upgrade_amount, p_upgrade_amount, 'unpaid'
  ) RETURNING id INTO v_bill_id;
  RETURN jsonb_build_object('action','created','new_amount',p_upgrade_amount,
                            'billed',p_upgrade_amount,'bill_id',v_bill_id,'old_bill_id',NULL);
END $function$;
