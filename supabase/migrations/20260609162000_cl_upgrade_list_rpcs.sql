-- 20260609162000_cl_upgrade_list_rpcs.sql
-- Self-service upgrade option lists. Both reuse the latest eligibility helpers.

-- ROOM: eligible manual categories (fn_my_manual_categories already applies gender
-- + fee-aware program eligibility), priced for the current hostel year, fee >= the
-- learner's current category fee, with a live eligible+available bed count.
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
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND is_active LIMIT 1;

  RETURN QUERY
  SELECT mc.id, mc.name, mc.type, hf.amount,
         (SELECT count(*)::int FROM fn_my_room_options(mc.id))
  FROM fn_my_manual_categories() mc
  JOIN hostel_fees hf
    ON hf.hostel_category_id = mc.id AND hf.hostel_year_id = v_year AND hf.is_active
  WHERE mc.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount >= v_cur_fee
  ORDER BY hf.amount;
END $$;

-- MESS: active mess categories in the fee-aware mess allow-set (fail-open if no
-- rule/bill data), priced for the current hostel year, fee >= current mess fee.
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_mess_categories()
RETURNS TABLE (mess_category_id uuid, name text, current_year_fee numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_allow uuid[];
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT mess_category_id INTO v_cur_mess FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE mess_category_id = v_cur_mess AND hostel_year_id = v_year AND is_active LIMIT 1;
  SELECT array_agg(category_id) INTO v_allow FROM fn_hostel_learner_mess_categories(v_lp);

  RETURN QUERY
  SELECT m.id, m.name, hf.amount
  FROM mess_categories m
  JOIN hostel_fees hf
    ON hf.mess_category_id = m.id AND hf.hostel_year_id = v_year AND hf.is_active
  WHERE m.is_active
    AND (v_allow IS NULL OR m.id = ANY(v_allow))
    AND m.id <> COALESCE(v_cur_mess, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount >= v_cur_fee
  ORDER BY hf.amount;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_mess_categories() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_mess_categories() TO authenticated;
