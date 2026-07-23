-- 20260610130000_pin_reserved_cohorts.sql
-- BUG: a physical-room rule reserving rooms for a cohort in one block did NOT stop
-- that cohort being auto-allocated into rule-free (open) rooms of ANOTHER block.
-- Real case 2026-06-10: rule "JKKN Dental / UG / Dentistry (UG) / BDS / 2 Year ->
-- Girls Hostel C (5 rooms)" existed, but running auto-allocation on Girls Hostel A
-- placed those BDS 2-Year students into Block A's uncovered rooms — Block A serves
-- Dental, its rules cover only some rooms, and fn_learner_strictly_eligible_for_room
-- only ever looked at rules covering the TARGET room's block (fail-open otherwise,
-- per the 2026-06-09 decision).
--
-- FIX — cohort pinning: a learner whose cohort matches an active rule ANYWHERE is
-- "pinned" to rooms covered by a matching rule. Semantics now:
--   * room covered by rules  -> learner must match a covering rule (unchanged);
--   * room with no rule      -> open ONLY to learners whose cohort has no matching
--                               reservation in any block (unpinned learners).
-- So running auto-allocation on Block A skips BDS 2-Year (their rooms are in C),
-- and running it on Block C places them into their reserved rooms.
--
-- Rebuilt from the latest defs (verified against live prod 2026-06-10):
--   fn_learner_strictly_eligible_for_room  <- 20260609120000
--   fn_auto_allocate_classic               <- 20260609120000 (notes wording only)
--   fn_auto_allocate_candidates            <- 20260609130000 (exclusion wording only)
--   fn_explain_allocation                  <- 20260610090000 (+ pinned fields)

-- 1) Physical-room eligibility: covered rooms unchanged; open rooms admit only
--    unpinned cohorts.
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
  v_pinned boolean;
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

  IF v_matches THEN RETURN true; END IF;       -- room reserved for THIS cohort
  IF v_has_covering THEN RETURN false; END IF; -- room reserved for ANOTHER cohort

  -- Open (rule-free) room: admit only if the learner's cohort has no matching
  -- reservation anywhere — a reserved cohort is PINNED to its reserved rooms.
  SELECT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.institution_id = v_inst
      AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
      AND (r.department_id IS NULL OR r.department_id = v_dept)
      AND (r.program_id    IS NULL OR r.program_id    = v_program)
      AND (r.semester_id   IS NULL OR r.semester_id   = v_semester)
  ) INTO v_pinned;

  RETURN NOT v_pinned;
END;
$function$;

