-- 20260605161000_campus_living_resolve_hostel_fee.sql
-- Resolve a hosteller's hostel/mess fee for a given hostel year.
-- Returns jsonb array: [{fee_source, package_id, category_id, category_name, amount}].
CREATE OR REPLACE FUNCTION public.campus_living_resolve_hostel_fee(
  p_learner_id uuid,
  p_hostel_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lp           learners_profiles%ROWTYPE;
  v_package_id uuid;
  v_flat       numeric;
  v_items      jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO lp FROM learners_profiles WHERE id = p_learner_id;
  IF NOT FOUND THEN RETURN v_items; END IF;

  -- 1) Explicit assignment overrides matching.
  SELECT lpa.package_id INTO v_package_id
  FROM learner_package_assignment lpa
  WHERE lpa.learner_id = p_learner_id AND lpa.hostel_year_id = p_hostel_year_id
  LIMIT 1;

  -- 2) Else match an active package by the learner's fixed dims (NULL package dim = wildcard).
  IF v_package_id IS NULL THEN
    SELECT p.id INTO v_package_id
    FROM admission_packages p
    WHERE p.is_active
      AND p.institution_id   = lp.institution_id
      AND (p.admission_year_id IS NULL OR p.admission_year_id = lp.admission_year_id)
      AND (p.degree_id        IS NULL OR p.degree_id        = lp.degree_id)
      AND (p.department_id     IS NULL OR p.department_id     = lp.department_id)
      AND (p.programme_id      IS NULL OR p.programme_id      = lp.program_id)
      AND (p.quota_id          IS NULL OR p.quota_id          = lp.quota_id)
      AND (p.gender            IS NULL OR upper(p.gender)      = upper(lp.gender))
      AND (p.room_category_id  IS NULL OR p.room_category_id  = lp.hostel_category_id)
      AND (p.mess_category_id  IS NULL OR p.mess_category_id  = lp.mess_category_id)
    ORDER BY
      (p.admission_year_id IS NOT NULL)::int + (p.programme_id IS NOT NULL)::int
      + (p.quota_id IS NOT NULL)::int + (p.gender IS NOT NULL)::int DESC
    LIMIT 1;
  END IF;

  IF v_package_id IS NULL THEN RETURN v_items; END IF;

  -- 3) Prefer a flat package fee for (package, hostel year).
  SELECT hf.amount INTO v_flat
  FROM hostel_fees hf
  WHERE hf.package_id = v_package_id AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
  LIMIT 1;

  IF v_flat IS NOT NULL THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'fee_source','hostel_package','package_id',v_package_id,
      'category_id',NULL,'category_name','Hostel Package','amount',v_flat));
  END IF;

  -- 4) Else sum the learner's room + mess category fees for the hostel year.
  SELECT jsonb_agg(jsonb_build_object(
           'fee_source','hostel_category','package_id',v_package_id,
           'category_id',cat_id,'category_name',cat_name,'amount',amount))
  INTO v_items
  FROM (
    SELECT hc.id AS cat_id, hc.name AS cat_name, hf.amount
    FROM hostel_fees hf JOIN hostel_categories hc ON hc.id = hf.hostel_category_id
    WHERE hf.hostel_category_id = lp.hostel_category_id
      AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
    UNION ALL
    SELECT mc.id, mc.name, hf.amount
    FROM hostel_fees hf JOIN mess_categories mc ON mc.id = hf.mess_category_id
    WHERE hf.mess_category_id = lp.mess_category_id
      AND hf.mess_category_id IS NOT NULL
      AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
  ) rows;

  RETURN COALESCE(v_items, '[]'::jsonb);
END $$;
