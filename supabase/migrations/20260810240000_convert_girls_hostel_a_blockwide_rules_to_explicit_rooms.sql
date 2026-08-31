-- ============================================================================
-- Campus Living — convert the three BLOCK-WIDE rules on Girls Hostel A into
-- explicit room lists, releasing rooms 54 and 3 (2026-08-10)
-- ============================================================================
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- A hostel_room_eligibility_rule with floor = NULL and NO attached rooms COVERS
-- EVERY ROOM IN ITS BLOCK (see the CASE in fn_learner_strictly_eligible_for_room:
-- the floor branch is only reached when the rule has no explicit rooms, and
-- `floor IS NULL` then matches everything). Girls Hostel A carries three such
-- rules, so every room in the block is "covered" and the 2026-08-10 overflow
-- tier — which may only use rooms NO rule covers — is completely inert there.
--
-- Of the block's 44 student rooms, 40 already carry an explicit rule. Only four
-- depend on block-wide coverage alone:
--     room  3  Premium  4 beds,  1 free   occupied by Dental (3)
--     room 12  Classic  4 beds,  0 free   Arts&Sci + Pharmacy + Dental (4)
--     room 13  Classic  4 beds,  0 free   Pharmacy + Dental (4)
--     room 54  Classic 15 beds,  9 FREE   Dental (6)
-- Rooms 12 and 13 are full; room 54 is the actual prize.
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────────
-- Each block-wide rule gains an explicit list of the rooms its cohort OCCUPIES
-- TODAY, so nobody loses access to a room they are living in — with two
-- deliberate exclusions from the Dental list, chosen by the operator:
--     room 54  -> released; becomes reserved by NO rule, so the overflow tier
--                 can reach its 9 free Classic beds for any girls cohort
--     room  3  -> released likewise (1 free Premium bed; no current demand)
--
-- Resulting lists (derived from live occupancy below, NOT hardcoded, so the
-- migration cannot drift from the data if it is applied later):
--     7dd8dc70  Arts & Science (all)  ->  12
--     a1fb768d  Pharmacy PHARMD       ->  2, 4, 5, 12, 13
--     fc16d854  Dental (all)          ->  their 29 occupied rooms MINUS 3, 54
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
-- * No allocation is touched. Rules gate FUTURE placement only — the 6 Dental
--   residents in room 54 and the 3 in room 3 keep their beds. The only cost is
--   forward-looking: Dental can no longer place NEW girls into those rooms.
--   Dental has 0 unallocated girls today (all 54 blocked are Nursing 39 /
--   Pharmacy 13 / Allied Health 2, every one Classic-band).
-- * Girls Hostel B and C are deliberately untouched. Both are entirely
--   block-wide-governed and converting them would release 144 beds that NOT ONE
--   blocked learner can use — every blocked girl resolves to Classic, and
--   neither block contains a Classic room. It would cost Dental and PharmD
--   their block headroom for zero benefit.
--
-- ── CEILING, STATED HONESTLY ────────────────────────────────────────────────
-- This releases 9 Classic beds against 54 blocked learners. The other 8 free
-- Classic beds in the block sit in rooms explicitly reserved for BDS (7),
-- B.Pharm Sem VII/VIII (35) and Engineering (53); reaching those means ADDING a
-- blocked cohort to one of those rules — a reallocation, not a repair. The
-- remaining ~45 are a genuine capacity shortfall (Hostel A is 91% occupied).

BEGIN;

-- ── Rollback snapshots ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.bak_gha_blockwide_rules_20260810;
DROP TABLE IF EXISTS public.bak_gha_blockwide_rule_rooms_20260810;

CREATE TABLE public.bak_gha_blockwide_rules_20260810 AS
SELECT re.*, now() AS captured_at
  FROM public.hostel_room_eligibility_rules re
 WHERE re.id IN ('7dd8dc70-8fed-4948-bc26-26f78f178604',
                 'a1fb768d-2e18-4e1b-bfe8-e1367e6d8f0a',
                 'fc16d854-fff5-44f9-8330-20a0af7dd500');

-- Empty today (that is the whole point), but snapshotted so the rollback is a
-- straight restore rather than a delete-everything.
CREATE TABLE public.bak_gha_blockwide_rule_rooms_20260810 AS
SELECT rr.*, now() AS captured_at
  FROM public.hostel_room_eligibility_rule_rooms rr
 WHERE rr.rule_id IN ('7dd8dc70-8fed-4948-bc26-26f78f178604',
                      'a1fb768d-2e18-4e1b-bfe8-e1367e6d8f0a',
                      'fc16d854-fff5-44f9-8330-20a0af7dd500');