-- 2) Generator: behaviour comes from (1); only the operator-facing batch notes wording
--    is updated to describe pinning.
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
        notes = format('%s allocated (rules-driven category + mess; physical rooms: reserved rooms go to their matching cohort, cohorts with a reservation in ANY block are placed only in their reserved rooms, rule-free rooms are open to served-institution learners without a reservation; filled primary-institution first, then A-Z). %s skipped (no free bed they can occupy / reserved rooms in another block / gender / no academic year). Strict: learners with no rule-resolved room category (e.g. no current-year bill) are excluded from the cohort.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- 3) Per-learner validation preview: pinning is enforced inside
--    fn_learner_strictly_eligible_for_room; only the exclusion wording changes.
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
      COALESCE(p.full_name,
               NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
               p.email, '—') AS full_name,
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
      -- physical ACCESS: a student room in their category they may occupy — gender-matched,
      -- served by their institution, rule-matched OR (rule-free AND cohort unreserved).
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
      WHEN NOT s.physical_rule_ok THEN 'No room they can occupy in their category — rooms here are reserved for other cohorts, or this cohort''s reserved rooms are in another block'
      WHEN NOT s.bed_available THEN 'Their category rooms are full — no free bed'
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

-- 4) Explain RPC: physical access mirrors the new pinning semantics and reports it.
CREATE OR REPLACE FUNCTION public.fn_explain_allocation(p_allocation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid; v_room uuid; v_block uuid; v_floor int; v_room_cat uuid;
  v_room_number text; v_status text; v_room_cat_name text; v_room_cat_type text;
  v_lp uuid; v_inst uuid; v_degree uuid; v_dept uuid; v_program uuid; v_semester uuid; v_ay uuid;
  v_quota uuid; v_gender text;
  v_inst_name text; v_degree_name text; v_dept_name text; v_program_name text;
  v_semester_name text; v_quota_name text;
  v_room_cats uuid[]; v_mess_cats uuid[];
  v_resolved_room_name text; v_resolved_mess_name text;
  v_fee numeric; v_ay_name text;
  v_has_covering boolean; v_matched boolean; v_rules jsonb;
  v_pinned boolean; v_pinned_blocks text;
  v_serves boolean; v_cur_bill int; v_acad_bill int;
  v_elig_rules jsonb; v_bills jsonb;
BEGIN
  SELECT a.learner_id, a.room_id, a.status, r.room_number, r.block_id, r.floor, r.category_id
    INTO v_profile, v_room, v_status, v_room_number, v_block, v_floor, v_room_cat
    FROM hostel_allocations a LEFT JOIN hostel_rooms r ON r.id = a.room_id
    WHERE a.id = p_allocation_id;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error','allocation_not_found'); END IF;

  -- Bridge profiles.id (allocation key) -> learners_profiles (eligibility/category data).
  SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
         lp.academic_year_id, lp.quota_id
    INTO v_lp, v_inst, v_degree, v_dept, v_program, v_semester, v_ay, v_quota
    FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
    WHERE p.id = v_profile;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = v_profile;
  SELECT name, type INTO v_room_cat_name, v_room_cat_type FROM hostel_categories WHERE id = v_room_cat;

  SELECT name INTO v_inst_name FROM institutions WHERE id = v_inst;
  SELECT degree_name INTO v_degree_name FROM degrees WHERE id = v_degree;
  SELECT department_name INTO v_dept_name FROM departments WHERE id = v_dept;
  SELECT program_name INTO v_program_name FROM programs WHERE id = v_program;
  SELECT semester_name INTO v_semester_name FROM semesters WHERE id = v_semester;
  SELECT name INTO v_quota_name FROM quotas WHERE id = v_quota;

  -- Category eligibility (fee-aware program eligibility allow-sets).
  SELECT array_agg(category_id) INTO v_room_cats FROM fn_hostel_learner_room_categories(v_lp);
  SELECT array_agg(category_id) INTO v_mess_cats FROM fn_hostel_learner_mess_categories(v_lp);
  SELECT name INTO v_resolved_room_name FROM hostel_categories WHERE id = v_room_cats[1];
  SELECT name INTO v_resolved_mess_name FROM mess_categories WHERE id = v_mess_cats[1];
  v_fee := fn_learner_current_year_academic_fee(v_lp);
  SELECT academic_year_name INTO v_ay_name FROM academic_years WHERE id = v_ay;
  v_serves := fn_room_serves_institution(v_room, v_inst);

  -- Program-Eligibility conditions configured for the learner's institution, with
  -- per-condition verdicts; selected_room/selected_mess mark the winner scope exactly
  -- as fn_hostel_effective_room/mess_categories resolve it.
  WITH rules AS (
    SELECT e.*,
           COALESCE(e.program_id IS NULL OR e.program_id = v_program, false) AS program_ok,
           COALESCE(e.quota_id   IS NULL OR e.quota_id   = v_quota,   false) AS quota_ok,
           (v_fee IS NOT NULL
              AND (e.fee_min IS NULL OR v_fee >= e.fee_min)
              AND (e.fee_max IS NULL OR v_fee <  e.fee_max)) AS fee_ok,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = v_inst AND e.is_active
  ),
  room_winner AS (
    SELECT program_id, quota_id, fee_min, fee_max FROM rules
    WHERE room_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  ),
  mess_winner AS (
    SELECT program_id, quota_id, fee_min, fee_max FROM rules
    WHERE mess_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT jsonb_agg(jsonb_build_object(
      'program', (SELECT program_name FROM programs WHERE id = r.program_id),
      'quota',   (SELECT name FROM quotas WHERE id = r.quota_id),
      'fee_min', r.fee_min,
      'fee_max', r.fee_max,
      'room_category', (SELECT name FROM hostel_categories WHERE id = r.room_category_id),
      'mess_category', (SELECT name FROM mess_categories  WHERE id = r.mess_category_id),
      'program_ok', r.program_ok,
      'quota_ok',   r.quota_ok,
      'fee_ok',     r.fee_ok,
      'matched',    (r.program_ok AND r.quota_ok AND r.fee_ok),
      'selected_room', (r.room_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM room_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_id   IS NOT DISTINCT FROM w.quota_id
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max)),
      'selected_mess', (r.mess_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM mess_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_id   IS NOT DISTINCT FROM w.quota_id
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max))
    ) ORDER BY (r.program_ok AND r.quota_ok AND r.fee_ok) DESC, r.specificity DESC,
               r.fee_min ASC NULLS FIRST)
  INTO v_elig_rules
  FROM rules r;

  -- The learner's academic bills; `counted` mirrors fn_learner_current_year_academic_fee
  -- (fee_source=academic, not cancelled/superseded, tagged to the learner's current AY).
  SELECT jsonb_agg(jsonb_build_object(
      'description', b.bill_description,
      'amount', b.final_amount,
      'status', b.status,
      'due_date', b.due_date,
      'academic_year', (SELECT academic_year_name FROM academic_years WHERE id = b.academic_year_id),
      'counted', (COALESCE(b.status NOT IN ('cancelled','superseded'), false)
                  AND b.academic_year_id IS NOT NULL
                  AND b.academic_year_id IS NOT DISTINCT FROM v_ay)
    ) ORDER BY b.due_date DESC)
  INTO v_bills
  FROM billing_student_bills b
  WHERE b.student_id = v_lp AND b.fee_source = 'academic';

  -- Physical-room rule coverage for the ALLOCATED room (mirrors fn_learner_strictly_eligible_for_room),
  -- with per-dimension rule-vs-learner verdicts for the comparison UI.
  WITH covering AS (
    SELECT r.* FROM hostel_room_eligibility_rules r
    WHERE r.is_active AND r.block_id = v_block
      AND CASE
            WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
              THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=v_room)
            ELSE (r.floor IS NULL OR r.floor = v_floor)
          END
  )
  SELECT
    EXISTS (SELECT 1 FROM covering),
    EXISTS (SELECT 1 FROM covering c WHERE c.institution_id=v_inst
              AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
              AND (c.department_id IS NULL OR c.department_id = v_dept)
              AND (c.program_id    IS NULL OR c.program_id    = v_program)
              AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)),
    (SELECT jsonb_agg(jsonb_build_object(
       'rule_name', COALESCE(NULLIF(btrim(c.rule_name),''),'(unnamed rule)'),
       'floor', c.floor,
       'matched', COALESCE((c.institution_id=v_inst
              AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
              AND (c.department_id IS NULL OR c.department_id = v_dept)
              AND (c.program_id    IS NULL OR c.program_id    = v_program)
              AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)), false),
       'cohort', NULLIF(concat_ws(' · ',
         (SELECT degree_name     FROM degrees     WHERE id=c.degree_id),
         (SELECT department_name FROM departments WHERE id=c.department_id),
         (SELECT program_name    FROM programs    WHERE id=c.program_id),
         (SELECT semester_name   FROM semesters   WHERE id=c.semester_id)),''),
       'institution',    (SELECT name FROM institutions WHERE id=c.institution_id),
       'institution_ok', COALESCE(c.institution_id = v_inst, false),
       'degree',         (SELECT degree_name FROM degrees WHERE id=c.degree_id),
       'degree_ok',      COALESCE((c.degree_id IS NULL OR c.degree_id = v_degree), false),
       'department',     (SELECT department_name FROM departments WHERE id=c.department_id),
       'department_ok',  COALESCE((c.department_id IS NULL OR c.department_id = v_dept), false),
       'program',        (SELECT program_name FROM programs WHERE id=c.program_id),
       'program_ok',     COALESCE((c.program_id IS NULL OR c.program_id = v_program), false),
       'semester',       (SELECT semester_name FROM semesters WHERE id=c.semester_id),
       'semester_ok',    COALESCE((c.semester_id IS NULL OR c.semester_id = v_semester), false)
     ) ORDER BY c.rule_name) FROM covering c)
  INTO v_has_covering, v_matched, v_rules;

  -- Cohort pinning: does ANY active rule (any block) match this learner's cohort?
  SELECT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.institution_id = v_inst
      AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
      AND (r.department_id IS NULL OR r.department_id = v_dept)
      AND (r.program_id    IS NULL OR r.program_id    = v_program)
      AND (r.semester_id   IS NULL OR r.semester_id   = v_semester)
  ),
  (SELECT string_agg(DISTINCT hb.name, ', ')
     FROM hostel_room_eligibility_rules r
     JOIN hostel_blocks hb ON hb.id = r.block_id
     WHERE r.is_active
       AND r.institution_id = v_inst
       AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
       AND (r.department_id IS NULL OR r.department_id = v_dept)
       AND (r.program_id    IS NULL OR r.program_id    = v_program)
       AND (r.semester_id   IS NULL OR r.semester_id   = v_semester))
  INTO v_pinned, v_pinned_blocks;

  SELECT count(*)::int INTO v_acad_bill FROM billing_student_bills b
    WHERE b.student_id=v_lp AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded');
  SELECT count(*)::int INTO v_cur_bill FROM billing_student_bills b
    WHERE b.student_id=v_lp AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
      AND b.academic_year_id=v_ay;

  RETURN jsonb_build_object(
    'allocation_id', p_allocation_id, 'room_number', v_room_number, 'status', v_status,
    'learner', jsonb_build_object(
      'institution', v_inst_name,
      'degree', v_degree_name,
      'department', v_dept_name,
      'program', v_program_name,
      'semester', v_semester_name,
      'quota', v_quota_name,
      'academic_year', v_ay_name,
      'academic_fee', v_fee,
      'gender', v_gender
    ),
    'eligibility_rules', COALESCE(v_elig_rules, '[]'::jsonb),
    'category', jsonb_build_object(
      'allocated_room_category', v_room_cat_name,
      'resolved_room_category', v_resolved_room_name,
      'room_category_matched', (v_room_cat = ANY(COALESCE(v_room_cats,'{}'::uuid[]))),
      'resolved_mess_category', v_resolved_mess_name,
      'academic_year', v_ay_name,
      'academic_fee', v_fee,
      'gender', v_gender,
      'gender_ok', (v_room_cat_type IS NULL
                    OR (v_room_cat_type='boys'  AND v_gender IN ('male','m'))
                    OR (v_room_cat_type='girls' AND v_gender IN ('female','f')))
    ),
    'physical', jsonb_build_object(
      'institution_served', v_serves,
      'is_rule_covered', v_has_covering,
      'rule_matched', v_matched,
      'open_room', NOT v_has_covering,
      'pinned_elsewhere', (v_pinned AND NOT v_matched),
      'pinned_blocks', v_pinned_blocks,
      'access_ok', (v_matched OR (NOT v_has_covering AND NOT v_pinned)),
      'covering_rules', COALESCE(v_rules, '[]'::jsonb)
    ),
    'bill', jsonb_build_object('current_year_bills', v_cur_bill, 'academic_bills', v_acad_bill),
    'bills', COALESCE(v_bills, '[]'::jsonb)
  );
END $$;
