-- 20260807160000_campus_living_admin_honours_curated_ladder.sql
-- Make the OFFICE-side upgrade paths obey the same curated ladder as the resident.
--
-- 20260807140000 turned on requires_explicit_upgrade for every active room category,
-- so hostel_category_upgrade_fees is now the single source of truth for which
-- from->to moves exist. fn_my_upgrade_room_categories already honours that flag, but
-- the two admin entry points did NOT — they still offered any higher-priced category.
-- Left alone, the office console and the bulk-upgrade RPC would present (and execute)
-- edges the resident can't see and that the institution never configured.

CREATE OR REPLACE FUNCTION public.fn_cl_admin_room_upgrade_options(p_learner_id uuid)
RETURNS TABLE(category_id uuid, name text, type text, allocation_mode text,
              current_year_fee numeric, upgrade_fee numeric, available_beds integer,
              threshold_pct numeric, paid_pct numeric, meets_threshold boolean,
              hold_days integer, upgrade_fee_original numeric, upgrade_discount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_gender text; v_paid_pct numeric; v_profile uuid;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_learner_id;
  SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = p_learner_id;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_learner_id;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  SELECT pp.paid_pct INTO v_paid_pct FROM fn_learner_academic_payment_progress(p_learner_id) pp;

  RETURN QUERY
  SELECT c.id, c.name, c.type, c.allocation_mode, hf.amount,
         COALESCE(
           (SELECT uf.net_amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee) AS upgrade_fee,
         (SELECT count(*)::int FROM _cl_room_options(v_profile, p_learner_id, c.id)),
         c.upgrade_threshold_pct,
         v_paid_pct,
         (c.upgrade_threshold_pct IS NULL OR (v_paid_pct IS NOT NULL AND v_paid_pct >= c.upgrade_threshold_pct)),
         c.upgrade_hold_days,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee) AS upgrade_fee_original,
         COALESCE(
           (SELECT uf.amount - uf.net_amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           0) AS upgrade_discount
  FROM hostel_categories c
  JOIN hostel_fees hf ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE c.is_active AND c.allocation_mode = 'manual'
    AND ((v_gender IN ('male','m') AND c.type='boys') OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
    -- Same curated-ladder gate the resident sees.
    AND (NOT c.requires_explicit_upgrade
         OR EXISTS (SELECT 1 FROM hostel_category_upgrade_fees uf2
                    WHERE uf2.hostel_year_id = v_year AND uf2.is_active
                      AND uf2.from_hostel_category_id = v_cur_cat
                      AND uf2.to_hostel_category_id = c.id))
  ORDER BY hf.amount;
END $function$;

-- Bulk / single admin upgrade evaluator: refuse an unconfigured pair outright.
CREATE OR REPLACE FUNCTION public._cl_admin_eval_room_upgrade(p_lp uuid, p_target_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_gender text; v_gtype text;
  v_cur_cat uuid; v_cur_name text; v_cur_fee numeric := 0;
  v_t_name text; v_t_type text; v_t_mode text; v_t_active boolean; v_t_thr numeric;
  v_t_explicit boolean;
  v_new_fee numeric; v_upg numeric; v_gross numeric; v_paid numeric; v_meets boolean;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN jsonb_build_object('eligible', false, 'reason', 'No current hostel year configured'); END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_lp;
  v_gtype := CASE WHEN v_gender IN ('male','m') THEN 'boys'
                  WHEN v_gender IN ('female','f') THEN 'girls' ELSE NULL END;

  SELECT name, type, allocation_mode, is_active, upgrade_threshold_pct, requires_explicit_upgrade
    INTO v_t_name, v_t_type, v_t_mode, v_t_active, v_t_thr, v_t_explicit
    FROM hostel_categories WHERE id = p_target_category_id;
  IF v_t_name IS NULL OR NOT v_t_active THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Target category not found or inactive');
  END IF;
  IF v_t_mode IS DISTINCT FROM 'auto' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Manual category -- upgrade this learner individually with a room selection',
      'target_category_id', p_target_category_id, 'target_category_name', v_t_name);
  END IF;
  IF v_gtype IS NULL OR v_t_type IS DISTINCT FROM v_gtype THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Category does not match learner gender',
      'target_category_id', p_target_category_id, 'target_category_name', v_t_name);
  END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_target_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Target has no published fee for the current hostel year',
      'target_category_id', p_target_category_id, 'target_category_name', v_t_name);
  END IF;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;

  IF v_cur_cat = p_target_category_id THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Already on this category',
      'current_category_id', v_cur_cat, 'current_category_name', v_cur_name,
      'target_category_id', p_target_category_id, 'target_category_name', v_t_name);
  END IF;
  IF v_new_fee <= v_cur_fee THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Not an upgrade (target fee <= current fee)',
      'current_category_id', v_cur_cat, 'current_category_name', v_cur_name,
      'target_category_id', p_target_category_id, 'target_category_name', v_t_name);
  END IF;

  SELECT uf.net_amount, uf.amount INTO v_upg, v_gross FROM hostel_category_upgrade_fees uf
    WHERE uf.hostel_year_id = v_year AND uf.is_active
      AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = p_target_category_id LIMIT 1;

  -- Curated ladder: an explicit-only target is reachable ONLY from a configured source.
  IF COALESCE(v_t_explicit, false) AND v_upg IS NULL THEN
    RETURN jsonb_build_object('eligible', false,
      'reason', format('No configured upgrade path from %s to %s (Campus Living > Settings > Fee Config > Upgrade Fee)',
                       COALESCE(v_cur_name,'-'), v_t_name),
      'current_category_id', v_cur_cat, 'current_category_name', v_cur_name,
      'target_category_id', p_target_category_id, 'target_category_name', v_t_name);
  END IF;

  IF v_upg IS NULL THEN
    v_upg := v_new_fee - v_cur_fee;
    v_gross := v_upg;
  END IF;

  SELECT pp.paid_pct INTO v_paid FROM fn_learner_academic_payment_progress(p_lp) pp;
  v_meets := (v_t_thr IS NULL) OR (v_paid IS NOT NULL AND v_paid >= v_t_thr);

  RETURN jsonb_build_object(
    'eligible', true, 'reason', NULL,
    'current_category_id', v_cur_cat, 'current_category_name', v_cur_name,
    'target_category_id', p_target_category_id, 'target_category_name', v_t_name,
    'current_fee', v_cur_fee, 'target_fee', v_new_fee, 'upgrade_fee', v_upg,
    'upgrade_fee_original', v_gross, 'upgrade_discount', v_gross - v_upg,
    'threshold_pct', v_t_thr, 'paid_pct', v_paid, 'meets_threshold', v_meets);
END $function$;
