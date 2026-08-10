-- Boys hostel: reserve Deluxe rooms for the cohorts whose fee band entitles them.
--
-- WHY (auto-allocate preview, 2026-08-07): 28 boys resolved to the Deluxe Room
-- category and NOT ONE was allocatable — every rule in every boys block that had
-- rooms attached pointed only at Classic Rooms, while all 6 Deluxe rooms (42
-- beds) sat empty. The preview reported "Rooms they may occupy are a different
-- room category than their eligible Deluxe Room".
--
-- The trap: fn_learner_strictly_eligible_for_room reads a rule's floor scope
-- ONLY when the rule has no explicit rooms —
--     CASE WHEN EXISTS (rows in hostel_room_eligibility_rule_rooms)
--            THEN rr.room_id = p_room_id     -- ONLY the listed rooms
--            ELSE (r.floor IS NULL OR r.floor = v_floor)
--     END
-- So a rule showing floor scope "Any" with 2 rooms attached means exactly those
-- 2 rooms; the "Any" is inert. The PHARMD 4 Year rule listed rooms 109 and 110,
-- both Classic, so its learners could reach no Deluxe room at all.
--
-- Split by college so cohorts never share a room across institutions:
--   Pharmacy PHARMD 1-5 Year (14 learners) -> rooms 217, 218 (14 beds)
--   Dental   BDS 1-3 Year + Sem IV (14)    -> rooms 219, 220 (14 beds)
--   Rooms 321, 322 (14 beds) left as headroom.
--
-- Existing Classic attachments are left in place: the engine intersects a rule's
-- rooms with the learner's Category-Eligibility band, so a Deluxe-entitled
-- learner will not land in 109/110 anyway.
--
-- Verified by dry-run before applying: Deluxe 28 out -> 28 in, with Classic
-- (194 in / 6 out) and the 36 learners lacking a usable fee band unchanged.

-- ── Pharmacy: attach Deluxe 217 + 218 to all five PHARMD rules in Boys Hostel A
INSERT INTO hostel_room_eligibility_rule_rooms (rule_id, room_id)
SELECT rule_id, room_id
FROM unnest(ARRAY[
       'e701e372-f043-440c-adac-e55c441c7017'::uuid,  -- PHARMD 1 Year
       '480301e6-dec7-42e1-9b52-5fd1017b71fe'::uuid,  -- PHARMD 2 Year
       '2a095a1e-321c-4e43-b403-a543673c2736'::uuid,  -- PHARMD 3 Year
       '55432ba8-af0c-44e6-947f-165ab17f35d0'::uuid,  -- PHARMD 4 Year
       'c0247533-e923-4087-87d7-865513a798d0'::uuid   -- PHARMD 5 + 6 Year
     ]) AS rule_id,
     unnest(ARRAY[
       'd04c0a61-8dcd-4ef4-870a-1c20c5a0508a'::uuid,  -- room 217
       '6617e4af-d16b-4b8d-8804-f738b7ed87b8'::uuid   -- room 218
     ]) AS room_id
ON CONFLICT DO NOTHING;

-- ── Dental: a rule can only cover rooms in its OWN block (covering filters
-- r.block_id = v_block), and every BDS rule lives in Boys Hostel B, which has no
-- Deluxe rooms. Hence a new Boys Hostel A rule rather than an edit.
-- Semester IV is included deliberately: those 6 learners were ALSO excluded for
-- "no physical-room rule reserves a room" because Sem IV is missing from both
-- Boys Hostel B rules' semester_ids. This row fixes both causes at once.
WITH new_rule AS (
  INSERT INTO hostel_room_eligibility_rules
    (institution_id, block_id, degree_id, department_id, program_id,
     semester_ids, floor, is_active, rule_name)
  SELECT 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,   -- JKKN Dental College and Hospital
         '956e0fa7-cb3c-4123-ab28-524b72142030'::uuid,   -- Boys Hostel A
         'f1ab9cc0-053f-4ceb-90e3-b7170f31ee53'::uuid,   -- Undergraduate
         '4679e9da-15ad-4a1a-95e3-622f18728239'::uuid,   -- Department of Dentistry (UG)
         'aea1e367-65ad-442d-9b11-ab0277d93a83'::uuid,   -- BDS
         ARRAY['f6c09a29-c0fe-4b27-9045-0e15de3cd640',   -- 1 Year
               '8e15676c-e3e8-4569-aa94-a4fd103bfede',   -- 2 Year
               '0f115110-37e9-48fe-adc9-6463971e5b3c',   -- 3 Year
               '902446f0-f33b-4c81-803e-37483e77f1ba'    -- Semester IV
              ]::uuid[],
         NULL, true, 'BDS Deluxe - rooms 219, 220'
  WHERE NOT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules
    WHERE block_id      = '956e0fa7-cb3c-4123-ab28-524b72142030'
      AND institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'
      AND program_id     = 'aea1e367-65ad-442d-9b11-ab0277d93a83'
      AND rule_name      = 'BDS Deluxe - rooms 219, 220'
  )
  RETURNING id
)
INSERT INTO hostel_room_eligibility_rule_rooms (rule_id, room_id)
SELECT nr.id, m
FROM new_rule nr,
     unnest(ARRAY[
       '3f3c83d8-a1b6-4e01-9a99-7051909ccb48'::uuid,  -- room 219
       '7e07e297-e665-4d71-ab6c-9ed7089fcbeb'::uuid   -- room 220
     ]) AS m
ON CONFLICT DO NOTHING;
