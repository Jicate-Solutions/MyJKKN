-- P3.1 — Learner self-selection (manual categories) + single-allocation approval.
-- The learner picks a manual category + an eligibility/gender/institution-matched
-- bed; fn_self_request_room creates a pending_approval allocation routed to the
-- same warden review as the auto batches. fn_approve_allocation /
-- fn_reject_allocation handle the individual (non-batch) self-requests.

CREATE OR REPLACE FUNCTION public.fn_my_manual_categories()
RETURNS TABLE (id uuid, name text, type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gender text;
BEGIN
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  RETURN QUERY
  SELECT c.id, c.name, c.type FROM hostel_categories c
  WHERE c.allocation_mode='manual' AND c.is_active
    AND ((v_gender IN ('male','m') AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
  ORDER BY c.sort_order;
END $$;

CREATE OR REPLACE FUNCTION public.fn_my_room_options(p_category_id uuid)
RETURNS TABLE (bed_id uuid, room_id uuid, room_number text, floor int, block_name text, bed_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_inst uuid; v_gender text;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id=v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM hostel_beds b
  JOIN hostel_rooms r ON r.id=b.room_id
  JOIN hostel_blocks bl ON bl.id=r.block_id
  WHERE r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
    AND (bl.hostel_type::text='mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text='boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text='girls'))
    AND EXISTS (SELECT 1 FROM room_institution_access ria WHERE ria.room_id=r.id AND ria.institution_id=v_inst AND ria.is_active)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
    AND fn_learner_eligible_for_room(v_lp, r.id)
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $$;

CREATE OR REPLACE FUNCTION public.fn_self_request_room(
  p_category_id uuid, p_room_id uuid, p_bed_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id=v_profile;

  SELECT allocation_mode, name INTO v_cat_mode, v_cat_name FROM hostel_categories WHERE id=p_category_id;
  IF v_cat_mode IS DISTINCT FROM 'manual' THEN RAISE EXCEPTION 'This category is not self-selectable'; END IF;

  SELECT category_id, block_id INTO v_room_cat, v_room_block FROM hostel_rooms WHERE id=p_room_id;
  IF v_room_cat IS DISTINCT FROM p_category_id THEN RAISE EXCEPTION 'Room is not in the selected category'; END IF;
  IF NOT EXISTS (SELECT 1 FROM room_institution_access WHERE room_id=p_room_id AND institution_id=v_inst AND is_active) THEN
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
END $$;

CREATE OR REPLACE FUNCTION public.fn_approve_allocation(p_allocation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bed uuid; v_learner uuid; v_status text;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.approve')) THEN
    RAISE EXCEPTION 'Not authorized to approve allocations';
  END IF;
  SELECT bed_id, learner_id, status INTO v_bed, v_learner, v_status
    FROM hostel_allocations WHERE id=p_allocation_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Allocation not found'; END IF;
  IF v_status <> 'pending_approval' THEN RAISE EXCEPTION 'Allocation is not pending approval'; END IF;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_learner WHERE id=v_bed AND status='available';
  UPDATE hostel_allocations SET status='active' WHERE id=p_allocation_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_reject_allocation(p_allocation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.approve')) THEN
    RAISE EXCEPTION 'Not authorized to reject allocations';
  END IF;
  SELECT status INTO v_status FROM hostel_allocations WHERE id=p_allocation_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Allocation not found'; END IF;
  IF v_status <> 'pending_approval' THEN RAISE EXCEPTION 'Allocation is not pending approval'; END IF;
  UPDATE hostel_allocations SET status='rejected' WHERE id=p_allocation_id;
END $$;
