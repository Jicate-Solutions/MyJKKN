-- 20260609161000_cl_category_bill_change_helper.sql
-- Re-bill ONE hostel category component (room OR mess) for a learner in a hostel
-- year. student_id = learners_profiles.id. Mirrors the row shape inserted by
-- campus_living_generate_hostel_year_bills so downstream treats it identically.
CREATE OR REPLACE FUNCTION public._cl_apply_category_bill_change(
  p_learner_lp     uuid,   -- learners_profiles.id
  p_hostel_year_id uuid,
  p_old_item_cat   uuid,   -- old room/mess category id (nullable: never billed)
  p_new_item_cat   uuid,   -- new room/mess category id
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
    v_bill_total := p_new_amount;                       -- never billed for old category
    v_action := 'created';
  ELSIF v_paid = 0 THEN
    UPDATE billing_student_bills SET status='cancelled', updated_at=now() WHERE id = v_old_id;
    v_bill_total := p_new_amount;                       -- replace at full new amount
    v_action := 'replaced';
  ELSE
    v_bill_total := GREATEST(0, p_new_amount - v_paid); -- keep paid bill; bill only the difference
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
    ) ON CONFLICT DO NOTHING;  -- partial unique index guards a duplicate new-category bill
  END IF;

  RETURN jsonb_build_object('action', v_action, 'new_amount', p_new_amount,
                            'billed', v_bill_total, 'old_bill_id', v_old_id);
END $$;

REVOKE ALL ON FUNCTION public._cl_apply_category_bill_change(uuid,uuid,uuid,uuid,numeric,text) FROM anon, PUBLIC;
