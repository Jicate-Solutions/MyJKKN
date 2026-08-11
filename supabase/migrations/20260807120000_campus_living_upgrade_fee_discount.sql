-- 20260807120000_campus_living_upgrade_fee_discount.sql
-- Upgrade-fee discounts (Campus Living → Settings → Fee Config → Upgrade Fee).
--
-- An upgrade fee row now carries an optional concession, so the office can run
-- "₹35,000 → pay ₹5,000" offers without destroying the real list price:
--   amount         = GROSS  (the original upgrade fee — the struck-through figure)
--   discount_type  = 'amount' (flat ₹) | 'percent' (0–100)
--   discount_value = the concession in that unit
--   net_amount     = GENERATED payable, clamped at 0
--
-- WHY a GENERATED column: `amount` is read in NINE separate plpgsql functions
-- (2 resident loaders, 2 admin evaluators, 1 admin option loader, 4 billing
-- paths). Deriving the payable in SQL means each of those sites is a one-token
-- change (amount → net_amount) instead of nine hand-rolled discount formulas
-- that can drift apart. A drifted display/billing pair is a silent money bug:
-- the resident sees ₹5,000 on the card and is billed ₹35,000.
--
-- A 100% (or full-amount) discount yields net_amount = 0, which the existing
-- `<= 0` short-circuits already treat as an instant, bill-free upgrade in
-- _cl_apply_upgrade_fee_bill / _cl_upgrade_category_only / fn_cl_process_upgrade_holds.

-- 1) Schema ------------------------------------------------------------------
ALTER TABLE public.hostel_category_upgrade_fees
  ADD COLUMN IF NOT EXISTS discount_type  text          NOT NULL DEFAULT 'amount',
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.hostel_category_upgrade_fees
  DROP CONSTRAINT IF EXISTS chk_upgrade_discount_type;
ALTER TABLE public.hostel_category_upgrade_fees
  ADD CONSTRAINT chk_upgrade_discount_type CHECK (discount_type IN ('amount', 'percent'));

-- A flat discount may not exceed the gross; a percentage may not exceed 100.
-- net_amount clamps at 0 anyway, but the constraint turns an operator typo into
-- a loud error instead of a silently free upgrade.
ALTER TABLE public.hostel_category_upgrade_fees
  DROP CONSTRAINT IF EXISTS chk_upgrade_discount_bounds;
ALTER TABLE public.hostel_category_upgrade_fees
  ADD CONSTRAINT chk_upgrade_discount_bounds CHECK (
    discount_value >= 0
    AND CASE WHEN discount_type = 'percent'
             THEN discount_value <= 100
             ELSE discount_value <= amount
        END
  );

ALTER TABLE public.hostel_category_upgrade_fees
  DROP COLUMN IF EXISTS net_amount;
ALTER TABLE public.hostel_category_upgrade_fees
  ADD COLUMN net_amount numeric(12,2)
  GENERATED ALWAYS AS (
    GREATEST(0::numeric, round(
      CASE WHEN discount_type = 'percent'
           THEN amount - (amount * LEAST(discount_value, 100::numeric) / 100)
           ELSE amount - discount_value
      END, 2))
  ) STORED;

COMMENT ON COLUMN public.hostel_category_upgrade_fees.amount IS
  'GROSS upgrade fee before any discount — the struck-through list price.';
COMMENT ON COLUMN public.hostel_category_upgrade_fees.net_amount IS
  'Payable after discount (generated). Every read site bills/displays THIS, not amount.';

-- 2) Billing helper — record gross in total, net in final ---------------------
-- p_upgrade_amount stays the NET payable (all four callers already treat it as
-- "what the learner owes", and update_bill_balance_on_amount_change derives
-- balance + status from final_amount alone). p_gross_amount is additive: when
-- given, total_amount carries the pre-discount figure so the bill itself
-- evidences the concession.
--
-- DROP first, not CREATE OR REPLACE: adding a defaulted parameter to an existing
-- function creates a second OVERLOAD rather than replacing it, and the 5-arg
-- calls would then be ambiguous.
DROP FUNCTION IF EXISTS public._cl_apply_upgrade_fee_bill(uuid, uuid, text, numeric, text);

