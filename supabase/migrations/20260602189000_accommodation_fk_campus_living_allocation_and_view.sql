-- Campus-living accommodation FK migration: hostel auto-allocation and the
-- v_learner_hostelites view now key off accommodation_type_id
-- (accommodation_types.code='hostel') instead of the accommodation_type TEXT
-- column (being retired). Behaviour-equivalent; also includes HOSTELLER-typo
-- learners backfilled to the hostel FK. v_learner_hostelites joins
-- accommodation_types and exposes acc.code AS accommodation_type (shape unchanged).

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(p_block_id uuid, p_category_id uuid, p_hostel_year_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
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
END $function$;

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(p_block_id uuid, p_category_id uuid)
 RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cat AS (
    SELECT CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END AS req_gender
    FROM hostel_categories WHERE id=p_category_id
  )
  SELECT
    (SELECT count(*)::int FROM learners_profiles lp JOIN profiles p ON p.learner_id=lp.id, cat
       WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel') AND lp.hostel_category_id=p_category_id
         AND (cat.req_gender IS NULL
              OR (cat.req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
              OR (cat.req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
         AND EXISTS (SELECT 1 FROM hostel_rooms r JOIN room_institution_access ria ON ria.room_id=r.id AND ria.is_active
                     WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student'
                       AND ria.institution_id=lp.institution_id)),
    (SELECT count(*)::int FROM learners_profiles lp
       WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel') AND lp.hostel_category_id=p_category_id
         AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=lp.id)),
    (SELECT count(*)::int FROM learners_profiles lp JOIN profiles p ON p.learner_id=lp.id
       WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel') AND lp.hostel_category_id=p_category_id
         AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval')));
$function$;

CREATE OR REPLACE VIEW public.v_learner_hostelites AS
 SELECT lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.student_email,
    lp.college_email, lp.gender, lp.institution_id,
    acc.code AS accommodation_type,
    lp.hostel_fee, lp.dayscholar_fee, lp.father_name, lp.mother_name,
    lp.admission_year_id, lp.degree_id, lp.department_id, lp.program_id,
    lp.semester_id, lp.section_id, lp.academic_year_id,
    pr.program_name, ay.program_start_year, ay.program_end_year,
        CASE
            WHEN lp.admission_year_id IS NOT NULL AND ay.program_start_year IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.program_start_year + 1, ay.program_end_year - ay.program_start_year + 1))
            WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1, EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
            WHEN lp.enquiry_date IS NOT NULL THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
            ELSE NULL::integer
        END AS year_of_study,
    ha.block_id AS current_block_id, ha.room_id AS current_room_id, ha.bed_id AS current_bed_id,
    ha.id AS current_allocation_id, hb.name AS current_block_name, hb.code AS current_block_code,
        CASE
            WHEN lp.admission_year_id IS NOT NULL AND ay.program_start_year IS NOT NULL THEN 'admission_year'::text
            WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN 'batch'::text
            WHEN lp.enquiry_date IS NOT NULL THEN 'enquiry'::text
            ELSE NULL::text
        END AS year_source,
    dg.degree_name, sm.semester_name
   FROM learners_profiles lp
     LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
     LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
     LEFT JOIN batches b ON b.id = lp.batch_id
     LEFT JOIN programs pr ON pr.id = lp.program_id
     LEFT JOIN hostel_allocations ha ON ha.learner_id = lp.id AND ha.status = 'active'::allocation_status_enum
     LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
     LEFT JOIN degrees dg ON dg.id = lp.degree_id
     LEFT JOIN semesters sm ON sm.id = lp.semester_id
  WHERE acc.code = 'hostel';
