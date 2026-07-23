-- ============================================================================
-- Auto-allocation becomes rule-driven (Program Eligibility → Physical Rooms)
-- Date: 2026-06-03
-- ============================================================================
-- BEFORE: fn_auto_allocate_classic gated beds on fn_learner_eligible_for_room,
-- which is FAIL-OPEN — a room with no covering rule admits anyone. So a block
-- with no physical-room rules auto-filled every room indiscriminately.
--
-- AFTER (per Director 2026-06-03):
--   1. Block-level guard — auto-allocation REFUSES to run on a block that has
--      no active physical-room rule, with a "set rules first" message.
--   2. Strict (fail-CLOSED) allocation — only rooms covered by a matching rule
--      are filled; uncovered rooms in a ruled block are never auto-allocated.
--
-- Scope: AUTO-allocation only. The student self-selection flow
-- (fn_my_room_options / fn_self_request_room) keeps using the fail-OPEN
-- fn_learner_eligible_for_room — a hostelite may still pick any open room.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Is a room covered by >=1 active physical-room rule? (cohort-agnostic)
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_room_has_eligibility_rule(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM hostel_rooms rm
    JOIN hostel_room_eligibility_rules r
      ON r.is_active AND r.block_id = rm.block_id
    WHERE rm.id = p_room_id
      AND CASE
            WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id = r.id)
              THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                           WHERE rr.rule_id = r.id AND rr.room_id = p_room_id)
            ELSE (r.floor IS NULL OR r.floor = rm.floor)
          END
  );
$function$;

COMMENT ON FUNCTION public.fn_room_has_eligibility_rule(uuid) IS
  'TRUE if the room is covered by >=1 active hostel_room_eligibility_rules row '
  '(block + floor/explicit-room match; cohort-agnostic). Used by auto-allocation '
  'preview to count rule-covered beds.';

-- ──────────────────────────────────────────────────────────────────────
-- 2. Strict (fail-CLOSED) per-learner eligibility — auto-allocation only.
--    Mirror fn_learner_eligible_for_room but require a COVERING rule that the
--    learner matches (no fail-open fallback for uncovered rooms).
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_learner_strictly_eligible_for_room(
  p_learner_id uuid,
  p_room_id    uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

  RETURN v_has_covering AND v_matches;   -- fail-CLOSED: must be covered AND match
END;
$function$;

COMMENT ON FUNCTION public.fn_learner_strictly_eligible_for_room(uuid, uuid) IS
  'Fail-CLOSED eligibility for AUTO-allocation: TRUE only if the room is covered '
  'by an active rule the learner matches. Uncovered rooms are NOT eligible '
  '(unlike the fail-open fn_learner_eligible_for_room used by self-selection).';

-- ──────────────────────────────────────────────────────────────────────
-- 3. fn_auto_allocate_classic — block-rules guard + strict eligibility
-- ──────────────────────────────────────────────────────────────────────
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

  -- Block-level guard: auto-allocation is rule-driven. Refuse if the block has
  -- no active physical-room rule (Program Eligibility -> Physical Rooms).
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
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.hostel_category_id = p_category_id
      AND (v_req_gender IS NULL
           OR (v_req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
           OR (v_req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND EXISTS (SELECT 1 FROM hostel_rooms r
                  JOIN hostel_block_institutions hbi ON hbi.block_id=r.block_id AND hbi.institution_id=lp.institution_id
                  WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student')
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
        notes = format('%s allocated into this block, %s skipped (no rule-covered bed / academic year). Excluded: no login profile or gender mismatch.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- ──────────────────────────────────────────────────────────────────────
-- 4. fn_auto_allocate_preview — add rules_set + count only rule-covered beds
--    and rule-matching learners (honest preview of the strict generate).
--    DROP+CREATE because the RETURNS TABLE signature gains a column.
-- ──────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_auto_allocate_preview(uuid, uuid);

CREATE FUNCTION public.fn_auto_allocate_preview(p_block_id uuid, p_category_id uuid)
 RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cat AS (
    SELECT CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END AS req_gender
    FROM hostel_categories WHERE id=p_category_id
  )
  SELECT
    -- cohort_eligible: learners who match an active rule covering >=1 student
    -- room of this category in the block (mirrors strict generate).
    (SELECT count(*)::int FROM learners_profiles lp JOIN profiles p ON p.learner_id=lp.id, cat
       WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel') AND lp.hostel_category_id=p_category_id
         AND (cat.req_gender IS NULL
              OR (cat.req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
              OR (cat.req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
         AND EXISTS (
           SELECT 1 FROM hostel_room_eligibility_rules r
           WHERE r.is_active AND r.block_id = p_block_id
             AND r.institution_id = lp.institution_id
             AND (r.degree_id     IS NULL OR r.degree_id     = lp.degree_id)
             AND (r.department_id IS NULL OR r.department_id = lp.department_id)
             AND (r.program_id    IS NULL OR r.program_id    = lp.program_id)
             AND (r.semester_id   IS NULL OR r.semester_id   = lp.semester_id)
             AND EXISTS (
               SELECT 1 FROM hostel_rooms rm
               WHERE rm.block_id = p_block_id AND rm.category_id = p_category_id AND rm.room_purpose='student'
                 AND CASE
                       WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
                         THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=rm.id)
                       ELSE (r.floor IS NULL OR r.floor = rm.floor)
                     END
             )
         )),
    (SELECT count(*)::int FROM learners_profiles lp
       WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel') AND lp.hostel_category_id=p_category_id
         AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=lp.id)),
    (SELECT count(*)::int FROM learners_profiles lp JOIN profiles p ON p.learner_id=lp.id
       WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel') AND lp.hostel_category_id=p_category_id
         AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    -- available_beds: only beds in rule-covered rooms (matches strict generate).
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
         AND fn_room_has_eligibility_rule(r.id)
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    -- rules_set: does the block have any active physical-room rule at all?
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id=p_block_id AND is_active);
$function$;

COMMIT;
