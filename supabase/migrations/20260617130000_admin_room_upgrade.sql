-- =====================================================================
-- Phase 2: admin single-learner ROOM upgrade with room/bed picking   2026-06-17
--
-- Completes category parity: admins can upgrade a learner into a MANUAL
-- (room-picked) category e.g. Premium, on the learner's behalf, mirroring the
-- self-service My Hostel room upgrade. (Auto categories + mess remain on the
-- bulk path, 20260617100000.)
--
-- The self-service room options are auth.uid()-bound only for (a) get_my_learner_id
-- and (b) gender via profiles. fn_room_serves_institution / fn_learner_eligible_for_room
-- are already learner-parametrized, so the body extracts cleanly:
--   _cl_room_options(p_profile,p_lp,cat)        <- fn_my_room_options (param'd)
--   _cl_upgrade_room_category(p_profile,p_lp,…) <- fn_self_upgrade_room_category body
-- fn_self_upgrade_room_category becomes a thin wrapper. p_enforce_self_gates lets
-- the self path keep the upgrades_enabled gate while admins bypass it.
-- =====================================================================

-- Learner-scoped bed options (mirror of fn_my_room_options, parametrized).
CREATE OR REPLACE FUNCTION public._cl_room_options(p_profile uuid, p_lp uuid, p_category_id uuid)
RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_inst uuid; v_gender text;
BEGIN
  IF p_lp IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.id = p_profile WHERE lp.id = p_lp;
  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM hostel_beds b
  JOIN hostel_rooms r ON r.id = b.room_id
  JOIN hostel_blocks bl ON bl.id = r.block_id
  WHERE r.category_id = p_category_id AND r.room_purpose = 'student' AND b.status = 'available'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
    AND fn_learner_eligible_for_room(p_lp, r.id)
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $$;

-- Core room upgrade (extracted from fn_self_upgrade_room_category). Identity is
-- parametrized; fn_my_room_options -> _cl_room_options. p_enforce_self_gates=false
-- bypasses the upgrades_enabled toggle (admin override).
CREATE OR REPLACE FUNCTION public._cl_upgrade_room_category(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid,
  p_bed_id uuid DEFAULT NULL, p_enforce_self_gates boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lp uuid := p_lp; v_profile uuid := p_profile;
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_cur_name text; v_new_name text;
  v_gate jsonb; v_hold_days int; v_bed_status text; v_existing uuid;
  v_inst uuid; v_ay uuid; v_expires timestamptz; v_result jsonb; v_has_alloc boolean;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid; v_meets boolean;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');

  IF p_enforce_self_gates AND v_has_alloc
     AND NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Room upgrades are currently disabled for your category';
  END IF;

  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id
    FROM _cl_room_options(v_profile, v_lp, p_new_category_id) o
    WHERE o.room_id = p_room_id
    ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN
      RAISE EXCEPTION 'No available bed left in that room. Pick another room.';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM _cl_room_options(v_profile, v_lp, p_new_category_id) o
    WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for this learner';
  END IF;

  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);
  v_meets := (v_gate->>'meets')::boolean;

  IF NOT v_has_alloc AND v_meets THEN
    v_result := public._cl_execute_first_booking(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('new_fee', v_new_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;

  IF v_has_alloc THEN
    SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
      WHERE hostel_year_id = v_year AND is_active
        AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
    v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
    IF v_meets AND COALESCE(v_upgrade_fee, 0) <= 0 THEN
      v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
      RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
    END IF;
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id <> p_new_category_id;
  UPDATE hostel_waitlist
     SET held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id = p_new_category_id AND held_bed_id IS NOT NULL;

  UPDATE hostel_beds SET status='reserved' WHERE id = p_bed_id;

  SELECT upgrade_hold_days INTO v_hold_days FROM hostel_categories WHERE id = p_new_category_id;
  v_expires := now() + make_interval(days => COALESCE(v_hold_days, 5));

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade'
      AND target_hostel_category_id = p_new_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist
       SET held_room_id=p_room_id, held_bed_id=p_bed_id, hold_expires_at=v_expires, updated_at=now()
     WHERE id = v_existing;
  ELSE
    INSERT INTO hostel_waitlist (
      institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at
    ) VALUES (
      v_inst, v_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, p_room_id, p_bed_id, v_expires
    ) RETURNING id INTO v_existing;
  END IF;

  UPDATE hostel_waitlist SET from_hostel_category_id = COALESCE(from_hostel_category_id, v_cur_cat), updated_at=now() WHERE id = v_existing;
  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = v_lp;

  IF v_has_alloc AND v_meets THEN
    SELECT upgrade_bill_id INTO v_bill_id FROM hostel_waitlist WHERE id = v_existing;
    IF v_bill_id IS NULL THEN
      v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'hostel', v_upgrade_fee,
                  format('Hostel room upgrade: %s -> %s', COALESCE(v_cur_name,'-'), v_new_name));
      v_bill_id := (v_bill->>'bill_id')::uuid;
      UPDATE hostel_waitlist SET upgrade_bill_id = v_bill_id, updated_at=now() WHERE id = v_existing;
    END IF;
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment',
      'waitlist_id', v_existing, 'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
      'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
      'old_fee', v_cur_fee, 'new_fee', v_new_fee);
  END IF;

  RETURN jsonb_build_object('success', true, 'state', 'waitlisted',
    'waitlist_id', v_existing,
    'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
    'total_billed', v_gate->'total_billed', 'total_paid', v_gate->'total_paid',
    'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee);
END $$;

-- Self wrapper (signature unchanged): identity + self-service gates -> core.
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(p_new_category_id uuid, p_room_id uuid, p_bed_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can book or upgrade a room';
  END IF;
  RETURN public._cl_upgrade_room_category(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, true);
END $$;

-- Admin: room-level (capacity) options for a learner's target category picker.
CREATE OR REPLACE FUNCTION public.fn_cl_admin_room_options(p_learner_id uuid, p_category_id uuid)
RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text, capacity integer, occupied_beds integer, available_beds integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_inst uuid; v_gender text;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE='42501';
  END IF;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_learner_id;
  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, bl.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         GREATEST(COALESCE(r.actual_capacity, r.capacity)::int - av.free, 0),
         av.free
  FROM hostel_rooms r
  JOIN hostel_blocks bl ON bl.id = r.block_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
  ) av
  WHERE r.category_id = p_category_id AND r.room_purpose = 'student'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND fn_learner_eligible_for_room(p_learner_id, r.id)
    AND av.free > 0
  ORDER BY bl.name, r.floor, r.room_number;
END $$;

-- Admin: eligible MANUAL room categories for a learner (the dialog's category list).
-- Auto categories + mess are on the bulk path, so this is manual-only.
CREATE OR REPLACE FUNCTION public.fn_cl_admin_room_upgrade_options(p_learner_id uuid)
RETURNS TABLE(category_id uuid, name text, type text, allocation_mode text, current_year_fee numeric,
              upgrade_fee numeric, available_beds integer, threshold_pct numeric, paid_pct numeric,
              meets_threshold boolean, hold_days integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee) AS upgrade_fee,
         (SELECT count(*)::int FROM _cl_room_options(v_profile, p_learner_id, c.id)),
         c.upgrade_threshold_pct,
         v_paid_pct,
         (c.upgrade_threshold_pct IS NULL OR (v_paid_pct IS NOT NULL AND v_paid_pct >= c.upgrade_threshold_pct)),
         c.upgrade_hold_days
  FROM hostel_categories c
  JOIN hostel_fees hf ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE c.is_active AND c.allocation_mode = 'manual'
    AND ((v_gender IN ('male','m') AND c.type='boys') OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
  ORDER BY hf.amount;
END $$;

-- Admin: execute the room-level upgrade for a learner.
CREATE OR REPLACE FUNCTION public.fn_cl_admin_upgrade_room(
  p_learner_id uuid, p_category_id uuid, p_room_id uuid, p_bed_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_inst uuid; v_profile uuid;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Learner not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE='42501';
  END IF;
  SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = p_learner_id;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Learner has no login profile (cannot record allocation)'; END IF;
  RETURN public._cl_upgrade_room_category(v_profile, p_learner_id, p_category_id, p_room_id, p_bed_id, false);
END $$;

-- Grants
REVOKE ALL ON FUNCTION public._cl_room_options(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cl_upgrade_room_category(uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_room_options(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_room_options(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_room_upgrade_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_room_upgrade_options(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cl_admin_upgrade_room(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_upgrade_room(uuid,uuid,uuid,uuid) TO authenticated;
