-- 20260610190000_alloc_sync_room_category.sql
-- BUG: auto-allocation wrote learners_profiles.mess_category_id but NEVER
-- hostel_category_id. So after allocating a student to a Deluxe room, their My Hostel
-- "Your Hostel Details" (which reads learners_profiles.hostel_category_id) still showed
-- the admission-time Classic Room — and hostel-fee billing (also keyed on that column)
-- would under-bill. Root cause: the write-back was mess-only.
--
-- FIX: at allocation time, sync BOTH categories on the profile — hostel_category_id from
-- the allocated ROOM's category (the truth — the room may be the 2nd-choice resolved
-- category if the 1st was full), mess_category_id from the rules-derived mess (unchanged).
-- Mirrors the existing idempotent mess behaviour (a rejected/reset batch does not revert).
-- Plus a one-time backfill for already active/pending allocations made before this fix.
-- Rebuilt fn_auto_allocate_classic from the live def (20260610130000 cohort pinning).
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
      AND room_elig.cats IS NOT NULL
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

    -- Sync the learner's profile categories to the proposal (rules-derived, idempotent;
    -- a rejected/reset batch does NOT revert): hostel_category_id from the ALLOCATED room's
    -- category (the truth), mess_category_id from the rules-derived mess (kept if none).
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
        notes = format('%s allocated (rules-driven category + mess; physical rooms: reserved rooms go to their matching cohort, cohorts with a reservation in ANY block are placed only in their reserved rooms, rule-free rooms are open to served-institution learners without a reservation; filled primary-institution first, then A-Z). %s skipped (no free bed they can occupy / reserved rooms in another block / gender / no academic year). Strict: learners with no rule-resolved room category (e.g. no current-year bill) are excluded from the cohort.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- One-time backfill: align every CURRENTLY active/pending allocation's profile
-- hostel_category_id with the allocated room's category (these were created before the
-- write-back existed). Bridge: hostel_allocations.learner_id = profiles.id;
-- profiles.learner_id = learners_profiles.id.
UPDATE learners_profiles lp
SET hostel_category_id = r.category_id, updated_at = now()
FROM profiles p
JOIN hostel_allocations a ON a.learner_id = p.id AND a.status IN ('active','pending_approval')
JOIN hostel_rooms r ON r.id = a.room_id
WHERE lp.id = p.learner_id
  AND r.category_id IS NOT NULL
  AND lp.hostel_category_id IS DISTINCT FROM r.category_id;
