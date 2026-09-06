-- Auto-allocation: relax the PHYSICAL-ROOM gate to fail-open, and fill the cohort
-- in institution-priority order. (Category room+mess eligibility stays STRICT/fee-based.)
--
-- Stakeholder decision (2026-06-09):
--  * Physical rooms: a room COVERED by an active physical-room rule stays restricted to
--    the cohort that rule matches; a room with NO covering rule is OPEN to every eligible
--    student of any institution the block serves (hostel_block_institutions). Previously a
--    no-rule room was unusable and a block with zero rules threw — which made auto-allocation
--    non-functional on real data (5 of 6 blocks have zero rules).
--  * Fill order: the block's primary institution claims shared/open rooms first, then the
--    remaining served institutions in name order, learners A->Z within each institution.
--    (No visible effect today — each block serves one institution — correct for the future
--    multi-institution case where earlier institutions must not hog shared beds.)

-- 1) Physical-room eligibility helper: fail-OPEN on rooms with no covering rule.
--    Kept the name (only the two auto-allocate RPCs call it; no other fn, no RLS policy)
--    so no signature/dependency churn. "strict" now means strict WHERE a rule exists.
CREATE OR REPLACE FUNCTION public.fn_learner_strictly_eligible_for_room(p_learner_id uuid, p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_block uuid;
  v_floor int;
  v_inst uuid; v_degree uuid; v_dept uuid; v_program uuid; v_semester uuid;
  v_has_covering boolean;
  v_matches boolean;
BEGIN
  SELECT block_id, floor INTO v_block, v_floor FROM hostel_rooms WHERE id = p_room_id;
  IF v_block IS NULL THEN RETURN false; END IF;

  SELECT institution_id, degree_id, department_id, program_id, semester_id
    INTO v_inst, v_degree, v_dept, v_program, v_semester
    FROM learners_profiles WHERE id = p_learner_id;

  WITH covering AS (
    SELECT r.*
    FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.block_id = v_block
      AND CASE
            WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id = r.id)
              THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                           WHERE rr.rule_id = r.id AND rr.room_id = p_room_id)
            ELSE (r.floor IS NULL OR r.floor = v_floor)
          END
  )
  SELECT EXISTS (SELECT 1 FROM covering),
         EXISTS (
           SELECT 1 FROM covering c
           WHERE c.institution_id = v_inst
             AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
             AND (c.department_id IS NULL OR c.department_id = v_dept)
             AND (c.program_id    IS NULL OR c.program_id    = v_program)
             AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)
         )
    INTO v_has_covering, v_matches;

  -- FAIL-OPEN: covered room -> must match a covering rule; uncovered room -> open to all.
  RETURN v_matches OR NOT v_has_covering;
END;
$function$;