CREATE OR REPLACE FUNCTION public._cl_apply_upgrade_fee_bill(
  p_learner_lp uuid, p_hostel_year_id uuid, p_kind text,
  p_upgrade_amount numeric, p_description text,
  p_gross_amount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_inst uuid; v_ay uuid; v_bcat uuid; v_bill_id uuid; v_gross numeric;
  v_existing RECORD; v_paid numeric; v_new_final numeric; v_new_balance numeric; v_new_status text;
BEGIN
  IF p_upgrade_amount IS NULL OR p_upgrade_amount <= 0 THEN
    RETURN jsonb_build_object('action','none','new_amount',COALESCE(p_upgrade_amount,0),
                              'billed',0,'bill_id',NULL,'old_bill_id',NULL);
  END IF;
  -- Gross can never sit BELOW the payable, or total_amount < final_amount.
  v_gross := GREATEST(COALESCE(p_gross_amount, p_upgrade_amount), p_upgrade_amount);

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = p_learner_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id = v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  v_bcat := public._cl_ensure_upgrade_billing_category(p_kind);

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
           -- total accumulates the GROSS so the discount stays visible on the bill
           total_amount = COALESCE(total_amount,0) + v_gross,
           unit_amount = v_new_final, quantity = 1,
           balance_amount = v_new_balance, status = v_new_status,
           bill_description = left(
             CASE WHEN COALESCE(v_existing.bill_description,'') = '' THEN p_description
                  ELSE v_existing.bill_description || ' + ' || p_description END, 500),
           updated_at = now()
     WHERE id = v_existing.id;
    RETURN jsonb_build_object('action','accumulated','new_amount',v_new_final,
                              'billed',p_upgrade_amount,'gross',v_gross,
                              'discount',v_gross - p_upgrade_amount,
                              'bill_id',v_existing.id,'old_bill_id',v_existing.id);
  END IF;

  INSERT INTO billing_student_bills (
    student_id, institution_id, academic_year_id, item_category_id, hostel_year_id, fee_source,
    bill_description, due_date, quantity, unit_amount, total_amount, final_amount, balance_amount, status
  ) VALUES (
    p_learner_lp, v_inst, v_ay, v_bcat, p_hostel_year_id, 'hostel_category',
    p_description, now() + interval '30 day', 1, p_upgrade_amount, v_gross,
    p_upgrade_amount, p_upgrade_amount, 'unpaid'
  ) RETURNING id INTO v_bill_id;
  RETURN jsonb_build_object('action','created','new_amount',p_upgrade_amount,
                            'billed',p_upgrade_amount,'gross',v_gross,
                            'discount',v_gross - p_upgrade_amount,
                            'bill_id',v_bill_id,'old_bill_id',NULL);
END $function$;

-- DROP discards grants (EXECUTE reverts to PUBLIC) — restore the original ACL.
REVOKE EXECUTE ON FUNCTION public._cl_apply_upgrade_fee_bill(uuid,uuid,text,numeric,text,numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._cl_apply_upgrade_fee_bill(uuid,uuid,text,numeric,text,numeric) TO authenticated, service_role;

-- 3) Resident option loaders — bill net, expose gross + discount for the UI ----
DROP FUNCTION IF EXISTS public.fn_my_upgrade_room_categories();
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
RETURNS TABLE(category_id uuid, name text, type text, allocation_mode text,
              current_year_fee numeric, upgrade_fee numeric, available_beds integer,
              threshold_pct numeric, paid_pct numeric, meets_threshold boolean,
              hold_days integer, upgrade_fee_original numeric, upgrade_discount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_gender text; v_paid_pct numeric;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = auth.uid();
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  SELECT pp.paid_pct INTO v_paid_pct FROM fn_learner_academic_payment_progress(v_lp) pp;

  RETURN QUERY
  SELECT c.id, c.name, c.type, c.allocation_mode, hf.amount,
         COALESCE(
           (SELECT uf.net_amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee,
         (SELECT count(*)::int FROM fn_my_room_options(c.id)),
         c.upgrade_threshold_pct,
         v_paid_pct,
         (c.upgrade_threshold_pct IS NULL
          OR (v_paid_pct IS NOT NULL AND v_paid_pct >= c.upgrade_threshold_pct)),
         c.upgrade_hold_days,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee_original,
         COALESCE(
           (SELECT uf.amount - uf.net_amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           0
         ) AS upgrade_discount
  FROM hostel_categories c
  JOIN hostel_fees hf
    ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE c.is_active
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
    AND (NOT c.requires_explicit_upgrade
         OR EXISTS (SELECT 1 FROM hostel_category_upgrade_fees uf2
                    WHERE uf2.hostel_year_id = v_year AND uf2.is_active
                      AND uf2.from_hostel_category_id = v_cur_cat
                      AND uf2.to_hostel_category_id = c.id))
  ORDER BY hf.amount;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fn_my_upgrade_mess_categories();
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_mess_categories()
RETURNS TABLE(mess_category_id uuid, name text, current_year_fee numeric, upgrade_fee numeric,
              upgrade_fee_original numeric, upgrade_discount numeric)
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
           (SELECT uf.net_amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_mess_category_id = v_cur_mess AND uf.to_mess_category_id = m.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_mess_category_id = v_cur_mess AND uf.to_mess_category_id = m.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee_original,
         COALESCE(
           (SELECT uf.amount - uf.net_amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_mess_category_id = v_cur_mess AND uf.to_mess_category_id = m.id LIMIT 1),
           0
         ) AS upgrade_discount
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

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_mess_categories() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_my_upgrade_mess_categories() TO authenticated, service_role;

-- 4) Admin option loader ------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_cl_admin_room_upgrade_options(uuid);
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
  ORDER BY hf.amount;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_room_upgrade_options(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_room_upgrade_options(uuid) TO authenticated, service_role;

-- 5) Admin evaluators — jsonb, so no signature change (no DROP, grants intact) -
CREATE OR REPLACE FUNCTION public._cl_admin_eval_room_upgrade(p_lp uuid, p_target_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_gender text; v_gtype text;
  v_cur_cat uuid; v_cur_name text; v_cur_fee numeric := 0;
  v_t_name text; v_t_type text; v_t_mode text; v_t_active boolean; v_t_thr numeric;
  v_new_fee numeric; v_upg numeric; v_gross numeric; v_paid numeric; v_meets boolean;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN jsonb_build_object('eligible', false, 'reason', 'No current hostel year configured'); END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_lp;
  v_gtype := CASE WHEN v_gender IN ('male','m') THEN 'boys'
                  WHEN v_gender IN ('female','f') THEN 'girls' ELSE NULL END;

  SELECT name, type, allocation_mode, is_active, upgrade_threshold_pct
    INTO v_t_name, v_t_type, v_t_mode, v_t_active, v_t_thr
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

CREATE OR REPLACE FUNCTION public._cl_admin_eval_mess_upgrade(p_lp uuid, p_target_mess_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_gender text; v_gtype text;
  v_cur uuid; v_cur_name text; v_cur_fee numeric := 0;
  v_t_name text; v_t_type text; v_t_active boolean; v_new_fee numeric; v_upg numeric; v_gross numeric;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN jsonb_build_object('eligible', false, 'reason', 'No current hostel year configured'); END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_lp;
  v_gtype := CASE WHEN v_gender IN ('male','m') THEN 'boys'
                  WHEN v_gender IN ('female','f') THEN 'girls' ELSE NULL END;

  SELECT name, type, is_active INTO v_t_name, v_t_type, v_t_active FROM mess_categories WHERE id = p_target_mess_id;
  IF v_t_name IS NULL OR NOT v_t_active THEN RETURN jsonb_build_object('eligible', false, 'reason', 'Target mess category not found or inactive'); END IF;
  IF v_gtype IS NULL OR v_t_type IS DISTINCT FROM v_gtype THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Mess category does not match learner gender',
      'target_category_id', p_target_mess_id, 'target_category_name', v_t_name);
  END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees WHERE mess_category_id = p_target_mess_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Target has no published fee for the current hostel year',
      'target_category_id', p_target_mess_id, 'target_category_name', v_t_name);
  END IF;

  SELECT mess_category_id INTO v_cur FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM mess_categories WHERE id = v_cur;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees WHERE mess_category_id = v_cur AND hostel_year_id = v_year AND is_active LIMIT 1;

  IF v_cur = p_target_mess_id THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Already on this mess category',
      'current_category_id', v_cur, 'current_category_name', v_cur_name,
      'target_category_id', p_target_mess_id, 'target_category_name', v_t_name);
  END IF;
  IF v_new_fee <= v_cur_fee THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'Not an upgrade (target fee <= current fee)',
      'current_category_id', v_cur, 'current_category_name', v_cur_name,
      'target_category_id', p_target_mess_id, 'target_category_name', v_t_name);
  END IF;

  SELECT uf.net_amount, uf.amount INTO v_upg, v_gross FROM hostel_category_upgrade_fees uf
    WHERE uf.hostel_year_id = v_year AND uf.is_active
      AND uf.from_mess_category_id = v_cur AND uf.to_mess_category_id = p_target_mess_id LIMIT 1;
  IF v_upg IS NULL THEN
    v_upg := v_new_fee - v_cur_fee;
    v_gross := v_upg;
  END IF;

  RETURN jsonb_build_object('eligible', true, 'reason', NULL,
    'current_category_id', v_cur, 'current_category_name', v_cur_name,
    'target_category_id', p_target_mess_id, 'target_category_name', v_t_name,
    'current_fee', v_cur_fee, 'target_fee', v_new_fee, 'upgrade_fee', v_upg,
    'upgrade_fee_original', v_gross, 'upgrade_discount', v_gross - v_upg);
END $function$;

-- 6) Billing paths — charge net, stamp gross on the bill ----------------------
CREATE OR REPLACE FUNCTION public._cl_execute_room_upgrade(p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid, p_bed_id uuid, p_from_hold boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric; v_gross numeric;
  v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb; v_linked_bill uuid;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF p_from_hold THEN
    IF v_bed_status IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'Held bed is no longer reserved'; END IF;
  ELSE
    IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;
  END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id, batch_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = p_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No active allocation to upgrade from'; END IF;

  -- 2026-08-06: check_out_date is what hostel_allocations_room_bed_active_uidx
  -- reads. Without it the vacated row keeps reserving (room_id, bed_id) and the
  -- old bed can never be re-used, even though hostel_beds says 'available'.
  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE,
         check_out_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, batch_id
  )
  SELECT v_old.institution_id, p_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, p_profile, v_old.batch_id
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=p_profile WHERE id = p_bed_id;

  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;

  SELECT upgrade_bill_id INTO v_linked_bill FROM hostel_waitlist
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting'
     AND upgrade_bill_id IS NOT NULL
   LIMIT 1;
  IF v_linked_bill IS NULL THEN
    SELECT uf.net_amount, uf.amount INTO v_upgrade_fee, v_gross FROM hostel_category_upgrade_fees uf
      WHERE uf.hostel_year_id = v_year AND uf.is_active
        AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = p_new_category_id LIMIT 1;
    IF v_upgrade_fee IS NULL THEN
      v_upgrade_fee := v_new_fee - v_cur_fee;
      v_gross := v_upgrade_fee;
    END IF;
    v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
                format('Hostel room upgrade: %s -> %s%s', COALESCE(v_cur_name,'-'), v_new_name,
                       CASE WHEN v_gross > v_upgrade_fee
                            THEN format(' (discount Rs.%s)', trim(to_char(v_gross - v_upgrade_fee, 'FM999999990.99')))
                            ELSE '' END),
                v_gross);
  ELSE
    v_upgrade_fee := NULL;
    v_bill := jsonb_build_object('action','linked','bill_id',v_linked_bill);
  END IF;

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc,
         held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'state', 'upgraded',
    'old_allocation_id', v_old.id, 'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee,
    'upgrade_fee_original', v_gross, 'bill', v_bill);
