-- Fee-band fill: place the remaining unallocated girls, relaxing physical room rules
-- (2026-08-12, operator-directed follow-up to 20260812060000)
--
-- WHAT THIS DOES
-- --------------
-- After the upgrade restoration, 42 girls still need a bed and every one of them is
-- entitled to Classic Room only. 34 free Classic beds exist, ALL in Girls Hostel A --
-- but 33 of those 34 sit in rooms some cohort's physical rule reserves, so the allocator
-- could only reach 17. Exactly ONE free Classic bed (room 54) is genuinely unreserved,
-- which is why the engine's existing overflow tier (unreserved-rooms-only) cannot help:
-- all three girls blocks carry block-wide rules, so nearly every room counts as "covered".
--
-- Operator decision: the CATEGORY (fee band) rule stays absolute; the PHYSICAL ROOM rule
-- is relaxed so the free beds can actually be used.
--
-- WHAT IS STILL ENFORCED (unchanged, non-negotiable)
--   * Category == the learner's fee-band entitlement, from fn_hostel_learner_room_categories.
--     No learner is ever placed above or below her band. This is the whole point.
--   * Institution -> block access via fn_room_serves_institution (Girls Hostel A serves all
--     six colleges, so this costs nothing here, but it is the tenancy gate and stays).
--   * Girls blocks only, room_purpose = 'student'.
--   * Bed genuinely free: no allocation row with check_out_date IS NULL
--     (that -- not status -- is the predicate the uniqueness index uses).
--
-- WHAT IS RELAXED
--   * fn_learner_strictly_eligible_for_room is tried FIRST (tier 1) and only skipped when
--     it yields nothing (tier 2). So learners still land in "their" rooms where such a room
--     is free; the bypass applies only where the alternative is leaving a girl with no bed.
--     Every tier-2 placement is stamped in override_reason and flagged in the backup table.
--
-- PRIORITY ORDER
--   fn_auto_allocate_plan's own plan_seq -- i.e. the engine's existing fairness order
--   (semester fill_rank, then primary-block, then institution and name). Reusing it means
--   this fill cannot disagree with the allocator about who has first claim.
--
-- HONEST LIMIT
--   42 learners, 34 beds. 8 girls WILL remain unplaced. That is a bed shortage, not a
--   configuration problem, and no rule change can close it. They are listed in
--   bak_hostel_feeband_fill_20260812 with outcome 'NO FREE BED IN FEE-BAND CATEGORY'.

-- ---------------------------------------------------------------------------
-- PHASE 0 -- candidates, in the engine's own priority order
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _fb_cand ON COMMIT DROP AS
SELECT p.plan_seq,
       p.plan_lp_id            AS lp_id,
       p.plan_profile_id       AS profile_id,
       p.plan_institution_id   AS institution_id,
       p.plan_semester_id      AS semester_id,
       p.plan_academic_year_id AS academic_year_id,
       (SELECT array_agg(c.category_id) FROM fn_hostel_learner_room_categories(p.plan_lp_id) c) AS room_cats
FROM fn_auto_allocate_plan('girls', false, NULL, NULL, NULL, true) p;

DO $$
DECLARE v_nocat int;
BEGIN
  SELECT count(*) INTO v_nocat FROM _fb_cand WHERE room_cats IS NULL;
  IF v_nocat > 0 THEN
    RAISE EXCEPTION 'ABORT: % candidate(s) resolve to no fee-band category; refusing to guess', v_nocat;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bak_hostel_feeband_fill_20260812 (
  lp_id            uuid,
  roll_number      text,
  institution_name text,
  entitled_category text,
  plan_seq         int,
  new_alloc_id     uuid,
  new_block_name   text,
  new_room_number  text,
  new_bed_number   text,
  placement_tier   text,   -- 'rule-eligible' or 'rule-bypassed'
  outcome          text,
  captured_at      timestamptz DEFAULT now()
);

INSERT INTO bak_hostel_feeband_fill_20260812
  (lp_id, roll_number, institution_name, entitled_category, plan_seq, outcome)
SELECT c.lp_id, lp.roll_number, i.name,
       (SELECT string_agg(hc.name, ' + ' ORDER BY hc.sort_order)
          FROM unnest(c.room_cats) u(cid) JOIN hostel_categories hc ON hc.id = u.cid),
       c.plan_seq, 'pending'
FROM _fb_cand c
JOIN learners_profiles lp ON lp.id = c.lp_id
JOIN institutions i       ON i.id  = c.institution_id;

-- ---------------------------------------------------------------------------
-- PHASE 1 -- place, tier 1 (rule-eligible) then tier 2 (rule-bypassed)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  cand   record;
  v_tier uuid;
  v_bed uuid; v_room uuid; v_block uuid;
  v_bname text; v_rnum text; v_bnum text;
  v_alloc uuid; v_ptier text;
  v_t1 int := 0; v_t2 int := 0; v_none int := 0;
