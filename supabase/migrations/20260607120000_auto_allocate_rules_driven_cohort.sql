-- ============================================================================
-- Auto-allocation honors the fee-aware Category Eligibility rules
-- Date: 2026-06-07
-- ============================================================================
-- BEFORE: fn_auto_allocate_classic / _preview selected the cohort purely by the
-- learner's STORED preference (learners_profiles.hostel_category_id = target),
-- and never consulted the fee-aware resolver (fn_hostel_learner_room_categories).
-- So the Category Eligibility rules (program -> quota -> academic-fee band ->
-- room category) had ZERO effect on auto-allocation.
--
-- AFTER (stakeholder choice "rules-driven, fail-open to stored"): the cohort is
-- selected by the resolver. For a chosen TARGET category, a learner is included
-- when the resolver says they are eligible for it; when the resolver returns an
-- empty set (no matching rule OR no academic_year-tagged bill -> fail open) the
-- engine falls back to the learner's stored hostel_category_id. So behavior is
-- UNCHANGED until rules + AY-tagged bills exist, then the rules take over.
--
--   cohort rule  =  COALESCE(target = ANY(resolved_room_cats),     -- rules win
--                            stored_category = target)             -- else fail-open
--
-- array_agg() over zero resolver rows is NULL, so COALESCE(NULL, fallback)
-- cleanly degrades to the stored-preference check. The bed search, gender match,
-- physical-room (fail-CLOSED) eligibility, batch/approval flow are UNCHANGED.
--
-- Perf: the per-learner resolver is bounded by pre-filtering learners to the
-- institutions this block serves (a learner the block does not serve can never
-- get a bed here anyway), so the resolver runs only for the relevant cohort.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. fn_auto_allocate_classic — rules-driven cohort (fail-open to stored)
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
    -- Fee-aware resolved room-category set for this learner (program -> quota ->
    -- fee band). array_agg over zero rows = NULL = "no rule / no fee data".
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_room_categories(lp.id)
    ) elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      -- Only learners whose institution this block serves (also bounds the
      -- per-learner resolver call above to the relevant cohort).
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id = p_block_id)
      -- Rules-driven cohort, FAIL-OPEN to stored preference: when the resolver
      -- returns a non-empty set the learner must be eligible for the target
      -- category; when it is empty (no rule / untagged bill) fall back to the
      -- learner's saved hostel_category_id (preserves pre-fee-aware behavior).
      AND COALESCE(p_category_id = ANY(elig.cats), lp.hostel_category_id = p_category_id)
      AND (v_req_gender IS NULL
           OR (v_req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
           OR (v_req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND EXISTS (SELECT 1 FROM hostel_rooms r
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
        notes = format('%s allocated into this block, %s skipped (no rule-covered bed / academic year). Cohort = fee-aware eligibility for the category (fail-open to saved category). Excluded: no login profile or gender mismatch.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. fn_auto_allocate_preview — mirror the rules-driven cohort so the
--    preview counts honestly reflect what generate will place.
--    Same RETURNS TABLE signature -> CREATE OR REPLACE is fine.
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(p_block_id uuid, p_category_id uuid)
 RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cat AS (
    SELECT CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END AS req_gender
    FROM hostel_categories WHERE id=p_category_id
  ),
  -- Learners targeted at p_category_id: rules-driven (fee-aware resolver),
  -- FAIL-OPEN to the stored hostel_category_id. Restricted to the block's
  -- institutions (mirrors the generate cohort + bounds the per-learner resolver).
  targeted AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id
    FROM learners_profiles lp
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)
    ) elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
      AND COALESCE(p_category_id = ANY(elig.cats), lp.hostel_category_id = p_category_id)
  )
  SELECT
    -- cohort_eligible: targeted + has profile + gender + not allocated + an active
    -- physical-room rule covering a student room of this category matches them.
    (SELECT count(*)::int
       FROM targeted t JOIN profiles p ON p.learner_id=t.id, cat
       WHERE (cat.req_gender IS NULL
              OR (cat.req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
              OR (cat.req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
         AND EXISTS (
           SELECT 1 FROM hostel_room_eligibility_rules r
           WHERE r.is_active AND r.block_id = p_block_id
             AND r.institution_id = t.institution_id
             AND (r.degree_id     IS NULL OR r.degree_id     = t.degree_id)
             AND (r.department_id IS NULL OR r.department_id = t.department_id)
             AND (r.program_id    IS NULL OR r.program_id    = t.program_id)
             AND (r.semester_id   IS NULL OR r.semester_id   = t.semester_id)
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
    -- no_profile: targeted learners with no login profile (auto skips them).
    (SELECT count(*)::int FROM targeted t WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=t.id)),
    -- already_allocated: targeted learners already in an active/pending allocation.
    (SELECT count(*)::int FROM targeted t JOIN profiles p ON p.learner_id=t.id
       WHERE EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    -- available_beds: beds in rule-covered student rooms of this category (unchanged).
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
         AND fn_room_has_eligibility_rule(r.id)
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    -- rules_set: does the block have any active physical-room rule at all? (unchanged)
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id=p_block_id AND is_active);
$function$;

COMMIT;