DO $$
DECLARE
  v_block      uuid;
  v_room_54    uuid;
  v_room_3     uuid;
  v_n          int;
  v_rules      int;
BEGIN
  SELECT id INTO v_block FROM public.hostel_blocks WHERE name = 'Girls Hostel A';
  IF v_block IS NULL THEN
    RAISE EXCEPTION 'Girls Hostel A not found. Aborting.';
  END IF;

  SELECT id INTO v_room_54 FROM public.hostel_rooms
   WHERE block_id = v_block AND room_number = '54' AND room_purpose = 'student';
  SELECT id INTO v_room_3  FROM public.hostel_rooms
   WHERE block_id = v_block AND room_number = '3'  AND room_purpose = 'student';
  IF v_room_54 IS NULL OR v_room_3 IS NULL THEN
    RAISE EXCEPTION 'Room 54 or room 3 not found in Girls Hostel A. Aborting.';
  END IF;

  -- All three rules must still be block-wide, or someone has edited them since
  -- this migration was drafted and its premise no longer holds.
  SELECT count(*) INTO v_rules
    FROM public.hostel_room_eligibility_rules re
   WHERE re.id IN ('7dd8dc70-8fed-4948-bc26-26f78f178604',
                   'a1fb768d-2e18-4e1b-bfe8-e1367e6d8f0a',
                   'fc16d854-fff5-44f9-8330-20a0af7dd500')
     AND re.is_active
     AND re.block_id = v_block
     AND re.floor IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.hostel_room_eligibility_rule_rooms rr
                     WHERE rr.rule_id = re.id);
  IF v_rules <> 3 THEN
    RAISE EXCEPTION 'Expected 3 block-wide rules on Girls Hostel A, found %. Aborting.', v_rules;
  END IF;

  -- ── Attach each rule's currently-occupied rooms ───────────────────────────
  -- occ = every (rule, room) pair where that rule's cohort has a live
  -- allocation. hostel_allocations.learner_id is a profiles id, so the learner
  -- master record is reached via profiles.learner_id.
  WITH occ AS (
    SELECT re.id AS rule_id, r.id AS room_id
    FROM public.hostel_room_eligibility_rules re
    JOIN public.hostel_allocations a  ON a.status IN ('active','pending_approval')
    JOIN public.hostel_rooms r        ON r.id = a.room_id AND r.block_id = v_block
    JOIN public.profiles p            ON p.id = a.learner_id
    JOIN public.learners_profiles lp  ON lp.id = p.learner_id
    WHERE re.id IN ('7dd8dc70-8fed-4948-bc26-26f78f178604',
                    'a1fb768d-2e18-4e1b-bfe8-e1367e6d8f0a',
                    'fc16d854-fff5-44f9-8330-20a0af7dd500')
      AND lp.institution_id = re.institution_id
      AND (re.degree_id     IS NULL OR re.degree_id     = lp.degree_id)
      AND (re.department_id IS NULL OR re.department_id = lp.department_id)
      AND (re.program_id    IS NULL OR re.program_id    = lp.program_id)
      -- The two rooms the operator chose to release. Excluded for EVERY rule,
      -- not just Dental, so no other cohort's list can re-cover them.
      AND r.id NOT IN (v_room_54, v_room_3)
    GROUP BY re.id, r.id
  )
  INSERT INTO public.hostel_room_eligibility_rule_rooms (rule_id, room_id)
  SELECT rule_id, room_id FROM occ
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Attached % (rule, room) pairs.', v_n;

  -- Every rule must end up with at least one room: a rule left with none stays
  -- block-wide, which is precisely what this migration exists to remove.
  SELECT count(*) INTO v_n
    FROM public.hostel_room_eligibility_rules re
   WHERE re.id IN ('7dd8dc70-8fed-4948-bc26-26f78f178604',
                   'a1fb768d-2e18-4e1b-bfe8-e1367e6d8f0a',
                   'fc16d854-fff5-44f9-8330-20a0af7dd500')
     AND NOT EXISTS (SELECT 1 FROM public.hostel_room_eligibility_rule_rooms rr
                     WHERE rr.rule_id = re.id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% of the 3 rules still has no rooms — it would remain block-wide. Aborting.', v_n;
  END IF;

  -- ── Nobody may lose rule access to a room they live in ───────────────────
  -- Same cohort join as above, now asserting the pair EXISTS. Rooms 54 and 3
  -- are the two sanctioned exceptions.
  SELECT count(*) INTO v_n
    FROM public.hostel_room_eligibility_rules re
    JOIN public.hostel_allocations a  ON a.status IN ('active','pending_approval')
    JOIN public.hostel_rooms r        ON r.id = a.room_id AND r.block_id = v_block
    JOIN public.profiles p            ON p.id = a.learner_id
    JOIN public.learners_profiles lp  ON lp.id = p.learner_id
   WHERE re.id IN ('7dd8dc70-8fed-4948-bc26-26f78f178604',
                   'a1fb768d-2e18-4e1b-bfe8-e1367e6d8f0a',
                   'fc16d854-fff5-44f9-8330-20a0af7dd500')
     AND lp.institution_id = re.institution_id
     AND (re.degree_id     IS NULL OR re.degree_id     = lp.degree_id)
     AND (re.department_id IS NULL OR re.department_id = lp.department_id)
     AND (re.program_id    IS NULL OR re.program_id    = lp.program_id)
     AND r.id NOT IN (v_room_54, v_room_3)
     AND NOT EXISTS (SELECT 1 FROM public.hostel_room_eligibility_rule_rooms rr
                     WHERE rr.rule_id = re.id AND rr.room_id = r.id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% occupied (rule, room) pairs are missing from the new lists. Aborting.', v_n;
  END IF;

  -- ── Rooms 54 and 3 must now be covered by NO active rule ─────────────────
  -- This is the whole point: uncovered == reachable by the overflow tier. The
  -- test is the verbatim v_has_covering expression from
  -- fn_learner_strictly_eligible_for_room, so it agrees with the engine.
  SELECT count(*) INTO v_n
    FROM public.hostel_rooms r
   WHERE r.id IN (v_room_54, v_room_3)
     AND EXISTS (
       SELECT 1 FROM public.hostel_room_eligibility_rules re
       WHERE re.is_active AND re.block_id = r.block_id
         AND CASE
               WHEN EXISTS (SELECT 1 FROM public.hostel_room_eligibility_rule_rooms rr
                            WHERE rr.rule_id = re.id)
                 THEN EXISTS (SELECT 1 FROM public.hostel_room_eligibility_rule_rooms rr
                              WHERE rr.rule_id = re.id AND rr.room_id = r.id)
               ELSE (re.floor IS NULL OR re.floor = r.floor)
             END
     );
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Rooms 54/3 are still covered by % rule(s) — overflow cannot reach them. Aborting.', v_n;
  END IF;

  -- No rule on this block may still be block-wide.
  SELECT count(*) INTO v_n
    FROM public.hostel_room_eligibility_rules re
   WHERE re.is_active AND re.block_id = v_block AND re.floor IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.hostel_room_eligibility_rule_rooms rr
                     WHERE rr.rule_id = re.id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% block-wide rule(s) remain on Girls Hostel A. Aborting.', v_n;
  END IF;

  -- Blocks B and C must be untouched: still exactly 1 and 2 block-wide rules.
  SELECT count(*) INTO v_n
    FROM public.hostel_room_eligibility_rules re
    JOIN public.hostel_blocks hb ON hb.id = re.block_id
   WHERE re.is_active AND hb.name IN ('Girls Hostel B','Girls Hostel C')
     AND re.floor IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.hostel_room_eligibility_rule_rooms rr
                     WHERE rr.rule_id = re.id);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Expected 3 block-wide rules across Girls Hostel B + C, found %. Aborting.', v_n;
  END IF;

  RAISE NOTICE 'OK: Girls Hostel A block-wide rules converted; rooms 54 and 3 released.';
END $$;

COMMIT;

-- Rollback (manual, if ever needed) — restores the block-wide state by removing
-- every room link from the three rules:
--   DELETE FROM hostel_room_eligibility_rule_rooms
--    WHERE rule_id IN ('7dd8dc70-8fed-4948-bc26-26f78f178604',
--                      'a1fb768d-2e18-4e1b-bfe8-e1367e6d8f0a',
--                      'fc16d854-fff5-44f9-8330-20a0af7dd500');
--   INSERT INTO hostel_room_eligibility_rule_rooms (rule_id, room_id)
--   SELECT rule_id, room_id FROM bak_gha_blockwide_rule_rooms_20260810;
