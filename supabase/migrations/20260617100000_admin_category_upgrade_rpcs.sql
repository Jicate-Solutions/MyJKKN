-- =====================================================================
-- Admin category-upgrade RPCs (single + bulk)            2026-06-17
--
-- Lets campus-living admins/wardens upgrade a learner's ROOM (auto
-- allocation-mode categories only -- Classic/Deluxe; the room is assigned
-- later by auto-allocation) and MESS category on the learner's behalf,
-- following the SAME lifecycle as the self-service My Hostel upgrade:
--   - optimistic category flip now
--   - upgrade-fee bill generated
--   - hostel_waitlist hold -> auto-confirm on payment (receipt trigger
--     _on_receipt_item_process_upgrade_holds) / auto-revert on expiry
--     (hourly cron fn_cl_expire_upgrade_holds). BOTH are creator-agnostic,
--     so admin-initiated upgrades inherit confirm/revert for free.
--
-- Design notes:
--   1. The body of fn_self_upgrade_category_only / fn_self_upgrade_mess_category
--      is extracted verbatim into identity-parametrized cores (_cl_upgrade_*),
--      so the self and admin paths share ONE implementation (no logic drift --
--      a recurring bug class in this codebase). The self functions become thin
--      wrappers (own-identity resolution + self-service gates). Their
--      signatures are unchanged, so the service/hook/UI layers are untouched.
--   2. The admin entry point is a single bulk RPC (fn_cl_admin_bulk_upgrade)
--      used for both single-row (one-element array) and bulk; p_dry_run=true
--      powers the preview table without writing.
--   3. The self-service "upgrades_enabled" toggle gates ONLY the self path
--      (it is an opt-in for LEARNER self-service). Admins can upgrade
--      regardless -- that is the point of an office-side override.
--   4. Bulk room upgrades are restricted to allocation_mode='auto' categories
--      (no per-learner room/bed selection); manual categories (e.g. Premium)
--      stay on the per-learner self-service / single flow.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Core: room category-only upgrade (identity-parametrized).
-- Extracted from fn_self_upgrade_category_only; auth.uid()->p_profile,
-- get_my_learner_id()->p_lp. NO user_is_hosteler() / upgrades_enabled gates
-- (those live in the self wrapper).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cl_upgrade_category_only(
  p_profile uuid, p_lp uuid, p_new_category_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text; v_upgrade_fee numeric; v_hold_days int;
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

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);

  IF COALESCE(v_upgrade_fee,0) <= 0 THEN
    UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;
    RETURN jsonb_build_object('success', true, 'state', 'upgraded',
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id, 'upgrade_fee', 0);
  END IF;

  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  -- Supersede any other in-flight category-only upgrade (different target) for this learner.
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
      'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id);
  END IF;

  v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
              format('Hostel category upgrade: %s -> %s', COALESCE(v_cur_name,'-'), v_new_name));
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
    'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee);
END $$;

