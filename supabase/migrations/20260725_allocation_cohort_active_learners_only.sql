-- Auto-allocation cohort: restrict to lifecycle_status = 'active'.
--
-- WHY: hostel allocation is only valid for ACTIVE learners. Pre-admission
-- states (enquiry, enquiry_submitted, reserved, admitted, account) have not
-- joined yet, and exited states (graduated, rejected, inactive,
-- withdrawal_pending) have left — none of them should be handed a bed.
--
-- This is a CONSISTENCY fix, not a new rule. The rest of Campus Living already
-- enforces it and the three auto-allocation functions were the only holdouts:
--   * v_learner_hostelites                     -> lifecycle_status = 'active'
--   * fn_hostel_unallocated_candidates         -> lifecycle_status = 'active'
--     (the MANUAL allocations/new picker)
--   * HostelAllocationService.getAllAllocations -> filters to 'active' in JS
-- Residents/reporting screens intentionally keep showing every status; only the
-- allocation candidate pool is narrowed.
--
-- MEASURED IMPACT (Boys Hostel A, 2026-07-25, both genders):
--   preview rows 516 -> 282; verdict='in' 207 -> 204.
--   The 3 lost were lifecycle_status='inactive' learners who were genuinely
--   eligible and WOULD have been given beds on the next Generate run — a real
--   defect this closes. No 'active' learner is affected.
--
-- Preview and generate MUST agree, so fn_auto_allocate_candidates (preview),
-- fn_auto_allocate_classic (allocator) and fn_auto_allocate_preview (counters)
-- all get the same predicate. Signatures are unchanged — adding a parameter
-- would create an overload rather than replace these.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_auto_allocate_candidates — per-learner preview verdicts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(
  p_block_id uuid,
  p_strict boolean DEFAULT false,
  p_floor integer DEFAULT NULL::integer,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(learner_id uuid, full_name text, email text, institution_name text, program_name text, semester_name text, gender text, has_profile boolean, gender_ok boolean, not_allocated boolean, physical_rule_ok boolean, bed_available boolean, academic_year_id uuid, academic_year_name text, academic_bill_count integer, current_year_bill_count integer, bill_other_year_name text, current_year_fee numeric, resolved_room_category_id uuid, resolved_room_category_name text, resolved_mess_category_id uuid, resolved_mess_category_name text, bill_state text, stage text, verdict text, exclusion_reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH blk AS (
    SELECT hostel_type::text AS t FROM hostel_blocks WHERE id = p_block_id
  ),
  cohort AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id,
           lp.program_id, lp.semester_id, lp.academic_year_id,
           lp.first_name, lp.last_name,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    CROSS JOIN blk
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      -- Only ACTIVE learners may be allocated a bed. Mirrors
      -- fn_hostel_unallocated_candidates (manual picker) and v_learner_hostelites.
      AND lp.lifecycle_status = 'active'
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id = p_block_id)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      AND (blk.t IS NULL OR blk.t NOT IN ('boys','girls')
           OR gp.gender IS NULL OR btrim(gp.gender) = ''
           OR (blk.t = 'boys'  AND lower(btrim(gp.gender)) IN ('male','m'))
           OR (blk.t = 'girls' AND lower(btrim(gp.gender)) IN ('female','f')))
      -- Skip students who already have an active or pending-approval bed.
      -- Applied here (before the LATERAL eligibility joins) so we don't burn
      -- fn_hostel_learner_room/mess_categories on students who can't be placed.
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations ha2
        JOIN profiles pr2 ON pr2.learner_id = lp.id
        WHERE ha2.learner_id = pr2.id
          AND ha2.status IN ('active', 'pending_approval')
      )
  ),
  base AS (
    SELECT
      c.id AS learner_id,
      COALESCE(p.full_name,
               NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
               p.email, '—') AS full_name,
      p.email, inst.name AS institution_name, prog.program_name, sem.semester_name,
      lower(trim(p.gender)) AS gender,
      (p.id IS NOT NULL) AS has_profile,
      c.academic_year_id, ay.academic_year_name, c.room_cats, c.mess_cats,
      c.room_cats[1] AS resolved_room_category_id,
      rc.name AS resolved_room_category_name, rc.type AS resolved_room_category_type,
      c.mess_cats[1] AS resolved_mess_category_id, mc.name AS resolved_mess_category_name,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id = c.id AND b.fee_source = 'academic'
           AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id = c.id AND b.fee_source = 'academic'
           AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id = c.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name
         FROM billing_student_bills b JOIN academic_years ay2 ON ay2.id = b.academic_year_id
        WHERE b.student_id = c.id AND b.fee_source = 'academic'
          AND b.status NOT IN ('cancelled','superseded')
          AND b.academic_year_id IS NOT NULL
          AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
        ORDER BY b.created_at DESC LIMIT 1) AS bill_other_year_name,
      fn_learner_current_year_academic_fee(c.id) AS current_year_fee,
      -- not_allocated is always true here (cohort CTE already filtered allocated
      -- students out), but kept for the verdict/exclusion_reason expressions below.
      true AS not_allocated,
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        JOIN hostel_categories hc ON hc.id = rm.category_id
        WHERE rm.block_id = p_block_id AND rm.room_purpose = 'student'
          AND (p_floor IS NULL OR rm.floor = p_floor)
          AND rm.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type = 'boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type = 'girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        WHERE rm.block_id = p_block_id AND rm.room_purpose = 'student'
          AND (p_floor IS NULL OR rm.floor = p_floor)
          AND NOT (rm.category_id = ANY(c.room_cats))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_ok_other_category,
      EXISTS (
        SELECT 1 FROM hostel_beds bd JOIN hostel_rooms r ON r.id = bd.room_id
        JOIN hostel_categories hc ON hc.id = r.category_id
        WHERE r.block_id = p_block_id AND r.room_purpose = 'student'
          AND bd.status = 'available'
          AND (p_floor IS NULL OR r.floor = p_floor)
          AND r.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type = 'boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type = 'girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(r.id, c.institution_id)
          AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                          WHERE a.bed_id = bd.id AND a.status IN ('active','pending_approval'))
          AND fn_learner_strictly_eligible_for_room(c.id, r.id, p_strict)
      ) AS bed_available
    FROM cohort c
    LEFT JOIN profiles p       ON p.learner_id = c.id
    LEFT JOIN institutions inst ON inst.id = c.institution_id
    LEFT JOIN programs prog     ON prog.id = c.program_id
    LEFT JOIN semesters sem     ON sem.id = c.semester_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN hostel_categories rc ON rc.id = c.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id = c.mess_cats[1]
  ),
  scored AS (
    SELECT b.*,
      (b.resolved_room_category_type IS NULL
        OR (b.resolved_room_category_type = 'boys'  AND b.gender IN ('male','m'))
        OR (b.resolved_room_category_type = 'girls' AND b.gender IN ('female','f'))) AS gender_ok
    FROM base b
  )
  SELECT
    s.learner_id, s.full_name, s.email, s.institution_name, s.program_name, s.semester_name,
    s.gender, s.has_profile, s.gender_ok, s.not_allocated, s.physical_rule_ok, s.bed_available,
    s.academic_year_id, s.academic_year_name,
    s.academic_bill_count, s.current_year_bill_count, s.bill_other_year_name, s.current_year_fee,
    s.resolved_room_category_id, s.resolved_room_category_name,
    s.resolved_mess_category_id, s.resolved_mess_category_name,
    CASE
      WHEN s.current_year_bill_count > 0 THEN 'matched'
      WHEN s.bill_other_year_name IS NOT NULL THEN 'different_year'
      WHEN s.academic_bill_count > 0 THEN 'untagged'
      ELSE 'none'
    END AS bill_state,
    CASE
      WHEN s.academic_year_id IS NULL  THEN 'prerequisite'
      WHEN s.current_year_fee IS NULL  THEN 'prerequisite'
      WHEN s.room_cats IS NULL         THEN 'prerequisite'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.physical_rule_ok OR NOT s.bed_available
                                       THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN s.academic_year_id IS NULL  THEN 'out'
      WHEN s.current_year_fee IS NULL  THEN 'out'
      WHEN s.room_cats IS NULL         THEN 'out'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.physical_rule_ok OR NOT s.bed_available
                                       THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'Academic year not set on student profile'
      WHEN s.current_year_fee IS NULL THEN
        CASE
          WHEN s.bill_other_year_name IS NOT NULL THEN 'Bill tagged to a different academic year (' || s.bill_other_year_name || ')'
          WHEN s.academic_bill_count  > 0         THEN 'Academic bills exist but are not year-tagged'
          ELSE 'No academic bill generated for ' || COALESCE(s.academic_year_name, 'the academic year')
        END
      WHEN s.room_cats IS NULL THEN 'No Category-Eligibility rule resolves a room category for this student'
      WHEN NOT s.has_profile   THEN 'No login profile'
      WHEN NOT s.gender_ok     THEN 'Gender does not match the resolved room category'
      WHEN NOT s.physical_rule_ok AND s.physical_ok_other_category THEN
        'Rooms they may occupy in this block are a different room category than their eligible '
        || COALESCE(s.resolved_room_category_name, 'category')
        || ' — fix the reservation rooms or the Category-Eligibility band'
      WHEN NOT s.physical_rule_ok THEN
        CASE WHEN p_strict
          THEN 'No physical-room rule in this block reserves a room for this cohort (strict mode)'
          ELSE 'No room they can occupy in their category — rooms here are reserved for other cohorts, or this cohort''s reserved rooms are in another block'
        END
      WHEN NOT s.bed_available THEN 'Their category rooms are full — no free bed'
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_auto_allocate_classic — the allocator (must match the preview exactly)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(
  p_block_id uuid,
  p_hostel_year_id uuid,
  p_strict boolean DEFAULT false,
  p_floor integer DEFAULT NULL::integer,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0;
  v_block_type text; v_ay uuid;
  cand record; v_bed uuid; v_room uuid; v_mess uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.create')) THEN
    RAISE EXCEPTION 'Not authorized to run auto-allocation';
  END IF;

  SELECT hostel_type::text INTO v_block_type FROM hostel_blocks WHERE id=p_block_id;
  IF v_block_type IS NULL THEN RAISE EXCEPTION 'Block not found'; END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (p_block_id, NULL, p_hostel_year_id, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR cand IN
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lp.institution_id AS inst,
           lower(trim(p.gender)) AS gender,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    JOIN hostel_block_institutions hbi ON hbi.block_id = p_block_id AND hbi.institution_id = lp.institution_id
    JOIN institutions inst_t ON inst_t.id = lp.institution_id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      -- Only ACTIVE learners may be allocated a bed. Keep in lockstep with
      -- fn_auto_allocate_candidates so preview == generate.
      AND lp.lifecycle_status = 'active'
      AND room_elig.cats IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
    ORDER BY hbi.is_primary DESC,
             lower(coalesce(inst_t.name,'')),
             lower(coalesce(lp.first_name,'')), lower(coalesce(lp.last_name,'')), lp.id
  LOOP
    v_ay := COALESCE(cand.ay_id, (SELECT id FROM academic_years WHERE institution_id=cand.inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    v_bed := NULL; v_room := NULL;
    SELECT b.id, r.id INTO v_bed, v_room
    FROM hostel_beds b
    JOIN hostel_rooms r ON r.id=b.room_id
    JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE r.block_id=p_block_id AND r.room_purpose='student' AND b.status='available'
      AND (p_floor IS NULL OR r.floor = p_floor)
      AND r.category_id = ANY(cand.room_cats)
      AND (hc.type IS NULL
           OR (hc.type='boys'  AND cand.gender IN ('male','m'))
           OR (hc.type='girls' AND cand.gender IN ('female','f')))
      AND fn_room_serves_institution(r.id, cand.inst)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_strictly_eligible_for_room(cand.lp_id, r.id, p_strict)
    ORDER BY array_position(cand.room_cats, r.category_id), r.floor, r.room_number, b.bed_number
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

    v_mess := CASE WHEN cand.mess_cats IS NOT NULL THEN cand.mess_cats[1] ELSE NULL END;
    UPDATE learners_profiles
      SET hostel_category_id = (SELECT category_id FROM hostel_rooms WHERE id = v_room),
          mess_category_id   = COALESCE(v_mess, mess_category_id),
          updated_at = now()
      WHERE id = cand.lp_id;

    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated (%s physical mode; rules-driven category + mess; floor scope: %s). %s skipped (no free bed they can occupy / reserved rooms in another block / gender / no academic year / off-scope floor). Strict: learners with no rule-resolved room category are excluded. Cohort: lifecycle_status = active only.',
                       v_alloc, CASE WHEN p_strict THEN 'STRICT — only cohorts matching a physical rule' ELSE 'open — rule-free rooms shared' END,
                       COALESCE('floor ' || p_floor::text, 'all floors'), v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fn_auto_allocate_preview — headline counters on the auto page
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(
  p_block_id uuid,
  p_floor integer DEFAULT NULL::integer
)
 RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cohort AS (
    SELECT lp.id, lp.institution_id,
           (SELECT array_agg(category_id) FROM fn_hostel_learner_room_categories(lp.id)) AS room_cats
    FROM learners_profiles lp
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      -- Only ACTIVE learners may be allocated a bed. Keep in lockstep with
      -- fn_auto_allocate_candidates / fn_auto_allocate_classic.
      AND lp.lifecycle_status = 'active'
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
  )
  SELECT
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM cohort c WHERE c.room_cats IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=c.id)),
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.room_purpose='student' AND b.status='available'
         AND (p_floor IS NULL OR r.floor = p_floor)
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id=p_block_id AND is_active);
$function$;
