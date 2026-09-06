-- Campus Living — upgrade-fee bills must carry the academic year.
-- _cl_apply_upgrade_fee_bill omitted academic_year_id, so every hostel upgrade bill (room
-- and category) was generated with a NULL academic year. Set it to the learner's current
-- academic year (their learners_profiles.academic_year_id, else the institution's active AY).
CREATE OR REPLACE FUNCTION public._cl_apply_upgrade_fee_bill(p_learner_lp uuid, p_hostel_year_id uuid, p_kind text, p_upgrade_amount numeric, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_ay uuid; v_bcat uuid; v_bill_id uuid;
BEGIN
  IF p_upgrade_amount IS NULL OR p_upgrade_amount <= 0 THEN
    RETURN jsonb_build_object('action','none','new_amount',COALESCE(p_upgrade_amount,0),
                              'billed',0,'bill_id',NULL,'old_bill_id',NULL);
  END IF;
  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = p_learner_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id = v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  v_bcat := public._cl_ensure_upgrade_billing_category(p_kind);
  INSERT INTO billing_student_bills (
    student_id, institution_id, academic_year_id, item_category_id, hostel_year_id, fee_source,
    bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
    balance_amount, status
  ) VALUES (
    p_learner_lp, v_inst, v_ay, v_bcat, p_hostel_year_id, 'hostel_category',
    p_description, now() + interval '30 day', 1, p_upgrade_amount, p_upgrade_amount,
    p_upgrade_amount, p_upgrade_amount, 'unpaid'
  ) RETURNING id INTO v_bill_id;
  RETURN jsonb_build_object('action','created','new_amount',p_upgrade_amount,
                            'billed',p_upgrade_amount,'bill_id',v_bill_id,'old_bill_id',NULL);
END $function$;

-- Backfill upgrade bills already generated without an academic year.
UPDATE billing_student_bills bb
SET academic_year_id = COALESCE(lp.academic_year_id,
      (SELECT id FROM academic_years WHERE institution_id = bb.institution_id AND is_active ORDER BY start_date DESC LIMIT 1))
FROM learners_profiles lp
WHERE bb.student_id = lp.id
  AND bb.fee_source = 'hostel_category'
  AND bb.academic_year_id IS NULL;