-- ---------------------------------------------------------------------
-- Core: mess category upgrade (identity-parametrized).
-- Extracted from fn_self_upgrade_mess_category. Immediate flip + bill
-- (no waitlist / pay-to-confirm -- same as self).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cl_upgrade_mess_category(
  p_lp uuid, p_new_mess_category_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric; v_bill jsonb;
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

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_mess_category_id = v_cur_mess AND to_mess_category_id = p_new_mess_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
  v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'mess', v_upgrade_fee,
              format('Mess upgrade: %s -> %s', COALESCE(v_cur_name,'-'), v_new_name));

  RETURN jsonb_build_object('success', true, 'old_category_id', v_cur_mess,
    'new_category_id', p_new_mess_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee,
    'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $$;

-- ---------------------------------------------------------------------
-- Self wrappers (signatures unchanged): own-identity resolution +
-- self-service gates, then delegate to the shared core.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_category_only(p_new_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid(); v_cur_cat uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can upgrade their category';
  END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  IF NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Upgrades are currently disabled for your category';
  END IF;
  RETURN public._cl_upgrade_category_only(v_profile, v_lp, p_new_category_id);
END $$;

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_mess_category(p_new_mess_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_cur_mess uuid;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RAISE EXCEPTION 'Only a hostel resident can upgrade'; END IF;
  SELECT mess_category_id INTO v_cur_mess FROM learners_profiles WHERE id = v_lp;
  IF NOT COALESCE((SELECT upgrades_enabled FROM mess_categories WHERE id = v_cur_mess), false) THEN
    RAISE EXCEPTION 'Mess upgrades are currently disabled for your category';
  END IF;
  RETURN public._cl_upgrade_mess_category(v_lp, p_new_mess_category_id);
END $$;

-- ---------------------------------------------------------------------
-- Admin eligibility evaluators (read-only). Mirror the core's validation
-- so the preview can show per-learner eligibility without writing.
-- Gender taken from profiles.gender, falling back to learners_profiles.gender.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cl_admin_eval_room_upgrade(p_lp uuid, p_target_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_year uuid; v_gender text; v_gtype text;
  v_cur_cat uuid; v_cur_name text; v_cur_fee numeric := 0;
  v_t_name text; v_t_type text; v_t_mode text; v_t_active boolean; v_t_thr numeric;
  v_new_fee numeric; v_upg numeric; v_paid numeric; v_meets boolean;
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

  SELECT amount INTO v_upg FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_target_category_id LIMIT 1;
  v_upg := COALESCE(v_upg, v_new_fee - v_cur_fee);

  SELECT pp.paid_pct INTO v_paid FROM fn_learner_academic_payment_progress(p_lp) pp;
  v_meets := (v_t_thr IS NULL) OR (v_paid IS NOT NULL AND v_paid >= v_t_thr);

  RETURN jsonb_build_object(
    'eligible', true, 'reason', NULL,
    'current_category_id', v_cur_cat, 'current_category_name', v_cur_name,
    'target_category_id', p_target_category_id, 'target_category_name', v_t_name,
    'current_fee', v_cur_fee, 'target_fee', v_new_fee, 'upgrade_fee', v_upg,
    'threshold_pct', v_t_thr, 'paid_pct', v_paid, 'meets_threshold', v_meets);
END $$;

CREATE OR REPLACE FUNCTION public._cl_admin_eval_mess_upgrade(p_lp uuid, p_target_mess_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_year uuid; v_gender text; v_gtype text;
  v_cur uuid; v_cur_name text; v_cur_fee numeric := 0;
  v_t_name text; v_t_type text; v_t_active boolean; v_new_fee numeric; v_upg numeric;
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

  SELECT amount INTO v_upg FROM hostel_category_upgrade_fees WHERE hostel_year_id = v_year AND is_active
    AND from_mess_category_id = v_cur AND to_mess_category_id = p_target_mess_id LIMIT 1;
  v_upg := COALESCE(v_upg, v_new_fee - v_cur_fee);

  RETURN jsonb_build_object('eligible', true, 'reason', NULL,
    'current_category_id', v_cur, 'current_category_name', v_cur_name,
    'target_category_id', p_target_mess_id, 'target_category_name', v_t_name,
    'current_fee', v_cur_fee, 'target_fee', v_new_fee, 'upgrade_fee', v_upg);
END $$;

-- ---------------------------------------------------------------------
-- Catalog of selectable bulk targets (current hostel year).
-- Room kind = auto allocation-mode categories only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cl_admin_bulk_target_catalog()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_year uuid; v_room jsonb; v_mess jsonb;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN jsonb_build_object('room', '[]'::jsonb, 'mess', '[]'::jsonb); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'category_id', c.id, 'name', c.name, 'type', c.type, 'current_year_fee', hf.amount)
           ORDER BY c.type, hf.amount), '[]'::jsonb)
    INTO v_room
    FROM hostel_categories c
    JOIN hostel_fees hf ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year
         AND hf.mess_category_id IS NULL AND hf.is_active
    WHERE c.is_active AND c.allocation_mode = 'auto';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'category_id', m.id, 'name', m.name, 'type', m.type, 'current_year_fee', hf.amount)
           ORDER BY m.type, hf.amount), '[]'::jsonb)
    INTO v_mess
    FROM mess_categories m
    JOIN hostel_fees hf ON hf.mess_category_id = m.id AND hf.hostel_year_id = v_year AND hf.is_active
    WHERE m.is_active;

  RETURN jsonb_build_object('room', v_room, 'mess', v_mess);
END $$;

