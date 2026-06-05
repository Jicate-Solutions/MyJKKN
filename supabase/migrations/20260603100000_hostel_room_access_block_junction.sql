-- ============================================================================
-- Hostel room access — single-rule consolidation (Gate 1 → block junction)
-- Date: 2026-06-03
-- ============================================================================
-- WHY:
--   There were two parallel institution-access systems for hostel rooms:
--     1. hostel_block_institutions (2026-04-21) — the intended multi-college
--        model: "which colleges does each physical block serve". Its own
--        migration planned for rooms/beds/allocations gating to move onto it.
--     2. room_institution_access (hostel-rooms-v2 PR1) — a per-room duplicate
--        that the allocation engine wired itself to instead.
--
--   Live-data audit (2026-06-03) confirmed room_institution_access carries ZERO
--   information beyond the block junction: every (block, institution) grant
--   already exists in hostel_block_institutions, per-room granularity is never
--   used, and it had drifted (only 145/224 student rooms granted, to 1 of 2
--   institutions). The per-room "Manage Access" UI conflicted conceptually with
--   the Program-Eligibility "Physical Rooms" cohort rules.
--
--   This migration finishes the original block-junction intent and retires the
--   per-room shadow. Institution access now derives from the room's block
--   (hostel_block_institutions); cohort reservations stay in
--   fn_learner_eligible_for_room (hostel_room_eligibility_rules) — untouched.
--
-- WHAT THIS PR CHANGES (Gate 1 only — Gate 2 eligibility calls preserved):
--   1. NEW fn_room_serves_institution(room_id, institution_id) — the single
--      institution gate (room → its block → hostel_block_institutions).
--   2. CREATE OR REPLACE the 6 live functions that read room_institution_access
--      so they gate on the block junction instead:
--        fn_auto_allocate_classic, fn_auto_allocate_preview,
--        fn_hostel_ensure_room_beds, fn_my_room_options,
--        fn_self_request_room, fn_user_can_access_room.
--
--   The room_institution_access TABLE is NOT dropped here — a later migration
--   drops it once the TS/API readers are also swapped (zero-downtime ordering).
--
-- BEHAVIOR NOTE: block-level gating makes the 79 previously-ungranted student
--   rooms and the 2nd institution's blocks allocatable (the per-room shadow had
--   under-granted). This is the intended/correct state.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. The single institution gate: room → its block → block-institution junction
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_room_serves_institution(
  p_room_id uuid,
  p_institution_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM hostel_rooms r
    JOIN hostel_block_institutions hbi ON hbi.block_id = r.block_id
    WHERE r.id = p_room_id
      AND hbi.institution_id = p_institution_id
  );
$function$;

COMMENT ON FUNCTION public.fn_room_serves_institution(uuid, uuid) IS
  'Single institution-access gate for hostel rooms: TRUE if the room''s block '
  'is linked to the institution via hostel_block_institutions. Replaces the '
  'retired room_institution_access per-room junction (2026-06-03). Cohort '
  'reservations remain in fn_learner_eligible_for_room.';

-- ──────────────────────────────────────────────────────────────────────
-- 2. fn_auto_allocate_classic — auto-allocation by block (2 RIA sites)
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

