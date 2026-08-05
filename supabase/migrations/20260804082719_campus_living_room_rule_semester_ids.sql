-- Physical-room eligibility rules: one rule may now name SEVERAL semesters,
-- and the ORDER of that list is the auto-allocation fill order.
--
-- Why an array and not a child table: the order IS the data here. An
-- ordered array needs no sort_order column to keep consistent, and it keeps
-- each of the three consuming SQL functions to a one-line predicate swap
-- instead of gaining an EXISTS subquery (that layer is the risky one).
--
-- semester_ids semantics:
--   '{}'                       → any semester (what semester_id IS NULL meant)
--   ARRAY[sem_a]               → exactly that semester (what semester_id = x meant)
--   ARRAY[sem_a, sem_b, sem_c] → all three eligible; fill sem_a first, then sem_b, …
--
-- Trade-off accepted: dropping semester_id drops its FK to semesters(id)
-- ON DELETE CASCADE. A deleted semester now leaves a dead uuid in the array
-- rather than cascading the rule away; the predicate simply stops matching it
-- (degrades to "that semester is no longer eligible"), it does not error.

-- ── 1. Schema ────────────────────────────────────────────────────────────
ALTER TABLE hostel_room_eligibility_rules
  ADD COLUMN IF NOT EXISTS semester_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill: a single semester becomes a one-element list. Guarded so a re-run
-- can't clobber a list an operator has since edited.
UPDATE hostel_room_eligibility_rules
   SET semester_ids = ARRAY[semester_id]
 WHERE semester_id IS NOT NULL
   AND cardinality(semester_ids) = 0;

ALTER TABLE hostel_room_eligibility_rules
  DROP COLUMN IF EXISTS semester_id;

COMMENT ON COLUMN hostel_room_eligibility_rules.semester_ids IS
  'Eligible semesters, in fill-priority order. Empty = any semester. Order is honoured by fn_auto_allocate_classic.';

-- ── 2. Eligibility predicate (rebuilt from the live definitions) ─────────
CREATE OR REPLACE FUNCTION public.fn_learner_eligible_for_room(p_learner_id uuid, p_room_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
             -- Empty list = any semester. A learner with no semester set matches
             -- only the empty list (uuid = ANY(...) yields NULL → not matched),
             -- exactly as `= semester_id` behaved before.
             AND (cardinality(c.semester_ids) = 0 OR v_semester = ANY(c.semester_ids))
         )
    INTO v_has_covering, v_matches;

  IF NOT v_has_covering THEN
    RETURN true;    -- uncovered room → open to all
  END IF;
  RETURN v_matches; -- covered → only matching learners
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_learner_strictly_eligible_for_room(p_learner_id uuid, p_room_id uuid, p_strict boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_block uuid; v_floor int;
  v_inst uuid; v_degree uuid; v_dept uuid; v_program uuid; v_semester uuid;
  v_has_covering boolean; v_matches boolean; v_pinned boolean;
BEGIN
  SELECT block_id, floor INTO v_block, v_floor FROM hostel_rooms WHERE id = p_room_id;
  IF v_block IS NULL THEN RETURN false; END IF;

  SELECT institution_id, degree_id, department_id, program_id, semester_id
    INTO v_inst, v_degree, v_dept, v_program, v_semester
    FROM learners_profiles WHERE id = p_learner_id;

  WITH covering AS (
    SELECT r.*
    FROM hostel_room_eligibility_rules r
    WHERE r.is_active AND r.block_id = v_block
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
             AND (cardinality(c.semester_ids) = 0 OR v_semester = ANY(c.semester_ids))
         )
    INTO v_has_covering, v_matches;

  IF v_matches THEN RETURN true; END IF;        -- room reserved for THIS cohort
  IF p_strict THEN RETURN false; END IF;        -- STRICT: a matching physical rule is required
  IF v_has_covering THEN RETURN false; END IF;  -- room reserved for ANOTHER cohort

  -- Open (rule-free) room: admit only if the learner's cohort has no matching reservation
  -- anywhere — a reserved cohort is PINNED to its reserved rooms.
  SELECT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.is_active AND r.institution_id = v_inst
      AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
      AND (r.department_id IS NULL OR r.department_id = v_dept)
      AND (r.program_id    IS NULL OR r.program_id    = v_program)
      AND (cardinality(r.semester_ids) = 0 OR v_semester = ANY(r.semester_ids))
  ) INTO v_pinned;

  RETURN NOT v_pinned;
END;
$function$;

-- ── 3. Auto-allocation: honour the rule's semester fill order ────────────
-- The only change vs the previous definition is the sem_fill LATERAL and the
-- new leading ORDER BY term.
--
-- Rank is computed ONLY from rules that declare more than one semester, and
-- COALESCEs to 1 — the same tier an unranked learner gets. So on every rule
-- that names 0 or 1 semester the ORDER BY is byte-identical to before; only a
-- genuinely multi-semester rule creates tiers 2, 3, ….
--
-- This is safe to apply globally because fn_learner_strictly_eligible_for_room
-- already pins cohorts: rooms a rule covers admit only its cohort, AND that
-- cohort is barred from rule-free rooms. The bed pools are therefore disjoint,
-- so reordering the loop cannot change any other cohort's outcome — it only
-- decides which of THIS rule's semesters claims THIS rule's beds first.
--
-- min() across overlapping rules = the learner's strongest claim wins.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(p_block_id uuid, p_hostel_year_id uuid, p_strict boolean DEFAULT false, p_floor integer DEFAULT NULL::integer, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid)
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
    -- Fill priority from the matching rule's ordered semester list (1-based).
    -- Only multi-semester rules rank; everything else stays NULL → tier 1.
    LEFT JOIN LATERAL (
      SELECT min(array_position(r.semester_ids, lp.semester_id)) AS rank
      FROM hostel_room_eligibility_rules r
      WHERE r.is_active
        AND r.block_id = p_block_id
        AND r.institution_id = lp.institution_id
        AND (r.degree_id     IS NULL OR r.degree_id     = lp.degree_id)
        AND (r.department_id IS NULL OR r.department_id = lp.department_id)
        AND (r.program_id    IS NULL OR r.program_id    = lp.program_id)
        AND cardinality(r.semester_ids) > 1
        AND lp.semester_id = ANY(r.semester_ids)
    ) sem_fill ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      -- Only ACTIVE learners may be allocated a bed. Keep in lockstep with
      -- fn_auto_allocate_candidates so preview == generate.
      AND lp.lifecycle_status = 'active'
      AND room_elig.cats IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
    ORDER BY COALESCE(sem_fill.rank, 1),
             hbi.is_primary DESC,
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