-- ---------------------------------------------------------------------
-- Bulk (and single, via one-element array) admin upgrade.
-- p_dry_run=true  -> preview: per-learner eligibility, no writes.
-- p_dry_run=false -> commit:  eligible learners are upgraded; each is wrapped
--                    in its own block so one failure never aborts the batch.
-- Returns a jsonb array, one element per learner, with optional room/mess
-- sub-results. status in: eligible | upgraded | pending_payment | skipped | error.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cl_admin_bulk_upgrade(
  p_learner_ids uuid[],
  p_room_category_id uuid DEFAULT NULL,
  p_mess_category_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lp uuid; v_profile uuid; v_inst uuid; v_name text; v_roll text;
  v_room jsonb; v_mess jsonb; v_res jsonb; v_accessible boolean;
  v_out jsonb := '[]'::jsonb; v_row jsonb;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  IF p_room_category_id IS NULL AND p_mess_category_id IS NULL THEN
    RAISE EXCEPTION 'Pick at least one target category (room or mess)';
  END IF;

  FOREACH v_lp IN ARRAY COALESCE(p_learner_ids, ARRAY[]::uuid[]) LOOP
    v_room := NULL; v_mess := NULL;
    SELECT lp.institution_id,
           NULLIF(btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), ''),
           lp.roll_number
      INTO v_inst, v_name, v_roll
      FROM learners_profiles lp WHERE lp.id = v_lp;

    IF v_inst IS NULL THEN
      IF p_room_category_id IS NOT NULL THEN v_room := jsonb_build_object('status','error','reason','Learner not found'); END IF;
      IF p_mess_category_id IS NOT NULL THEN v_mess := jsonb_build_object('status','error','reason','Learner not found'); END IF;
      v_out := v_out || jsonb_build_array(jsonb_build_object('learner_id', v_lp, 'name', v_name, 'roll_number', v_roll, 'room', v_room, 'mess', v_mess));
      CONTINUE;
    END IF;

    v_accessible := EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst);
    SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = v_lp;

    -- ROOM (auto category-only)
    IF p_room_category_id IS NOT NULL THEN
      IF NOT v_accessible THEN
        v_room := jsonb_build_object('status','skipped','reason','No access to this learner''s institution');
      ELSE
        v_room := public._cl_admin_eval_room_upgrade(v_lp, p_room_category_id);
        IF NOT COALESCE((v_room->>'eligible')::boolean, false) THEN
          v_room := v_room || jsonb_build_object('status','skipped');
        ELSIF p_dry_run THEN
          v_room := v_room || jsonb_build_object('status','eligible');
        ELSIF v_profile IS NULL THEN
          v_room := v_room || jsonb_build_object('status','skipped','reason','Learner has no login profile');
        ELSE
          BEGIN
            v_res := public._cl_upgrade_category_only(v_profile, v_lp, p_room_category_id);
            v_room := v_room || jsonb_build_object(
              'status', COALESCE(v_res->>'state','upgraded'),
              'upgrade_bill_id', v_res->'upgrade_bill_id',
              'waitlist_id', v_res->'waitlist_id');
          EXCEPTION WHEN OTHERS THEN
            v_room := v_room || jsonb_build_object('status','error','reason', SQLERRM);
          END;
        END IF;
      END IF;
    END IF;

    -- MESS
    IF p_mess_category_id IS NOT NULL THEN
      IF NOT v_accessible THEN
        v_mess := jsonb_build_object('status','skipped','reason','No access to this learner''s institution');
      ELSE
        v_mess := public._cl_admin_eval_mess_upgrade(v_lp, p_mess_category_id);
        IF NOT COALESCE((v_mess->>'eligible')::boolean, false) THEN
          v_mess := v_mess || jsonb_build_object('status','skipped');
        ELSIF p_dry_run THEN
          v_mess := v_mess || jsonb_build_object('status','eligible');
        ELSE
          BEGIN
            v_res := public._cl_upgrade_mess_category(v_lp, p_mess_category_id);
            v_mess := v_mess || jsonb_build_object('status','upgraded', 'bill', v_res->'bill');
          EXCEPTION WHEN OTHERS THEN
            v_mess := v_mess || jsonb_build_object('status','error','reason', SQLERRM);
          END;
        END IF;
      END IF;
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'learner_id', v_lp, 'name', v_name, 'roll_number', v_roll, 'room', v_room, 'mess', v_mess));
  END LOOP;

  RETURN v_out;
END $$;

-- ---------------------------------------------------------------------
-- Grants. Internal helpers stay private (definer-context calls only);
-- the two public RPCs are authenticated-only (perm check inside).
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._cl_upgrade_category_only(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cl_upgrade_mess_category(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cl_admin_eval_room_upgrade(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cl_admin_eval_mess_upgrade(uuid,uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_cl_admin_bulk_target_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_bulk_target_catalog() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_bulk_upgrade(uuid[],uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_bulk_upgrade(uuid[],uuid,uuid,boolean) TO authenticated;