-- ──────────────────────────────────────────────────────────────────────
-- 3. fn_auto_allocate_preview — cohort/availability counts (1 RIA site)
-- ──────────────────────────────────────────────────────────────────────
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
         AND EXISTS (SELECT 1 FROM hostel_rooms r
                     JOIN hostel_block_institutions hbi ON hbi.block_id=r.block_id AND hbi.institution_id=lp.institution_id
                     WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student')),
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

-- ──────────────────────────────────────────────────────────────────────
-- 4. fn_hostel_ensure_room_beds — bed→institution attribution
--    Was: room's first active room_institution_access grant.
--    Now: the room's block's primary institution (fallback to earliest).
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hostel_ensure_room_beds(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_capacity    int;
  v_purpose     text;
  v_institution uuid;
BEGIN
  SELECT capacity, room_purpose INTO v_capacity, v_purpose
  FROM hostel_rooms WHERE id = p_room_id;

  IF v_capacity IS NULL OR v_capacity < 1 OR v_purpose <> 'student' THEN
    RETURN;  -- only student rooms with a real capacity get beds
  END IF;

  -- Attribute the bed to the room's block's institution (primary first).
  SELECT hbi.institution_id INTO v_institution
  FROM hostel_rooms r
  JOIN hostel_block_institutions hbi ON hbi.block_id = r.block_id
  WHERE r.id = p_room_id
  ORDER BY hbi.is_primary DESC, hbi.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_institution IS NULL THEN
    RETURN;  -- no institution to attribute the bed to; skip
  END IF;

  INSERT INTO hostel_beds (room_id, institution_id, bed_number, bed_type, status)
  SELECT p_room_id, v_institution, gs::text, 'single', 'available'
  FROM generate_series(1, v_capacity) gs
  WHERE NOT EXISTS (
    SELECT 1 FROM hostel_beds b
    WHERE b.room_id = p_room_id AND b.bed_number = gs::text
  );
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────
-- 5. fn_my_room_options — self-selection room picker (1 RIA site)
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_my_room_options(p_category_id uuid)
 RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid := get_my_learner_id(); v_inst uuid; v_gender text;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id=v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM hostel_beds b
  JOIN hostel_rooms r ON r.id=b.room_id
  JOIN hostel_blocks bl ON bl.id=r.block_id
  WHERE r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
    AND (bl.hostel_type::text='mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text='boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text='girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
    AND fn_learner_eligible_for_room(v_lp, r.id)
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $function$;

-- ──────────────────────────────────────────────────────────────────────
-- 6. fn_self_request_room — self-selection commit (1 RIA guard)
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_self_request_room(p_category_id uuid, p_room_id uuid, p_bed_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
  v_inst uuid; v_sem uuid; v_ay uuid; v_gender text;
  v_room_cat uuid; v_room_block uuid; v_block_type text;
  v_cat_mode text; v_cat_name text; v_tier uuid; v_alloc uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a registered hostelite can request a room';
  END IF;

  SELECT institution_id, semester_id, academic_year_id INTO v_inst, v_sem, v_ay
    FROM learners_profiles WHERE id=v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id=v_profile;

  SELECT allocation_mode, name INTO v_cat_mode, v_cat_name FROM hostel_categories WHERE id=p_category_id;
  IF v_cat_mode IS DISTINCT FROM 'manual' THEN RAISE EXCEPTION 'This category is not self-selectable'; END IF;

  SELECT category_id, block_id INTO v_room_cat, v_room_block FROM hostel_rooms WHERE id=p_room_id;
  IF v_room_cat IS DISTINCT FROM p_category_id THEN RAISE EXCEPTION 'Room is not in the selected category'; END IF;
  IF NOT fn_room_serves_institution(p_room_id, v_inst) THEN
    RAISE EXCEPTION 'Room is not available to your institution';
  END IF;

  SELECT hostel_type::text INTO v_block_type FROM hostel_blocks WHERE id=v_room_block;
  IF NOT (v_block_type='mixed'
          OR (v_gender IN ('male','m') AND v_block_type='boys')
          OR (v_gender IN ('female','f') AND v_block_type='girls')) THEN
    RAISE EXCEPTION 'This room''s block does not match your gender';
  END IF;

  IF NOT fn_learner_eligible_for_room(v_lp, p_room_id) THEN
    RAISE EXCEPTION 'You are not eligible for this room';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hostel_beds WHERE id=p_bed_id AND room_id=p_room_id AND status='available') THEN
    RAISE EXCEPTION 'That bed is not available';
  END IF;
  IF EXISTS (SELECT 1 FROM hostel_allocations WHERE bed_id=p_bed_id AND status IN ('active','pending_approval')) THEN
    RAISE EXCEPTION 'That bed has just been taken';
  END IF;
  IF EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id=v_profile AND status IN ('active','pending_approval')) THEN
    RAISE EXCEPTION 'You already have an allocation or a pending request';
  END IF;

  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy
    WHERE tier_key = CASE WHEN v_cat_name ILIKE '%plus%' THEN 'premium_plus' ELSE 'premium' END
      AND (institution_id=v_inst OR institution_id IS NULL) AND is_active
    ORDER BY institution_id NULLS LAST LIMIT 1;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No tier policy found'; END IF;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, warden_id
  ) VALUES (
    v_inst, v_profile, v_room_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'pending_approval', '', '', '',
    v_tier, v_profile,
    (SELECT user_id FROM user_block_access WHERE block_id=v_room_block AND revoked_at IS NULL LIMIT 1)
  ) RETURNING id INTO v_alloc;

  RETURN v_alloc;
END $function$;

-- ──────────────────────────────────────────────────────────────────────
-- 7. fn_user_can_access_room — RLS/visibility helper
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_can_access_room(check_room_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF check_room_id IS NULL THEN RETURN false; END IF;
  IF is_super_admin() THEN RETURN true; END IF;
  IF is_admin() THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.hostel_rooms r
    JOIN public.hostel_block_institutions hbi ON hbi.block_id = r.block_id
    WHERE r.id = check_room_id
      AND role_has_institution_access(hbi.institution_id)
  );
END;
$function$;

COMMIT;
