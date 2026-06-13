-- Auto-allocation validation preview + mandatory academic-year/current-year-bill gate.
-- Spec: docs/superpowers/specs/2026-06-08-campus-living-auto-allocation-validation-preview-design.md

-- 1) Drop the 3-arg generator so we can re-create it with p_require_bill.
DROP FUNCTION IF EXISTS public.fn_auto_allocate_classic(uuid, uuid, uuid);

-- 2) Generator with the Stage-0 prerequisite gate (academic year + current-year bill), default ON.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(
  p_block_id uuid, p_category_id uuid, p_hostel_year_id uuid, p_require_bill boolean DEFAULT true
)
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

  IF NOT EXISTS (SELECT 1 FROM hostel_room_eligibility_rules
                 WHERE block_id = p_block_id AND is_active) THEN
    RAISE EXCEPTION 'No physical-room rules are set for this block. Set rules under Program Eligibility -> Physical Rooms before auto-allocating.';
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
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_room_categories(lp.id)
    ) elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id = p_block_id)
      AND COALESCE(p_category_id = ANY(elig.cats), lp.hostel_category_id = p_category_id)
      AND (v_req_gender IS NULL
           OR (v_req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
           OR (v_req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND EXISTS (SELECT 1 FROM hostel_rooms r
                  WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student')
      -- Stage 0: academic year + current-year bill are mandatory when p_require_bill.
      AND (NOT p_require_bill
           OR (lp.academic_year_id IS NOT NULL
               AND fn_learner_current_year_academic_fee(lp.id) IS NOT NULL))
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
      AND fn_room_serves_institution(r.id, cand.inst)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_strictly_eligible_for_room(cand.lp_id, r.id)
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
        notes = format('%s allocated into this block, %s skipped (no rule-covered bed / Stage-0 prerequisite: academic year + current-year bill). Cohort = fee-aware eligibility for the category (fail-open to saved category). Excluded: no login profile or gender mismatch.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- 3) Per-learner validation preview. Read-only; no internal auth RAISE (mirrors
--    fn_auto_allocate_preview). Access gated by REVOKE/GRANT + the page nav permission.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(
  p_block_id uuid, p_category_id uuid, p_require_bill boolean DEFAULT true
)
RETURNS TABLE(
  learner_id uuid,
  full_name text,
  email text,
  program_name text,
  gender text,
  has_profile boolean,
  gender_ok boolean,
  not_allocated boolean,
  physical_rule_ok boolean,
  academic_year_id uuid,
  academic_year_name text,
  academic_bill_count int,
  current_year_bill_count int,
  bill_other_year_name text,
  current_year_fee numeric,
  fee_resolved boolean,
  fee_category_match boolean,
  bill_state text,
  stage text,
  verdict text,
  exclusion_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cat AS (
    SELECT CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END AS req_gender
    FROM hostel_categories WHERE id = p_category_id
  ),
  targeted AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
           lp.academic_year_id, lp.first_name, lp.last_name, lp.hostel_category_id,
           elig.cats
    FROM learners_profiles lp
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)
    ) elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
      AND COALESCE(p_category_id = ANY(elig.cats), lp.hostel_category_id = p_category_id)
  ),
  base AS (
    SELECT
      t.id AS learner_id,
      COALESCE(p.full_name, p.email, '—') AS full_name,
      p.email,
      prog.program_name,
      lower(trim(p.gender)) AS gender,
      (p.id IS NOT NULL) AS has_profile,
      (cat.req_gender IS NULL
        OR (cat.req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
        OR (cat.req_gender='female' AND lower(trim(p.gender)) IN ('female','f'))) AS gender_ok,
      -- p.id is NULL for no-profile learners; NOT EXISTS(... learner_id=NULL) yields true (intentional; has_profile=false already excludes them)
      NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval')) AS not_allocated,
      EXISTS (
        SELECT 1 FROM hostel_room_eligibility_rules r
        WHERE r.is_active AND r.block_id=p_block_id AND r.institution_id=t.institution_id
          AND (r.degree_id     IS NULL OR r.degree_id     = t.degree_id)
          AND (r.department_id IS NULL OR r.department_id = t.department_id)
          AND (r.program_id    IS NULL OR r.program_id    = t.program_id)
          AND (r.semester_id   IS NULL OR r.semester_id   = t.semester_id)
          AND EXISTS (
            SELECT 1 FROM hostel_rooms rm
            WHERE rm.block_id=p_block_id AND rm.category_id=p_category_id AND rm.room_purpose='student'
              AND CASE
                    WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
                      THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=rm.id)
                    ELSE (r.floor IS NULL OR r.floor = rm.floor)
                  END
          )
      ) AS physical_rule_ok,
      t.academic_year_id,
      ay.academic_year_name,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id=t.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id=t.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id = t.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name FROM billing_student_bills b
         JOIN academic_years ay2 ON ay2.id=b.academic_year_id
         WHERE b.student_id=t.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id IS NOT NULL AND b.academic_year_id IS DISTINCT FROM t.academic_year_id
         ORDER BY b.created_at DESC
         LIMIT 1) AS bill_other_year_name,
      fn_learner_current_year_academic_fee(t.id) AS current_year_fee,
      -- Within the targeted universe the COALESCE short-circuits, so cats non-null ⟺ the fee rule itself produced this category. true = matched via fee rule; false = matched via saved-category fallback.
      (t.cats IS NOT NULL) AS fee_resolved,
      COALESCE(p_category_id = ANY(t.cats), false) AS fee_category_match
    FROM targeted t
    LEFT JOIN profiles p ON p.learner_id = t.id
    LEFT JOIN programs prog ON prog.id = t.program_id
    LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
    CROSS JOIN cat
  )
  SELECT
    b.learner_id, b.full_name, b.email, b.program_name, b.gender,
    b.has_profile, b.gender_ok, b.not_allocated, b.physical_rule_ok,
    b.academic_year_id, b.academic_year_name,
    b.academic_bill_count, b.current_year_bill_count, b.bill_other_year_name,
    b.current_year_fee, b.fee_resolved, b.fee_category_match,
    CASE
      WHEN b.current_year_bill_count > 0 THEN 'matched'
      WHEN b.bill_other_year_name IS NOT NULL THEN 'different_year'
      WHEN b.academic_bill_count > 0 THEN 'untagged'
      ELSE 'none'
    END AS bill_state,
    CASE
      WHEN p_require_bill AND b.academic_year_id IS NULL THEN 'prerequisite'
      WHEN p_require_bill AND b.current_year_fee IS NULL THEN 'prerequisite'
      WHEN NOT b.has_profile OR NOT b.gender_ok OR NOT b.not_allocated OR NOT b.physical_rule_ok THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN p_require_bill AND b.academic_year_id IS NULL THEN 'out'
      WHEN p_require_bill AND b.current_year_fee IS NULL THEN 'out'
      WHEN NOT b.has_profile OR NOT b.gender_ok OR NOT b.not_allocated OR NOT b.physical_rule_ok THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN p_require_bill AND b.academic_year_id IS NULL THEN 'Academic year not set on student profile'
      WHEN p_require_bill AND b.current_year_fee IS NULL THEN
        CASE
          WHEN b.bill_other_year_name IS NOT NULL THEN 'Bill tagged to a different academic year (' || b.bill_other_year_name || ')'
          WHEN b.academic_bill_count > 0 THEN 'Academic bills exist but are not year-tagged'
          ELSE 'No academic bill generated for ' || COALESCE(b.academic_year_name, 'the academic year')
        END
      WHEN NOT b.has_profile THEN 'No login profile'
      WHEN NOT b.gender_ok THEN 'Gender does not match category'
      WHEN NOT b.not_allocated THEN 'Already allocated'
      WHEN NOT b.physical_rule_ok THEN 'No physical-room rule covers this student'
      ELSE NULL
    END AS exclusion_reason
  FROM base b
  ORDER BY b.full_name;
$function$;

-- 4) Grants (anon-not-PUBLIC rule).
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid, uuid, boolean) TO authenticated;
