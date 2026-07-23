-- 20260610220000_upgrade_options_bypass_eligibility.sql
-- BUG: My Hostel showed NO upgrade options. fn_my_upgrade_room/mess_categories gated the
-- target list on FEE-AWARE eligibility (fn_my_manual_categories / fn_hostel_learner_mess_
-- categories), so a resident eligible only for their fee-band category (e.g. Deluxe) never
-- saw a HIGHER category (Premium) — defeating the upgrade-fee feature entirely. The upgrade
-- IS the paid path beyond base eligibility: the configured upgrade fee (or fallback diff) is
-- the price, not a second eligibility check.
--
-- FIX: offer ANY higher-base-fee category (gender-matched, active; room: allocation_mode
-- 'manual' since those are the premium tiers and have bed options). Drop the fee-eligibility
-- allow-set from both option loaders AND from the mess upgrade ACTION (else the option shows
-- but fn_self_upgrade_mess_category rejects it). Room option beds are still physical-rule +
-- gender + institution gated by fn_my_room_options (unchanged). Downgrade guard stays.

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
RETURNS TABLE(category_id uuid, name text, type text, current_year_fee numeric,
              upgrade_fee numeric, available_beds integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_gender text;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = auth.uid();
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;

  RETURN QUERY
  SELECT c.id, c.name, c.type, hf.amount,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee,
         (SELECT count(*)::int FROM fn_my_room_options(c.id))
  FROM hostel_categories c
  JOIN hostel_fees hf
    ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE c.is_active AND c.allocation_mode = 'manual'
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
  ORDER BY hf.amount;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_mess_categories()
RETURNS TABLE(mess_category_id uuid, name text, current_year_fee numeric, upgrade_fee numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_gender text;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT lp.mess_category_id INTO v_cur_mess FROM learners_profiles lp WHERE lp.id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = auth.uid();
  SELECT COALESCE(hf.amount,0) INTO v_cur_fee FROM hostel_fees hf
    WHERE hf.mess_category_id = v_cur_mess AND hf.hostel_year_id = v_year AND hf.is_active LIMIT 1;

  RETURN QUERY
  SELECT m.id, m.name, hf.amount,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_mess_category_id = v_cur_mess AND uf.to_mess_category_id = m.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee
  FROM mess_categories m
  JOIN hostel_fees hf
    ON hf.mess_category_id = m.id AND hf.hostel_year_id = v_year AND hf.is_active
  WHERE m.is_active
    AND ((v_gender IN ('male','m')   AND m.type='boys')
         OR (v_gender IN ('female','f') AND m.type='girls'))
    AND m.id <> COALESCE(v_cur_mess, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
  ORDER BY hf.amount;
END $function$;

-- Mess upgrade ACTION: drop the fee-eligibility allow-set check (the upgrade fee is the
-- gate now). Downgrade guard + flat upgrade-fee billing unchanged.
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_mess_category(p_new_mess_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric; v_bill jsonb;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RAISE EXCEPTION 'Only a hostel resident can upgrade'; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE mess_category_id = p_new_mess_category_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected mess category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM mess_categories WHERE id = p_new_mess_category_id;

  SELECT lp.mess_category_id INTO v_cur_mess FROM learners_profiles lp WHERE lp.id = v_lp;
  SELECT name INTO v_cur_name FROM mess_categories WHERE id = v_cur_mess;
  SELECT COALESCE(hf.amount,0) INTO v_cur_fee FROM hostel_fees hf
    WHERE hf.mess_category_id = v_cur_mess AND hf.hostel_year_id = v_year AND hf.is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  UPDATE learners_profiles SET mess_category_id = p_new_mess_category_id, updated_at=now() WHERE id = v_lp;

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_mess_category_id = v_cur_mess AND to_mess_category_id = p_new_mess_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
  v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'mess', v_upgrade_fee,
              format('Mess upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));

  RETURN jsonb_build_object('success', true, 'old_category_id', v_cur_mess,
    'new_category_id', p_new_mess_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee,
    'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $function$;