END $function$;

CREATE OR REPLACE FUNCTION public._cl_upgrade_category_only(p_profile uuid, p_lp uuid, p_new_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text; v_upgrade_fee numeric; v_gross numeric; v_hold_days int;
  v_inst uuid; v_ay uuid; v_bill jsonb; v_bill_id uuid; v_wl uuid;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name, upgrade_hold_days INTO v_new_name, v_hold_days FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id, institution_id, academic_year_id INTO v_cur_cat, v_inst, v_ay
    FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  SELECT uf.net_amount, uf.amount INTO v_upgrade_fee, v_gross FROM hostel_category_upgrade_fees uf
    WHERE uf.hostel_year_id = v_year AND uf.is_active
      AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = p_new_category_id LIMIT 1;
  IF v_upgrade_fee IS NULL THEN
    v_upgrade_fee := v_new_fee - v_cur_fee;
    v_gross := v_upgrade_fee;
  END IF;

  -- Fully-discounted (or free) upgrade: flip the category now, bill nothing.
  IF COALESCE(v_upgrade_fee,0) <= 0 THEN
    UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;
    RETURN jsonb_build_object('success', true, 'state', 'upgraded',
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id, 'upgrade_fee', 0,
      'upgrade_fee_original', v_gross, 'upgrade_discount', COALESCE(v_gross,0));
  END IF;

  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id=p_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id IS NULL AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id=bb.id);
  UPDATE hostel_waitlist SET status='declined', updated_at=now()
   WHERE learner_id=p_profile AND entry_kind='upgrade' AND status='waiting'
     AND held_bed_id IS NULL AND target_hostel_category_id <> p_new_category_id;

  SELECT id, upgrade_bill_id INTO v_wl, v_bill_id FROM hostel_waitlist
    WHERE learner_id=p_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NULL AND target_hostel_category_id = p_new_category_id LIMIT 1;
  IF v_bill_id IS NOT NULL THEN
    UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_wl;
    UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_wl,
      'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee, 'upgrade_fee_original', v_gross,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id);
  END IF;

  v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
              format('Hostel category upgrade: %s -> %s%s', COALESCE(v_cur_name,'-'), v_new_name,
                     CASE WHEN v_gross > v_upgrade_fee
                          THEN format(' (discount Rs.%s)', trim(to_char(v_gross - v_upgrade_fee, 'FM999999990.99')))
                          ELSE '' END),
              v_gross);
  v_bill_id := (v_bill->>'bill_id')::uuid;

  UPDATE billing_student_bills
     SET due_date = now() + make_interval(days => COALESCE(v_hold_days, 30))
   WHERE id = v_bill_id;

  IF v_wl IS NOT NULL THEN
    UPDATE hostel_waitlist SET upgrade_bill_id=v_bill_id,
      hold_expires_at = now() + make_interval(days => COALESCE(v_hold_days, 5)), updated_at=now() WHERE id=v_wl;
  ELSE
    INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at, upgrade_bill_id)
    VALUES (v_inst, p_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, NULL, NULL, now() + make_interval(days => COALESCE(v_hold_days, 5)), v_bill_id) RETURNING id INTO v_wl;
  END IF;

  UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_wl;
  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;

  RETURN jsonb_build_object('success', true, 'state', 'pending_payment', 'waitlist_id', v_wl,
    'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee, 'upgrade_fee_original', v_gross,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee);
END $function$;

CREATE OR REPLACE FUNCTION public._cl_upgrade_mess_category(p_lp uuid, p_new_mess_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric; v_gross numeric; v_bill jsonb;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE mess_category_id = p_new_mess_category_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected mess category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM mess_categories WHERE id = p_new_mess_category_id;

  SELECT lp.mess_category_id INTO v_cur_mess FROM learners_profiles lp WHERE lp.id = p_lp;
  SELECT name INTO v_cur_name FROM mess_categories WHERE id = v_cur_mess;
  SELECT COALESCE(hf.amount,0) INTO v_cur_fee FROM hostel_fees hf
    WHERE hf.mess_category_id = v_cur_mess AND hf.hostel_year_id = v_year AND hf.is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  UPDATE learners_profiles SET mess_category_id = p_new_mess_category_id, updated_at=now() WHERE id = p_lp;

  SELECT uf.net_amount, uf.amount INTO v_upgrade_fee, v_gross FROM hostel_category_upgrade_fees uf
    WHERE uf.hostel_year_id = v_year AND uf.is_active
      AND uf.from_mess_category_id = v_cur_mess AND uf.to_mess_category_id = p_new_mess_category_id LIMIT 1;
  IF v_upgrade_fee IS NULL THEN
    v_upgrade_fee := v_new_fee - v_cur_fee;
    v_gross := v_upgrade_fee;
  END IF;
  v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'mess', v_upgrade_fee,
              format('Mess upgrade: %s -> %s%s', COALESCE(v_cur_name,'-'), v_new_name,
                     CASE WHEN v_gross > v_upgrade_fee
                          THEN format(' (discount Rs.%s)', trim(to_char(v_gross - v_upgrade_fee, 'FM999999990.99')))
                          ELSE '' END),
              v_gross);

  RETURN jsonb_build_object('success', true, 'old_category_id', v_cur_mess,
    'new_category_id', p_new_mess_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee,
    'upgrade_fee', v_upgrade_fee, 'upgrade_fee_original', v_gross,
    'upgrade_discount', v_gross - v_upgrade_fee, 'bill', v_bill);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_cl_process_upgrade_holds(p_student_lp uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_row RECORD; v_gate jsonb; v_count int := 0;
  v_has_alloc boolean; v_year uuid; v_cur_cat uuid; v_cur_fee numeric;
  v_new_fee numeric; v_cur_name text; v_new_name text;
  v_upgrade_fee numeric; v_gross numeric; v_bill jsonb; v_bill_id uuid;
  v_bill_amount numeric; v_bill_paid numeric; v_bill_status text;
  v_existing_alloc uuid;
BEGIN
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_student_lp;
  IF v_profile IS NULL THEN RETURN 0; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;

  FOR v_row IN
    SELECT id, target_hostel_category_id, held_room_id, held_bed_id, upgrade_bill_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NOT NULL AND hold_expires_at > now()
    ORDER BY created_at
  LOOP
    BEGIN
      -- 2026-08-15: idempotency — if the learner already lives on the held
      -- bed (the expiry cron confirms lapsed reservations as move-ins now),
      -- stamp the row instead of double-allocating. The partial unique index
      -- hostel_allocations_room_bed_active_uidx would refuse the duplicate
      -- INSERT, and that error must not be the control flow.
      SELECT id INTO v_existing_alloc FROM hostel_allocations
       WHERE learner_id = v_profile AND status = 'active'
         AND room_id = v_row.held_room_id AND bed_id = v_row.held_bed_id
       LIMIT 1;
      IF v_existing_alloc IS NOT NULL THEN
        UPDATE hostel_waitlist
           SET status='allocated', allocated_allocation_id=v_existing_alloc,
               held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
         WHERE id = v_row.id;
        v_count := v_count + 1; CONTINUE;
      END IF;
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
        SELECT uf.net_amount, uf.amount INTO v_upgrade_fee, v_gross FROM hostel_category_upgrade_fees uf
          WHERE uf.hostel_year_id = v_year AND uf.is_active
            AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = v_row.target_hostel_category_id LIMIT 1;
        IF v_upgrade_fee IS NULL THEN
          v_upgrade_fee := COALESCE(v_new_fee,0) - COALESCE(v_cur_fee,0);
          v_gross := v_upgrade_fee;
        END IF;
        -- Fully-discounted: no bill to wait on, move the resident in now.
        IF COALESCE(v_upgrade_fee, 0) <= 0 THEN
          PERFORM public._cl_execute_room_upgrade(v_profile, p_student_lp, v_row.target_hostel_category_id,
            v_row.held_room_id, v_row.held_bed_id, true);
          v_count := v_count + 1; CONTINUE;
        END IF;
        SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
        SELECT name INTO v_new_name FROM hostel_categories WHERE id = v_row.target_hostel_category_id;
        v_bill := public._cl_apply_upgrade_fee_bill(p_student_lp, v_year, 'hostel', v_upgrade_fee,
                    format('Hostel room upgrade: %s -> %s%s', COALESCE(v_cur_name,'-'), v_new_name,
                           CASE WHEN v_gross > v_upgrade_fee
                                THEN format(' (discount Rs.%s)', trim(to_char(v_gross - v_upgrade_fee, 'FM999999990.99')))
                                ELSE '' END),
                    v_gross);
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

  FOR v_row IN
    SELECT id, target_hostel_category_id, upgrade_bill_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NULL AND upgrade_bill_id IS NOT NULL
    ORDER BY created_at
  LOOP
    BEGIN
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF NOT (v_gate->>'meets')::boolean THEN CONTINUE; END IF;
      SELECT final_amount, status INTO v_bill_amount, v_bill_status FROM billing_student_bills WHERE id = v_row.upgrade_bill_id;
      IF v_bill_amount IS NULL OR v_bill_status IN ('cancelled','superseded') THEN CONTINUE; END IF;
      SELECT COALESCE(SUM(ri.amount_paid),0) INTO v_bill_paid FROM billing_receipt_items ri WHERE ri.bill_id = v_row.upgrade_bill_id;
      IF v_bill_paid >= v_bill_amount THEN
        UPDATE learners_profiles SET hostel_category_id = v_row.target_hostel_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_student_lp;
        UPDATE hostel_waitlist SET status='allocated', updated_at=now() WHERE id = v_row.id;
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_cl_process_upgrade_holds (category): % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;

  RETURN v_count;
END $function$;
