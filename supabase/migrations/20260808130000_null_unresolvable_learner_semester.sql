-- 2026-08-08 PHASE 4 — the last 2 rows, which have no derivable correct value.
--
--   HARIPRIYA V   reserved  A&S (Self) MASTER OF COMMERCE
--                 holds Pharmacy's 'Semester VIII' (ordinal 8). M.COM has FOUR
--                 semesters, so ordinal 8 names nothing that could ever exist
--                 for this programme.
--   KARTHEEPAN S  enquiry   JKKN College of Education, program_id IS NULL
--                 holds Nattraja Vidhyalya CBSE's 'TERM', which carries no
--                 ordinal at all, and with no programme there is no scope to
--                 search inside.
--
-- Neither has a section to read, an ordinal that resolves, or a cohort pattern
-- to lean on. Any value written here would be invention.
--
-- NULL IS THE HONEST STATE, AND IT IS ALSO THE SAFER ONE. Leaving the foreign
-- uuid in place is actively harmful: the UI renders semesters by joining on id
-- and printing semester_name, so these rows currently DISPLAY a confident
-- 'Semester VIII' / 'TERM' that no filter, timetable or billing query will ever
-- match. A null renders as empty and reads as "not set", which is true.
-- semester_id is nullable and 74 learners already hold NULL, so this is an
-- ordinary state, not a special case.
--
-- ACTION FOR THE REGISTRAR: both learners are pre-enrolment (reserved /
-- enquiry). Set the semester through the normal Learner Profile screen when
-- their admission is finalised.

DROP TABLE IF EXISTS public._bak_learner_semester_nulled_20260808;

CREATE TABLE public._bak_learner_semester_nulled_20260808 AS
SELECT lp.id           AS learner_id,
       lp.roll_number,
       lp.first_name,
       lp.last_name,
       lp.lifecycle_status,
       lp.institution_id,
       lp.program_id,
       lp.semester_id  AS old_semester_id,
       s.semester_name AS old_semester_name,
       s.institution_id AS old_semester_belonged_to,
       now()           AS snapshot_at
FROM public.learners_profiles lp
JOIN public.semesters s ON s.id = lp.semester_id
WHERE s.institution_id IS DISTINCT FROM lp.institution_id;

ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;

UPDATE public.learners_profiles lp
SET    semester_id = NULL,
       updated_at  = now()
FROM   public._bak_learner_semester_nulled_20260808 b
WHERE  lp.id          = b.learner_id
  AND  lp.semester_id = b.old_semester_id;  -- idempotent: no-op on re-run

ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;

DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.learners_profiles lp
  JOIN public.semesters s ON s.id = lp.semester_id
  WHERE s.institution_id IS DISTINCT FROM lp.institution_id;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION
      'cross-institution semester_id should be 0 after phase 4, found %', v_remaining;
  END IF;

  RAISE NOTICE 'phase 4 OK: cross-institution semester_id is now 0 group-wide';
END $$;
