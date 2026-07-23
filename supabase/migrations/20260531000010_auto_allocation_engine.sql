-- P2.2 — Auto-allocation engine + approve/reject RPCs (final).
--
-- fn_auto_allocate_classic: for an institution + Classic (auto) category +
-- academic year, fills eligibility- and gender-matched Classic beds with the
-- not-yet-allocated cohort in ALPHABETICAL order, into a pending_approval batch.
-- Gender matching mirrors fn_validate_hostel_allocation_gender exactly
-- (profiles.gender, LOWER/TRIM, accepts f/m). Learners without a login profile
-- or with a gender mismatch are excluded; the bed search also respects
-- fn_learner_eligible_for_room() (P1) so physical-room rules are honoured.

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(
  p_institution_id uuid,
  p_category_id    uuid
) RETURNS TABLE (
  cohort_eligible int, no_profile int, already_allocated int, available_beds int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cat AS (
    SELECT CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END AS req_gender
    FROM hostel_categories WHERE id=p_category_id
  )
  SELECT
    (SELECT count(*)::int FROM learners_profiles lp JOIN profiles p ON p.learner_id=lp.id, cat
       WHERE lp.accommodation_type='HOSTEL' AND lp.hostel_category_id=p_category_id
         AND lp.institution_id=p_institution_id
         AND (cat.req_gender IS NULL
              OR (cat.req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
              OR (cat.req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM learners_profiles lp
       WHERE lp.accommodation_type='HOSTEL' AND lp.hostel_category_id=p_category_id
         AND lp.institution_id=p_institution_id
         AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=lp.id)),
    (SELECT count(*)::int FROM learners_profiles lp JOIN profiles p ON p.learner_id=lp.id
       WHERE lp.accommodation_type='HOSTEL' AND lp.hostel_category_id=p_category_id
         AND lp.institution_id=p_institution_id
         AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
         AND EXISTS (SELECT 1 FROM room_institution_access ria WHERE ria.room_id=r.id AND ria.institution_id=p_institution_id AND ria.is_active)
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval')));
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(
  p_institution_id   uuid,
  p_category_id      uuid,
  p_academic_year_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0;
  v_req_gender text;
  cand record; v_bed uuid; v_room uuid; v_block uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.create')) THEN
    RAISE EXCEPTION 'Not authorized to run auto-allocation';
  END IF;

  SELECT CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END
    INTO v_req_gender
    FROM hostel_categories WHERE id=p_category_id AND allocation_mode='auto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category is not an auto-allocation category';
  END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy
    WHERE tier_key='standard' AND (institution_id=p_institution_id OR institution_id IS NULL) AND is_active
    ORDER BY institution_id NULLS LAST LIMIT 1;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocation_batches (institution_id, category_id, academic_year_id, status, created_by)
  VALUES (p_institution_id, p_category_id, p_academic_year_id, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR cand IN
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lower(trim(p.gender)) AS gender
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    WHERE lp.accommodation_type='HOSTEL'
      AND lp.hostel_category_id = p_category_id
      AND lp.institution_id = p_institution_id
      AND (v_req_gender IS NULL
           OR (v_req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
           OR (v_req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
    ORDER BY lower(coalesce(lp.first_name,'')), lower(coalesce(lp.last_name,'')), lp.id
  LOOP
    v_bed := NULL;
    SELECT b.id, r.id, r.block_id INTO v_bed, v_room, v_block
    FROM hostel_beds b
    JOIN hostel_rooms r ON r.id=b.room_id
    JOIN hostel_blocks bl ON bl.id=r.block_id
    WHERE r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
      AND (bl.hostel_type::text='mixed'
           OR (cand.gender IN ('male','m')   AND bl.hostel_type::text='boys')
           OR (cand.gender IN ('female','f') AND bl.hostel_type::text='girls'))
      AND EXISTS (SELECT 1 FROM room_institution_access ria WHERE ria.room_id=r.id AND ria.institution_id=p_institution_id AND ria.is_active)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_eligible_for_room(cand.lp_id, r.id)
    ORDER BY r.floor, r.room_number, b.bed_number
    LIMIT 1;

    IF v_bed IS NULL THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, batch_id, allocated_by, warden_id
    ) VALUES (
      p_institution_id, cand.profile_id, v_block, v_room, v_bed,
      COALESCE(cand.ay_id, p_academic_year_id), cand.sem_id,
      'fresh', CURRENT_DATE, 'pending_approval',
      '', '', '',
      v_tier, v_batch, v_actor,
      (SELECT user_id FROM user_block_access WHERE block_id=v_block AND revoked_at IS NULL LIMIT 1)
    );
    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated, %s with no eligible bed. Excluded: hostelites without a login profile or with a gender mismatch.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END;
$$;

-- Approve: commit a batch — pending_approval → active, mark beds occupied.
CREATE OR REPLACE FUNCTION public.fn_approve_allocation_batch(p_batch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.approve')) THEN
    RAISE EXCEPTION 'Not authorized to approve allocations';
  END IF;
  SELECT status INTO v_status FROM hostel_allocation_batches WHERE id=p_batch_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status <> 'pending_approval' THEN RAISE EXCEPTION 'Batch is not pending approval'; END IF;

  UPDATE hostel_beds b SET status='occupied', current_occupant_id = a.learner_id
    FROM hostel_allocations a
    WHERE a.batch_id=p_batch_id AND a.status='pending_approval' AND a.bed_id=b.id AND b.status='available';

  UPDATE hostel_allocations SET status='active'
    WHERE batch_id=p_batch_id AND status='pending_approval';

  UPDATE hostel_allocation_batches SET status='approved', approved_by=auth.uid(), approved_at=now()
    WHERE id=p_batch_id;
END;
$$;

-- Reject: mark the batch + its proposed allocations rejected (beds stay free).
CREATE OR REPLACE FUNCTION public.fn_reject_allocation_batch(p_batch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.approve')) THEN
    RAISE EXCEPTION 'Not authorized to reject allocations';
  END IF;
  SELECT status INTO v_status FROM hostel_allocation_batches WHERE id=p_batch_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status <> 'pending_approval' THEN RAISE EXCEPTION 'Batch is not pending approval'; END IF;

  UPDATE hostel_allocations SET status='rejected'
    WHERE batch_id=p_batch_id AND status='pending_approval';
  UPDATE hostel_allocation_batches SET status='rejected', approved_by=auth.uid(), approved_at=now()
    WHERE id=p_batch_id;
END;
$$;
