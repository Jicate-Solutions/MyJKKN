-- Re-scope auto-allocation from institution to BLOCK. You pick the block to
-- fill (+ category + hostel year); the cohort is all matching-category, gender-
-- matched, unallocated learners whose institution serves a room in that block
-- (room_institution_access), gated per-room by the Physical-Room eligibility
-- rules. Institution is no longer a page input — it's derived from the block.

ALTER TABLE public.hostel_allocation_batches
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES hostel_blocks(id);
ALTER TABLE public.hostel_allocation_batches
  ALTER COLUMN institution_id DROP NOT NULL;

DROP FUNCTION IF EXISTS public.fn_auto_allocate_preview(uuid, uuid);
CREATE FUNCTION public.fn_auto_allocate_preview(
  p_block_id    uuid,
  p_category_id uuid
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
         AND (cat.req_gender IS NULL
              OR (cat.req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
              OR (cat.req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
         AND EXISTS (SELECT 1 FROM hostel_rooms r JOIN room_institution_access ria ON ria.room_id=r.id AND ria.is_active
                     WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student'
                       AND ria.institution_id=lp.institution_id)),
    (SELECT count(*)::int FROM learners_profiles lp
       WHERE lp.accommodation_type='HOSTEL' AND lp.hostel_category_id=p_category_id
         AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=lp.id)),
    (SELECT count(*)::int FROM learners_profiles lp JOIN profiles p ON p.learner_id=lp.id
       WHERE lp.accommodation_type='HOSTEL' AND lp.hostel_category_id=p_category_id
         AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval')));
$$;

DROP FUNCTION IF EXISTS public.fn_auto_allocate_classic(uuid, uuid, uuid);
CREATE FUNCTION public.fn_auto_allocate_classic(
  p_block_id       uuid,
  p_category_id    uuid,
  p_hostel_year_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0;
  v_req_gender text; v_cat_type text; v_block_type text; v_ay uuid;
  cand record; v_bed uuid; v_room uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.create')) THEN
    RAISE EXCEPTION 'Not authorized to run auto-allocation';
  END IF;

  SELECT type, CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END
    INTO v_cat_type, v_req_gender
    FROM hostel_categories WHERE id=p_category_id AND allocation_mode='auto';
  IF NOT FOUND THEN RAISE EXCEPTION 'Category is not an auto-allocation category'; END IF;

  SELECT hostel_type::text INTO v_block_type FROM hostel_blocks WHERE id=p_block_id;
  IF v_block_type IS NULL THEN RAISE EXCEPTION 'Block not found'; END IF;
  IF NOT (v_block_type='mixed' OR v_block_type=v_cat_type) THEN
    RAISE EXCEPTION 'The category gender does not match the block';
  END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy
    WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN
    SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1;
  END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (p_block_id, p_category_id, p_hostel_year_id, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR cand IN
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lp.institution_id AS inst, lower(trim(p.gender)) AS gender
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    WHERE lp.accommodation_type='HOSTEL'
      AND lp.hostel_category_id = p_category_id
      AND (v_req_gender IS NULL
           OR (v_req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
           OR (v_req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND EXISTS (SELECT 1 FROM hostel_rooms r JOIN room_institution_access ria ON ria.room_id=r.id AND ria.is_active
                  WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student'
                    AND ria.institution_id=lp.institution_id)
    ORDER BY lower(coalesce(lp.first_name,'')), lower(coalesce(lp.last_name,'')), lp.id
  LOOP
    v_ay := COALESCE(cand.ay_id,
                     (SELECT id FROM academic_years WHERE institution_id=cand.inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    v_bed := NULL;
    SELECT b.id, r.id INTO v_bed, v_room
    FROM hostel_beds b
    JOIN hostel_rooms r ON r.id=b.room_id
    WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
      AND EXISTS (SELECT 1 FROM room_institution_access ria WHERE ria.room_id=r.id AND ria.institution_id=cand.inst AND ria.is_active)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_eligible_for_room(cand.lp_id, r.id)
    ORDER BY r.floor, r.room_number, b.bed_number
    LIMIT 1;

    IF v_bed IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, batch_id, allocated_by, warden_id
    ) VALUES (
      cand.inst, cand.profile_id, p_block_id, v_room, v_bed, v_ay, cand.sem_id,
      'fresh', CURRENT_DATE, 'pending_approval', '', '', '',
      v_tier, v_batch, v_actor,
      (SELECT user_id FROM user_block_access WHERE block_id=p_block_id AND revoked_at IS NULL LIMIT 1)
    );
    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated into this block, %s skipped (no eligible bed / academic year). Excluded: no login profile or gender mismatch.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $$;
