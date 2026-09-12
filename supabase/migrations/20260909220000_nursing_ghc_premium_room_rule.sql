-- ===========================================================================
-- Nursing may use the Girls Hostel C Premium rooms
-- ===========================================================================
--
-- A Nursing learner upgrading Classic -> Premium was offered exactly ONE room
-- (Girls Hostel A room 3), while six Premium rooms in Girls Hostel C sat with
-- free beds. Those six pass every other test -- gender, availability, and
-- fn_room_serves_institution all say yes -- and were excluded solely by
-- fn_learner_eligible_for_room.
--
-- WHY. Girls Hostel C carries two active rules with NO floor and NO pinned
-- rooms ("Pharm D" -> Pharmacy, and an unnamed one -> Dental). In
-- fn_learner_eligible_for_room a rule with no pinned rooms is matched on
-- `floor IS NULL OR floor = v_floor`, so a NULL floor covers EVERY room in the
-- block. That makes the whole block "covered", and a covered room admits only
-- learners some covering rule matches. The existing Nursing rule pins rooms 25
-- and 28 only -- both Deluxe -- so no Premium room in GHC was reachable.
--
-- This adds a Nursing rule pinning the six Premium rooms, mirroring the shape
-- of "Nursing — Girls Hostel C rooms 25 & 28": institution-wide (no degree,
-- department, program or semester narrowing). Rules are ADDITIVE, so this
-- grants Nursing access without removing anything from Dental or Pharmacy --
-- the same sharing that rooms 25/28 already have between Nursing and B.Pharm.
--
-- Deliberately pins these SIX rooms, not every Premium room in the block:
--   * room 41 is reserved for Allied Health by its own rule, and
--   * a blanket grant would hand Nursing all 28 GHC Premium rooms, which is a
--     bigger policy change than was asked for.
-- If more GHC Premium rooms should open to Nursing later, add them to this
-- rule's pinned set rather than widening the rule itself.
--
-- semester_ids is set to '{}' and NOT left NULL. fn_learner_eligible_for_room
-- tests `cardinality(c.semester_ids) = 0`, and cardinality(NULL) is NULL, not
-- 0 -- a NULL here would make the whole predicate NULL and the rule would
-- silently match nobody. Every existing rule in this block stores '{}'.
-- ===========================================================================

INSERT INTO public.hostel_room_eligibility_rules (
  institution_id, block_id, floor, degree_id, department_id, program_id,
  semester_ids, rule_name, is_active
)
SELECT i.id, b.id, NULL, NULL, NULL, NULL,
       '{}'::uuid[], 'Nursing — Girls Hostel C Premium rooms (2026-09-09)', true
FROM public.institutions i
CROSS JOIN public.hostel_blocks b
WHERE i.name = 'JKKN College of Nursing and Research'
  AND b.name = 'Girls Hostel C'
  AND NOT EXISTS (
    SELECT 1 FROM public.hostel_room_eligibility_rules x
    WHERE x.rule_name = 'Nursing — Girls Hostel C Premium rooms (2026-09-09)'
  );

-- Pin the six Premium rooms that had free beds. Scoped by block + category +
-- room_number because room_number is only unique within a block.
INSERT INTO public.hostel_room_eligibility_rule_rooms (rule_id, room_id)
SELECT ru.id, r.id
FROM public.hostel_room_eligibility_rules ru
JOIN public.hostel_rooms r        ON r.block_id = ru.block_id
JOIN public.hostel_categories c   ON c.id = r.category_id
WHERE ru.rule_name = 'Nursing — Girls Hostel C Premium rooms (2026-09-09)'
  AND c.name = 'Premium Room'
  AND c.type = 'girls'
  AND r.room_purpose = 'student'
  AND r.room_number IN ('5', '6', '7', '16', '45', '53')
  AND NOT EXISTS (
    SELECT 1 FROM public.hostel_room_eligibility_rule_rooms x
    WHERE x.rule_id = ru.id AND x.room_id = r.id
  );