-- 2) Generator: strict rules-driven CATEGORY sweep + mess assignment, fail-open physical
--    rooms, institution-priority fill order.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(p_block_id uuid, p_hostel_year_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  -- NOTE: no longer requires the block to have physical-room rules. Rooms without a
  -- covering rule are open to all served institutions (fn_learner_strictly_eligible_for_room).

  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (p_block_id, NULL, p_hostel_year_id, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  -- Cohort in institution-priority order: primary institution first, then by institution
  -- name, then learners A->Z. Greedy bed-claim in this order means earlier institutions get
  -- first pick of shared/open rooms.
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
      AND room_elig.cats IS NOT NULL  -- STRICT: rules must resolve a room category
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
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
      AND r.category_id = ANY(cand.room_cats)
      AND (hc.type IS NULL
           OR (hc.type='boys'  AND cand.gender IN ('male','m'))
           OR (hc.type='girls' AND cand.gender IN ('female','f')))
      AND fn_room_serves_institution(r.id, cand.inst)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_strictly_eligible_for_room(cand.lp_id, r.id)
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

    -- Mess category is assigned from rules at proposal time (rules-derived, idempotent); a rejected/reset batch does NOT revert it.
    v_mess := CASE WHEN cand.mess_cats IS NOT NULL THEN cand.mess_cats[1] ELSE NULL END;
    IF v_mess IS NOT NULL THEN
      UPDATE learners_profiles SET mess_category_id = v_mess WHERE id = cand.lp_id;
    END IF;

    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated (rules-driven category + mess; physical rooms fail-open: reserved rooms go to their cohort, unreserved rooms open to served institutions; filled primary-institution first, then A-Z). %s skipped (no free bed they can occupy / gender / no academic year). Strict: learners with no rule-resolved room category (e.g. no current-year bill) are excluded from the cohort.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- 3) Per-learner validation preview. physical_rule_ok now means fail-open physical ACCESS
--    (a matching rule OR an open no-rule room exists in their category); it no longer
--    excludes a placeable student in a no-rule block.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(p_block_id uuid)
RETURNS TABLE(
  learner_id uuid, full_name text, email text, program_name text, gender text,
  has_profile boolean, gender_ok boolean, not_allocated boolean,
  physical_rule_ok boolean, bed_available boolean,
  academic_year_id uuid, academic_year_name text,
  academic_bill_count integer, current_year_bill_count integer, bill_other_year_name text,
  current_year_fee numeric,
  resolved_room_category_id uuid, resolved_room_category_name text,
  resolved_mess_category_id uuid, resolved_mess_category_name text,
  bill_state text, stage text, verdict text, exclusion_reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cohort AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
           lp.academic_year_id, lp.first_name, lp.last_name,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
  ),
  base AS (
    SELECT
      c.id AS learner_id,
      COALESCE(p.full_name, p.email, '—') AS full_name,
      p.email, prog.program_name, lower(trim(p.gender)) AS gender,
      (p.id IS NOT NULL) AS has_profile,
      c.academic_year_id, ay.academic_year_name, c.room_cats, c.mess_cats,
      c.room_cats[1] AS resolved_room_category_id, rc.name AS resolved_room_category_name, rc.type AS resolved_room_category_type,
      c.mess_cats[1] AS resolved_mess_category_id, mc.name AS resolved_mess_category_name,
      (SELECT count(*)::int FROM billing_student_bills b WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded') AND b.academic_year_id = c.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name FROM billing_student_bills b JOIN academic_years ay2 ON ay2.id=b.academic_year_id
         WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id IS NOT NULL AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
         ORDER BY b.created_at DESC LIMIT 1) AS bill_other_year_name,
      fn_learner_current_year_academic_fee(c.id) AS current_year_fee,
      NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval')) AS not_allocated,
      -- physical ACCESS (fail-open): a student room in their category they may occupy —
      -- gender-matched, served by their institution, and either rule-matched or rule-free.
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        JOIN hostel_categories hc ON hc.id = rm.category_id
        WHERE rm.block_id=p_block_id AND rm.room_purpose='student'
          AND rm.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type='boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type='girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id)
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM hostel_beds bd JOIN hostel_rooms r ON r.id=bd.room_id
        JOIN hostel_categories hc ON hc.id = r.category_id
        WHERE r.block_id=p_block_id AND r.room_purpose='student' AND bd.status='available'
          AND r.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type='boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type='girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(r.id, c.institution_id)
          AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=bd.id AND a.status IN ('active','pending_approval'))
          AND fn_learner_strictly_eligible_for_room(c.id, r.id)
      ) AS bed_available
    FROM cohort c
    LEFT JOIN profiles p ON p.learner_id = c.id
    LEFT JOIN programs prog ON prog.id = c.program_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN hostel_categories rc ON rc.id = c.room_cats[1]
    LEFT JOIN mess_categories mc ON mc.id = c.mess_cats[1]
  ),
  scored AS (
    SELECT b.*,
      (b.resolved_room_category_type IS NULL
        OR (b.resolved_room_category_type='boys'  AND b.gender IN ('male','m'))
        OR (b.resolved_room_category_type='girls' AND b.gender IN ('female','f'))) AS gender_ok
    FROM base b
  )
  SELECT
    s.learner_id, s.full_name, s.email, s.program_name, s.gender,
    s.has_profile, s.gender_ok, s.not_allocated, s.physical_rule_ok, s.bed_available,
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
      WHEN s.academic_year_id IS NULL THEN 'prerequisite'
      WHEN s.current_year_fee IS NULL THEN 'prerequisite'
      WHEN s.room_cats IS NULL THEN 'prerequisite'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.not_allocated OR NOT s.physical_rule_ok OR NOT s.bed_available THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'out'
      WHEN s.current_year_fee IS NULL THEN 'out'
      WHEN s.room_cats IS NULL THEN 'out'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.not_allocated OR NOT s.physical_rule_ok OR NOT s.bed_available THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'Academic year not set on student profile'
      WHEN s.current_year_fee IS NULL THEN
        CASE
          WHEN s.bill_other_year_name IS NOT NULL THEN 'Bill tagged to a different academic year (' || s.bill_other_year_name || ')'
          WHEN s.academic_bill_count > 0 THEN 'Academic bills exist but are not year-tagged'
          ELSE 'No academic bill generated for ' || COALESCE(s.academic_year_name, 'the academic year')
        END
      WHEN s.room_cats IS NULL THEN 'No Category-Eligibility rule resolves a room category for this student'
      WHEN NOT s.has_profile THEN 'No login profile'
      WHEN NOT s.gender_ok THEN 'Gender does not match the resolved room category'
      WHEN NOT s.not_allocated THEN 'Already allocated'
      WHEN NOT s.physical_rule_ok THEN 'No room they can occupy in their category — all matching rooms are reserved for other cohorts'
      WHEN NOT s.bed_available THEN 'Their category rooms are full — no free bed'
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

-- 4) Aggregate preview — available_beds counts ALL free student beds (rule-covered OR open),
--    since no-rule rooms are now fillable.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(p_block_id uuid)
RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cohort AS (
    SELECT lp.id, lp.institution_id,
           (SELECT array_agg(category_id) FROM fn_hostel_learner_room_categories(lp.id)) AS room_cats
    FROM learners_profiles lp
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
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
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id=p_block_id AND is_active);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_preview(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_preview(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid) TO authenticated;
