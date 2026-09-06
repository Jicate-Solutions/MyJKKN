-- Fix: the BDS Deluxe room rule pointed at ANOTHER college's "Semester IV".
--
-- 20260807_boys_hostel_deluxe_room_rules.sql created the Boys Hostel A rule
-- "BDS Deluxe - rooms 219, 220" so Deluxe-entitled Dental boys could reach a
-- Deluxe room, and deliberately meant to include the 4th-year cohort. It
-- resolved that cohort by the NAME 'Semester IV' and landed on
-- 902446f0-f33b-4c81-803e-37483e77f1ba, which is Semester IV of
-- M.PHARM(Regulatory Affairs) at JKKN College of Pharmacy: 0 active learners,
-- and unreachable from a rule scoped to institution = Dental AND program = BDS.
--
-- BDS numbers its semesters by YEAR, not by roman numeral. The real 4th-year
-- row is b9d3aa7d-f2c8-4324-ad8e-71482ace6e9a, named '4 Year' (83 active).
--
-- Symptom: the 6 Deluxe-entitled BDS "4 Year" boys matched no Boys Hostel A
-- rule, fell through to the Boys Hostel B floor-2 BDS rule (Classic rooms only,
-- 408-414), and fn_auto_allocate_candidates reported
--   "Rooms they may occupy are a different room category than their eligible
--    Deluxe Room - fix the reservation rooms or the Category-Eligibility band"
-- i.e. physical_rule_ok = false with physical_ok_other_category = true. The
-- Category-Eligibility band was correct throughout: BDS 449,999-600,001 ->
-- Deluxe Room is what put them on Deluxe in the first place, and the 1/2/3 Year
-- Deluxe learners on the same band allocate fine.
--
-- Dry-run in a rolled-back transaction before applying: boys preview
-- in 239 -> 245, out 25 -> 19, and the only remaining exclusions are the 19
-- learners with no academic bill. No other learner moved: a Classic-entitled
-- 4 Year learner still cannot land in 219/220 because the engine intersects a
-- rule's rooms with the learner's band (sr.category_id = ANY(ct.room_cats)).
--
-- array_replace, not a rebuilt literal: semester_ids order IS the auto-allocate
-- fill order, so '4 Year' has to take the slot 'Semester IV' occupied.
-- The join on semesters resolves the replacement inside the rule's OWN
-- institution + program, which is exactly the scoping the 08-07 lookup missed.

UPDATE hostel_room_eligibility_rules r
   SET semester_ids = array_replace(
         r.semester_ids,
         '902446f0-f33b-4c81-803e-37483e77f1ba'::uuid,
         tgt.id
       ),
       updated_at = now()
  FROM semesters tgt
 WHERE r.id = '20ccb73f-3b5f-472e-aca5-e35e58854bb2'
   AND '902446f0-f33b-4c81-803e-37483e77f1ba'::uuid = ANY(r.semester_ids)
   AND tgt.institution_id = r.institution_id
   AND tgt.program_id     = r.program_id
   AND tgt.semester_name  = '4 Year';

DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT      'b9d3aa7d-f2c8-4324-ad8e-71482ace6e9a'::uuid = ANY(semester_ids)
         AND NOT ('902446f0-f33b-4c81-803e-37483e77f1ba'::uuid = ANY(semester_ids))
    INTO v_ok
    FROM hostel_room_eligibility_rules
   WHERE id = '20ccb73f-3b5f-472e-aca5-e35e58854bb2';

  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION
      'BDS Deluxe rule 20ccb73f still does not cover BDS "4 Year" (semester_ids=%)',
      (SELECT semester_ids FROM hostel_room_eligibility_rules
        WHERE id = '20ccb73f-3b5f-472e-aca5-e35e58854bb2');
  END IF;
END $$;
