-- Self-service hostel RPCs: fall back to learners_profiles.gender
-- ---------------------------------------------------------------------------
-- Every gender-filtered hostel function comes in two flavours. The admin-side
-- ones (_cl_room_options, fn_cl_admin_room_options, fn_cl_admin_allocatable_rooms,
-- fn_cl_admin_allocatable_blocks, fn_cl_admin_room_upgrade_options,
-- _cl_admin_eval_room_upgrade, _cl_admin_eval_mess_upgrade) resolve gender as
--   lower(trim(COALESCE(pr.gender, lp.gender)))
-- The learner-facing ones never got that fallback and read profiles.gender alone.
--
-- profiles.gender is NULL for 47 active hostelers (46 of them unallocated) whose
-- learners_profiles.gender IS populated -- the profiles row is created by
-- onboarding, the gender comes from the admission form. For those learners
--   (v_gender IN ('male','m') AND type='boys') OR (v_gender IN ('female','f') AND type='girls')
-- is NULL => false for EVERY category, so the RPC returns zero rows and My Hostel
-- renders "No higher room categories available to you right now" while an admin
-- looking at the same learner sees the full upgrade ladder. Same defect in room
-- options, manual categories, mess upgrades and self room requests.
--
-- Aligns the six learner-facing functions with the admin pattern; bodies are
-- otherwise byte-identical. CREATE OR REPLACE (never DROP) so EXECUTE grants survive.
--
-- Still outstanding: fn_explain_allocation reads profiles.gender the same way and
-- will report gender_ok=false for these learners. Left for a separate change.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
 RETURNS TABLE(category_id uuid, name text, type text, allocation_mode text, current_year_fee numeric, upgrade_fee numeric, available_beds integer, threshold_pct numeric, paid_pct numeric, meets_threshold boolean, hold_days integer, upgrade_fee_original numeric, upgrade_discount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_gender text; v_paid_pct numeric;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM profiles pr LEFT JOIN learners_profiles lp ON lp.id = pr.learner_id
   WHERE pr.id = auth.uid();
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

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_mess_categories()
 RETURNS TABLE(mess_category_id uuid, name text, current_year_fee numeric, upgrade_fee numeric, upgrade_fee_original numeric, upgrade_discount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_gender text;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT lp.mess_category_id INTO v_cur_mess FROM learners_profiles lp WHERE lp.id = v_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM profiles pr LEFT JOIN learners_profiles lp ON lp.id = pr.learner_id
   WHERE pr.id = auth.uid();
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

CREATE OR REPLACE FUNCTION public.fn_my_room_options(p_category_id uuid)
 RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_inst uuid; v_gender text; v_src uuid; v_cur_cat uuid; v_year uuid; v_skip boolean := false;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  SELECT COALESCE(room_source_category_id, id) INTO v_src
    FROM hostel_categories WHERE id = p_category_id;
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT institution_id, hostel_category_id INTO v_inst, v_cur_cat FROM learners_profiles WHERE id=v_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM profiles pr LEFT JOIN learners_profiles lp ON lp.id = pr.learner_id
   WHERE pr.id = auth.uid();
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  SELECT COALESCE(bool_or(uf.skip_room_eligibility), false) INTO v_skip
    FROM hostel_category_upgrade_fees uf
   WHERE uf.hostel_year_id = v_year AND uf.is_active
     AND uf.from_hostel_category_id = v_cur_cat
     AND uf.to_hostel_category_id   = p_category_id;
  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM hostel_beds b
  JOIN hostel_rooms r ON r.id=b.room_id
  JOIN hostel_blocks bl ON bl.id=r.block_id
  WHERE r.category_id=v_src AND r.room_purpose='student' AND b.status='available'
    AND (bl.hostel_type::text='mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text='boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text='girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
    AND (v_skip OR fn_learner_eligible_for_room(v_lp, r.id))
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_options(p_category_id uuid)
 RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text, capacity integer, occupied_beds integer, available_beds integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_inst uuid; v_gender text; v_src uuid; v_cur_cat uuid; v_year uuid; v_skip boolean := false;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  SELECT COALESCE(room_source_category_id, id) INTO v_src
    FROM hostel_categories WHERE id = p_category_id;
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT institution_id, hostel_category_id INTO v_inst, v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM profiles pr LEFT JOIN learners_profiles lp ON lp.id = pr.learner_id
   WHERE pr.id = auth.uid();
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  SELECT COALESCE(bool_or(uf.skip_room_eligibility), false) INTO v_skip
    FROM hostel_category_upgrade_fees uf
   WHERE uf.hostel_year_id = v_year AND uf.is_active
     AND uf.from_hostel_category_id = v_cur_cat
     AND uf.to_hostel_category_id   = p_category_id;
  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, bl.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         GREATEST(COALESCE(r.actual_capacity, r.capacity)::int - av.free, 0),
         av.free
  FROM hostel_rooms r
  JOIN hostel_blocks bl ON bl.id = r.block_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free
    FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations a
        WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval')
      )
  ) av
  WHERE r.category_id = v_src AND r.room_purpose = 'student'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND (v_skip OR fn_learner_eligible_for_room(v_lp, r.id))
    AND av.free > 0
  ORDER BY bl.name, r.floor, r.room_number;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_my_manual_categories()
 RETURNS TABLE(id uuid, name text, type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gender  text;
  v_learner uuid;
  v_elig    uuid[];
BEGIN
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM profiles pr LEFT JOIN learners_profiles lp ON lp.id = pr.learner_id
   WHERE pr.id = auth.uid();
  v_learner := get_my_learner_id();

  -- Fee-aware allow-set for this learner. NULL (no rule / no bill data) => fail-open.
  SELECT array_agg(category_id) INTO v_elig
  FROM fn_hostel_learner_room_categories(v_learner);

  RETURN QUERY
  SELECT c.id, c.name, c.type FROM hostel_categories c
  WHERE c.allocation_mode='manual' AND c.is_active
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND (v_elig IS NULL OR c.id = ANY(v_elig))
  ORDER BY c.sort_order;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_self_request_room(p_category_id uuid, p_room_id uuid, p_bed_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
  v_inst uuid; v_sem uuid; v_ay uuid; v_gender text;
  v_room_cat uuid; v_room_block uuid; v_block_type text;
  v_cat_mode text; v_cat_name text; v_tier uuid; v_alloc uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a registered hostelite can request a room';
  END IF;

  SELECT institution_id, semester_id, academic_year_id INTO v_inst, v_sem, v_ay
    FROM learners_profiles WHERE id=v_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM profiles pr LEFT JOIN learners_profiles lp ON lp.id = pr.learner_id
   WHERE pr.id = v_profile;

  SELECT allocation_mode, name INTO v_cat_mode, v_cat_name FROM hostel_categories WHERE id=p_category_id;
  IF v_cat_mode IS DISTINCT FROM 'manual' THEN RAISE EXCEPTION 'This category is not self-selectable'; END IF;

  SELECT category_id, block_id INTO v_room_cat, v_room_block FROM hostel_rooms WHERE id=p_room_id;
  IF v_room_cat IS DISTINCT FROM p_category_id THEN RAISE EXCEPTION 'Room is not in the selected category'; END IF;
  IF NOT fn_room_serves_institution(p_room_id, v_inst) THEN
    RAISE EXCEPTION 'Room is not available to your institution';
  END IF;

  SELECT hostel_type::text INTO v_block_type FROM hostel_blocks WHERE id=v_room_block;
  IF NOT (v_block_type='mixed'
          OR (v_gender IN ('male','m') AND v_block_type='boys')
          OR (v_gender IN ('female','f') AND v_block_type='girls')) THEN
    RAISE EXCEPTION 'This room''s block does not match your gender';
  END IF;

  IF NOT fn_learner_eligible_for_room(v_lp, p_room_id) THEN
    RAISE EXCEPTION 'You are not eligible for this room';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hostel_beds WHERE id=p_bed_id AND room_id=p_room_id AND status='available') THEN
    RAISE EXCEPTION 'That bed is not available';
  END IF;
  IF EXISTS (SELECT 1 FROM hostel_allocations WHERE bed_id=p_bed_id AND status IN ('active','pending_approval')) THEN
    RAISE EXCEPTION 'That bed has just been taken';
  END IF;
  IF EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id=v_profile AND status IN ('active','pending_approval')) THEN
    RAISE EXCEPTION 'You already have an allocation or a pending request';
  END IF;

  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy
    WHERE tier_key = CASE WHEN v_cat_name ILIKE '%plus%' THEN 'premium_plus' ELSE 'premium' END
      AND (institution_id=v_inst OR institution_id IS NULL) AND is_active
    ORDER BY institution_id NULLS LAST LIMIT 1;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No tier policy found'; END IF;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, warden_id
  ) VALUES (
    v_inst, v_profile, v_room_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'pending_approval', '', '', '',
    v_tier, v_profile,
    (SELECT user_id FROM user_block_access WHERE block_id=v_room_block AND revoked_at IS NULL LIMIT 1)
  ) RETURNING id INTO v_alloc;

  RETURN v_alloc;
END $function$;
