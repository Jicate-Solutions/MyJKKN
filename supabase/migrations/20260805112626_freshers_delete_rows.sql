-- Phase 3 of the Freshers-semester removal (2026-08-05).
-- Deletes the 117 placeholder semesters and their 117 section 'A' rows.
--
-- Order is forced by the schema, not preference: sections.semester_id is
-- ON DELETE NO ACTION, so the section rows hard-block the semester delete (23503).
-- Conversely learners_profiles.semester_id is ON DELETE SET NULL -- deleting
-- without reassigning first would NOT error, it would silently blank the semester
-- on every attached learner. Hence the pre-flight guard below.
DO $$
DECLARE v_learners int;
BEGIN
  SELECT COUNT(*) INTO v_learners
  FROM learners_profiles
  WHERE semester_id IN (SELECT id FROM semesters WHERE semester_order = 0)
     OR section_id IN (SELECT se.id FROM sections se
                       JOIN semesters s ON s.id = se.semester_id AND s.semester_order = 0);
  IF v_learners > 0 THEN
    RAISE EXCEPTION 'Aborting: % learner(s) still reference a Freshers semester or section', v_learners;
  END IF;
END $$;

DELETE FROM sections se
USING semesters s
WHERE s.id = se.semester_id AND s.semester_order = 0;

DELETE FROM semesters WHERE semester_order = 0;

-- Post-flight: nothing named Freshers may survive, including any row created by
-- hand through the semesters form or Excel import with a non-zero order.
DO $$
DECLARE v_left int;
BEGIN
  SELECT COUNT(*) INTO v_left FROM semesters
   WHERE semester_order = 0 OR btrim(lower(semester_name)) = 'freshers';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'Aborting: % Freshers semester row(s) survived the delete', v_left;
  END IF;
END $$;