BEGIN
  SELECT id INTO v_tier FROM hostel_tier_policy
   WHERE tier_key = 'standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN
    SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key = 'standard' AND is_active LIMIT 1;
  END IF;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'ABORT: no active standard hostel_tier_policy row (tier_id is NOT NULL)';
  END IF;

  CREATE TEMP TABLE _fb_taken (bed_id uuid PRIMARY KEY) ON COMMIT DROP;

  FOR cand IN SELECT * FROM _fb_cand ORDER BY plan_seq LOOP
    v_bed := NULL; v_room := NULL; v_block := NULL; v_ptier := NULL;

    -- Tier 1: a room this learner's own rules already permit.
    SELECT b.id, r.id, r.block_id, hb.name, r.room_number, b.bed_number
      INTO v_bed, v_room, v_block, v_bname, v_rnum, v_bnum
    FROM hostel_rooms r
    JOIN hostel_blocks hb ON hb.id = r.block_id
    JOIN hostel_beds b    ON b.room_id = r.id AND b.status = 'available'
    WHERE hb.hostel_type::text = 'girls'
      AND r.room_purpose = 'student'
      AND r.category_id = ANY(cand.room_cats)
      AND fn_room_serves_institution(r.id, cand.institution_id)
      AND fn_learner_strictly_eligible_for_room(cand.lp_id, r.id, false)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                       WHERE a.bed_id = b.id AND a.check_out_date IS NULL)
      AND NOT EXISTS (SELECT 1 FROM _fb_taken t WHERE t.bed_id = b.id)
    ORDER BY array_position(cand.room_cats, r.category_id),
             hb.name, r.floor, r.room_number, b.bed_number
    LIMIT 1;

    IF v_bed IS NOT NULL THEN
      v_ptier := 'rule-eligible';
    ELSE
      -- Tier 2: any free bed of the SAME fee-band category. Room rules relaxed; category not.
      SELECT b.id, r.id, r.block_id, hb.name, r.room_number, b.bed_number
        INTO v_bed, v_room, v_block, v_bname, v_rnum, v_bnum
      FROM hostel_rooms r
      JOIN hostel_blocks hb ON hb.id = r.block_id
      JOIN hostel_beds b    ON b.room_id = r.id AND b.status = 'available'
      WHERE hb.hostel_type::text = 'girls'
        AND r.room_purpose = 'student'
        AND r.category_id = ANY(cand.room_cats)
        AND fn_room_serves_institution(r.id, cand.institution_id)
        AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                         WHERE a.bed_id = b.id AND a.check_out_date IS NULL)
        AND NOT EXISTS (SELECT 1 FROM _fb_taken t WHERE t.bed_id = b.id)
      ORDER BY array_position(cand.room_cats, r.category_id),
               hb.name, r.floor, r.room_number, b.bed_number
      LIMIT 1;
      IF v_bed IS NOT NULL THEN v_ptier := 'rule-bypassed'; END IF;
    END IF;

    IF v_bed IS NULL THEN
      v_none := v_none + 1;
      UPDATE bak_hostel_feeband_fill_20260812
         SET outcome = 'NO FREE BED IN FEE-BAND CATEGORY'
       WHERE lp_id = cand.lp_id;
      CONTINUE;
    END IF;

    INSERT INTO _fb_taken(bed_id) VALUES (v_bed);

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id,
      academic_year_id, semester_id, allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, override_reason
    ) VALUES (
      cand.institution_id, cand.profile_id, v_block, v_room, v_bed,
      cand.academic_year_id, cand.semester_id,
      'fresh', CURRENT_DATE, 'active', '', '', '',
      v_tier,
      CASE WHEN v_ptier = 'rule-bypassed'
           THEN 'Fee-band fill 2026-08-12: placed outside physical room rules; fee-band category enforced'
           ELSE 'Fee-band fill 2026-08-12' END
    ) RETURNING id INTO v_alloc;

    UPDATE hostel_beds
       SET status = 'occupied', current_occupant_id = cand.profile_id, updated_at = now()
     WHERE id = v_bed;

    UPDATE bak_hostel_feeband_fill_20260812
       SET new_alloc_id = v_alloc, new_block_name = v_bname, new_room_number = v_rnum,
           new_bed_number = v_bnum, placement_tier = v_ptier, outcome = 'placed'
     WHERE lp_id = cand.lp_id;

    IF v_ptier = 'rule-eligible' THEN v_t1 := v_t1 + 1; ELSE v_t2 := v_t2 + 1; END IF;
  END LOOP;

  RAISE NOTICE 'fee-band fill: % rule-eligible, % rule-bypassed, % with no bed', v_t1, v_t2, v_none;
END $$;

-- ---------------------------------------------------------------------------
-- PHASE 2 -- invariants
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_dup int; v_wrongcat int;
BEGIN
  SELECT count(*) INTO v_dup FROM (
    SELECT bed_id FROM hostel_allocations
    WHERE check_out_date IS NULL AND bed_id IS NOT NULL
    GROUP BY bed_id HAVING count(*) > 1) d;
  IF v_dup > 0 THEN RAISE EXCEPTION 'ABORT: % bed(s) double-booked', v_dup; END IF;

  -- The one rule that must never bend: nobody placed outside their fee-band category.
  SELECT count(*) INTO v_wrongcat
  FROM bak_hostel_feeband_fill_20260812 k
  JOIN hostel_allocations a ON a.id = k.new_alloc_id
  JOIN hostel_rooms r       ON r.id = a.room_id
  WHERE NOT EXISTS (SELECT 1 FROM fn_hostel_learner_room_categories(k.lp_id) c
                     WHERE c.category_id = r.category_id);
  IF v_wrongcat > 0 THEN
    RAISE EXCEPTION 'ABORT: % learner(s) placed outside their fee-band category', v_wrongcat;
  END IF;
END $$;
