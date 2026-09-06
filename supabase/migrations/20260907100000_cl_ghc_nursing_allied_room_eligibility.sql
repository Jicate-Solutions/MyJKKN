-- Girls Hostel C — admit Nursing to rooms 25 & 28 and Allied Health to room 41.
--
-- WHY. After 20260906120000 placed the sheet's residents, six of them failed
-- fn_learner_eligible_for_room and the Allocation Audit turned them
-- 'band_and_rule_violation':
--
--   PUSHPALATHA S                                Nursing  GHC R25
--   JENISHA M, JERSHINI J, TAKSHANA S, SUJIVARSHA R  Nursing  GHC R28
--   LEGAVARSHITHA T                          Allied Health  GHC R41
--
-- They are not misplaced — the sheet records where these learners physically
-- sleep. The rules were simply never told. GHC R25/28/29 are claimed by
-- "B.Pharm — Girls Hostel C overflow (2026-08-11)" for Pharmacy/BPHARM only,
-- and there is no GHC rule admitting Nursing or Allied Health at all.
--
-- HOW fn_learner_eligible_for_room READS THIS. It gathers every active rule on
-- the block that COVERS the room — a rule with a room list covers the rooms in
-- it, a rule without one covers the whole block (subject to `floor`) — and then
-- returns true only if one of those covering rules also matches the learner's
-- institution/degree/department/program/semester. If NO rule covers the room at
-- all, it returns true (open room).
--
-- So the safe shape here is a ROOM-SCOPED rule per institution. Both target
-- rooms are already covered by other rules (R25/R28 by the B.Pharm overflow,
-- R41 by the block-wide Dental rule), so adding these takes access away from
-- nobody: a covering set that already existed simply gains one more member, and
-- matching is an OR across the set. Deliberately NOT block-wide — that would
-- open all 53 GHC rooms to two more institutions, which nobody asked for.
--
-- degree_id / department_id / program_id stay NULL and semester_ids stays empty
-- so the rule reads "any learner of this institution", which is what the
-- occupancy sheet actually asserts. Narrow it later if the hostel office wants
-- to pin specific programmes.

DO $mig$
DECLARE
  v_block    uuid := 'a4022e63-62b2-4777-a36f-7527de0795aa';  -- Girls Hostel C
  v_nursing  uuid := '70e54e51-9b98-4e07-9534-a85310609bfd';  -- JKKN College of Nursing and Research
  v_allied   uuid := '9c1554e8-12a2-4b76-a9d6-8242bb05eba1';  -- JKKN College of Allied Health Sciences
  v_rule     uuid;
  v_room     uuid;
  v_bad      integer;
  v_names    text;
BEGIN
  --------------------------------------------------------- Nursing → R25, R28
  SELECT id INTO v_rule FROM hostel_room_eligibility_rules
   WHERE block_id = v_block AND institution_id = v_nursing
     AND rule_name = 'Nursing — Girls Hostel C rooms 25 & 28 (2026-09-07)';
  IF v_rule IS NULL THEN
    INSERT INTO hostel_room_eligibility_rules
      (institution_id, block_id, floor, degree_id, department_id, program_id, rule_name, is_active, semester_ids)
    VALUES
      (v_nursing, v_block, NULL, NULL, NULL, NULL,
       'Nursing — Girls Hostel C rooms 25 & 28 (2026-09-07)', true, '{}')
    RETURNING id INTO v_rule;
  END IF;

  FOR v_room IN
    SELECT r.id FROM hostel_rooms r
     WHERE r.block_id = v_block AND r.room_number IN ('25', '28')
  LOOP
    INSERT INTO hostel_room_eligibility_rule_rooms (rule_id, room_id)
    VALUES (v_rule, v_room)
    ON CONFLICT DO NOTHING;
  END LOOP;

  ------------------------------------------------------------ Allied → R41
  SELECT id INTO v_rule FROM hostel_room_eligibility_rules
   WHERE block_id = v_block AND institution_id = v_allied
     AND rule_name = 'Allied Health — Girls Hostel C room 41 (2026-09-07)';
  IF v_rule IS NULL THEN
    INSERT INTO hostel_room_eligibility_rules
      (institution_id, block_id, floor, degree_id, department_id, program_id, rule_name, is_active, semester_ids)
    VALUES
      (v_allied, v_block, NULL, NULL, NULL, NULL,
       'Allied Health — Girls Hostel C room 41 (2026-09-07)', true, '{}')
    RETURNING id INTO v_rule;
  END IF;

  SELECT r.id INTO v_room FROM hostel_rooms r
   WHERE r.block_id = v_block AND r.room_number = '41';
  INSERT INTO hostel_room_eligibility_rule_rooms (rule_id, room_id)
  VALUES (v_rule, v_room)
  ON CONFLICT DO NOTHING;

  ----------------------------------------------------------------- assertions
  -- (a) the six learners this was written for now pass.
  SELECT count(*), string_agg(p.full_name, ', ')
    INTO v_bad, v_names
    FROM hostel_allocations h
    JOIN hostel_blocks b  ON b.id = h.block_id AND b.code = 'GHC'
    JOIN profiles p       ON p.id = h.learner_id
    JOIN learners_profiles lp ON lp.id = p.learner_id
   WHERE h.status = 'active' AND h.check_out_date IS NULL
     AND lp.institution_id IN (v_nursing, v_allied)
     AND fn_learner_eligible_for_room(lp.id, h.room_id) = false;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Still failing the room rule after adding it: %', v_names;
  END IF;

  -- (b) nobody ELSE lost access. Adding a covering rule to a room that already
  -- had one cannot narrow the set, but assert it rather than trust the argument.
  SELECT count(*), string_agg(p.full_name || ' (' || rm.room_number || ')', ', ')
    INTO v_bad, v_names
    FROM hostel_allocations h
    JOIN hostel_blocks b  ON b.id = h.block_id AND b.code = 'GHC'
    JOIN hostel_rooms rm  ON rm.id = h.room_id
    JOIN profiles p       ON p.id = h.learner_id
    JOIN learners_profiles lp ON lp.id = p.learner_id
   WHERE h.status = 'active' AND h.check_out_date IS NULL
     AND fn_learner_eligible_for_room(lp.id, h.room_id) = false;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% GHC residents fail the room rule after this change: %', v_bad, v_names;
  END IF;

  RAISE NOTICE 'GHC eligibility widened: Nursing -> rooms 25,28; Allied Health -> room 41';
END
$mig$;
