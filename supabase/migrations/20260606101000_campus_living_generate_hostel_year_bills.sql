-- campus_living_generate_hostel_year_bills
-- For each hosteller in p_learner_ids, compute the combined bill set for p_hostel_year_id:
--   year-of-study-filtered academic items + hostel/mess items.
-- Dedup against existing (student, hostel_year, category|package) bills.
-- p_dry_run=true: return the plan without inserting. false: insert new bills idempotently.
CREATE OR REPLACE FUNCTION public.campus_living_generate_hostel_year_bills(
  p_hostel_year_id uuid,
  p_learner_ids    uuid[],
  p_dry_run        boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result      jsonb := '[]'::jsonb;
  v_learner     uuid;
  lp            learners_profiles%ROWTYPE;
  v_year        int;
  v_academic    jsonb;
  v_hostel      jsonb;
  v_item        jsonb;
  v_proposed    jsonb;
  v_skipped     jsonb;
  v_new         int;
  v_exists      boolean;
  v_cat         uuid;
  v_pkg         uuid;
  v_src         text;
BEGIN
  -- permission gate (reuse campus_living.fees.config or the new fees.generate key)
  IF NOT public.user_has_permission('campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config' USING ERRCODE = '42501';
  END IF;

  FOREACH v_learner IN ARRAY p_learner_ids LOOP
    SELECT * INTO lp FROM learners_profiles WHERE id = v_learner;
    CONTINUE WHEN NOT FOUND;
    -- hostellers only
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM accommodation_types a WHERE a.id = lp.accommodation_type_id AND a.code = 'hostel');

    v_year     := COALESCE(public.fn_learner_year_of_study(v_learner), 1);
    v_academic := public.admission_resolve_fee_items_readonly(v_learner, v_year);
    v_hostel   := public.campus_living_resolve_hostel_fee(v_learner, p_hostel_year_id);
    v_proposed := '[]'::jsonb; v_skipped := '[]'::jsonb; v_new := 0;

    -- academic items (fee_source='academic', keyed by billing_category_id)
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_academic,'[]'::jsonb)) LOOP
      v_cat := (v_item->>'billing_category_id')::uuid; v_src := 'academic';
      SELECT EXISTS(SELECT 1 FROM billing_student_bills b
        WHERE b.student_id = v_learner AND b.hostel_year_id = p_hostel_year_id
          AND b.item_category_id = v_cat AND b.fee_source IN ('academic','hostel_category')
          AND b.status <> 'cancelled') INTO v_exists;
      IF v_exists THEN v_skipped := v_skipped || v_item;
      ELSE
        v_proposed := v_proposed || (v_item || jsonb_build_object('fee_source',v_src));
        IF NOT p_dry_run THEN
          INSERT INTO billing_student_bills (student_id, institution_id, item_category_id,
            hostel_year_id, fee_source, applies_year_of_study, bill_description, due_date,
            quantity, unit_amount, total_amount, final_amount, balance_amount, status)
          VALUES (v_learner, lp.institution_id, v_cat, p_hostel_year_id, v_src, v_year,
            v_item->>'category_name', now()+interval '30 day', 1,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric, 'unpaid')
          ON CONFLICT DO NOTHING;  -- partial unique index is the final guard
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;

    -- hostel/mess items (fee_source from resolver: hostel_package | hostel_category)
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_hostel,'[]'::jsonb)) LOOP
      v_src := v_item->>'fee_source'; v_cat := NULLIF(v_item->>'category_id','')::uuid;
      v_pkg := NULLIF(v_item->>'package_id','')::uuid;
      IF v_src = 'hostel_package' THEN
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.package_id=v_pkg
          AND b.fee_source='hostel_package' AND b.status<>'cancelled') INTO v_exists;
      ELSE
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.item_category_id=v_cat
          AND b.fee_source IN ('academic','hostel_category') AND b.status<>'cancelled') INTO v_exists;
      END IF;
      IF v_exists THEN v_skipped := v_skipped || v_item;
      ELSE
        v_proposed := v_proposed || v_item;
        IF NOT p_dry_run THEN
          INSERT INTO billing_student_bills (student_id, institution_id, item_category_id,
            hostel_year_id, package_id, fee_source, bill_description, due_date,
            quantity, unit_amount, total_amount, final_amount, balance_amount, status)
          VALUES (v_learner, lp.institution_id, v_cat, p_hostel_year_id, v_pkg, v_src,
            v_item->>'category_name', now()+interval '30 day', 1,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric, 'unpaid')
          ON CONFLICT DO NOTHING;  -- partial unique index is the final guard
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;

    v_result := v_result || jsonb_build_object(
      'learner_id', v_learner, 'year_of_study', v_year,
      'proposed', v_proposed, 'skipped', v_skipped, 'new_count', v_new);
  END LOOP;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.campus_living_generate_hostel_year_bills(uuid, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campus_living_generate_hostel_year_bills(uuid, uuid[], boolean) TO authenticated;
