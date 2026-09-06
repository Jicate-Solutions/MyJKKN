-- 2026-08-08 PHASE 5 — the PROGRAMME-level residue.
--
-- Phases 1-4 drove cross-INSTITUTION semester_id to zero. This phase closes the
-- weaker violation the old guard never checked at all: a semester (or section)
-- belonging to the learner's own institution but to the WRONG PROGRAMME.
--
-- WHY THIS MATTERS AND ISN'T COSMETIC: `semesters` is programme-scoped — Dental
-- legitimately has six rows named '1 Year', one per programme. Institution
-- scope alone therefore cannot tell 'Semester I of B.Sc CS' from 'Semester I of
-- B.A. English'. Both are valid rows of the right college, and both render the
-- identical label, so the UI shows nothing wrong — but every uuid comparison
-- (timetable, attendance roster, billing coverage, the profiles filter) fails.
-- This is the SAME failure mode as the cross-institution wave, one level down.
--
-- ORDER IS LOAD-BEARING, AGAIN: sections are semester-scoped, so a learner
-- sitting on another programme's semester necessarily also sits on another
-- programme's section. Step 1 must move the semester before step 2 can find the
-- right section. Running step 2 first would find nothing and silently no-op.
--
-- KEY: the ordinal implied by the name, matched inside the learner's OWN
-- programme — the method validated 228/228 against section-derived ground truth
-- in 20260731170000. candidates = 1 is required; anything else is skipped.
--
-- NOT REPAIRED (reported, not guessed):
--   2 x PHARM D PB 'reserved' learners holding PHARMD's '1 Year'. PHARM D PB is
--     the post-baccalaureate route and its own semester list does not start at
--     ordinal 1, so there is no year-1 row to move them to. Their true entry
--     year is an admissions decision, not something derivable from the data.
--   17 Nattraja Vidhyalya CBSE rows named '[TEST] …' / 'LTI-Test Student',
--     which carry program_id = NULL. With no programme there is no scope to
--     search inside. These are fixtures, not learners; left untouched
--     deliberately so a real repair is never confused with test noise.

-- ---------------------------------------------------------------------------
-- STEP 1 — semester: right institution, wrong programme.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._bak_learner_semester_programme_repair_20260808;

CREATE TABLE public._bak_learner_semester_programme_repair_20260808 AS
WITH ord AS (
  SELECT s.id, s.institution_id, s.program_id, s.semester_name,
         CASE upper(regexp_replace(s.semester_name, '^\s*Semester\s+', '', 'i'))
           WHEN 'I'   THEN 1 WHEN 'II'   THEN 2 WHEN 'III' THEN 3
           WHEN 'IV'  THEN 4 WHEN 'V'    THEN 5 WHEN 'VI'  THEN 6
           WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8 WHEN 'IX'  THEN 9
           WHEN 'X'   THEN 10
           ELSE NULLIF(regexp_replace(s.semester_name, '\D', '', 'g'), '')::int
         END AS ordinal
  FROM public.semesters s
)
SELECT lp.id           AS learner_id,
       lp.roll_number,
       lp.lifecycle_status,
       lp.institution_id,
       lp.program_id,
       lp.semester_id  AS old_semester_id,
       o.semester_name AS old_semester_name,
       o.program_id    AS old_semester_programme,
       o.ordinal       AS old_ordinal,
       tgt.new_id      AS new_semester_id,
       tgt.candidates,
       now()           AS snapshot_at
FROM public.learners_profiles lp
JOIN ord o ON o.id = lp.semester_id
LEFT JOIN LATERAL (
  SELECT (array_agg(s2.id))[1] AS new_id, count(*) AS candidates
  FROM ord s2
  WHERE s2.institution_id = lp.institution_id
    AND s2.program_id     = lp.program_id
    AND s2.ordinal        = o.ordinal
) tgt ON true
WHERE o.institution_id = lp.institution_id
  AND o.program_id IS DISTINCT FROM lp.program_id;

ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;

UPDATE public.learners_profiles lp
SET    semester_id = b.new_semester_id,
       updated_at  = now()
FROM   public._bak_learner_semester_programme_repair_20260808 b
WHERE  lp.id          = b.learner_id
  AND  b.candidates   = 1
  AND  b.new_semester_id IS NOT NULL
  AND  lp.semester_id = b.old_semester_id;  -- idempotent

-- ---------------------------------------------------------------------------
-- STEP 2 — section: must now agree with the (corrected) institution+programme
--          +semester. Key is the section NAME inside that corrected scope,
--          which is exactly the wave-three key from 20260731100130.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._bak_learner_section_residue_repair_20260808;

CREATE TABLE public._bak_learner_section_residue_repair_20260808 AS
SELECT lp.id          AS learner_id,
       lp.roll_number,
       lp.lifecycle_status,
       lp.institution_id,
       lp.program_id,
       lp.semester_id,
       lp.section_id  AS old_section_id,
       sec.section_name,
       sec.institution_id AS old_section_institution,
       sec.program_id     AS old_section_programme,
       sec.semester_id    AS old_section_semester,
       tgt.new_id     AS new_section_id,
       tgt.candidates,
       now()          AS snapshot_at
FROM public.learners_profiles lp
JOIN public.sections sec ON sec.id = lp.section_id
LEFT JOIN LATERAL (
  SELECT (array_agg(s2.id))[1] AS new_id, count(*) AS candidates
  FROM public.sections s2
  WHERE s2.institution_id = lp.institution_id
    AND s2.program_id     = lp.program_id
    AND s2.semester_id    = lp.semester_id
    AND s2.section_name   = sec.section_name
) tgt ON true
WHERE sec.institution_id IS DISTINCT FROM lp.institution_id
   OR sec.program_id     IS DISTINCT FROM lp.program_id
   OR sec.semester_id    IS DISTINCT FROM lp.semester_id;

UPDATE public.learners_profiles lp
SET    section_id = b.new_section_id,
       updated_at = now()
FROM   public._bak_learner_section_residue_repair_20260808 b
WHERE  lp.id         = b.learner_id
  AND  b.candidates  = 1
  AND  b.new_section_id IS NOT NULL
  AND  lp.section_id = b.old_section_id;  -- idempotent

ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- STEP 3 — verify. Cross-institution must be zero on every axis; the remaining
--          programme-level rows must be exactly the documented unresolvable set.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sem_inst int; v_sec_inst int; v_prog_inst int;
  v_sem_prog int; v_sec_prog int;
BEGIN
  SELECT count(*) INTO v_sem_inst FROM public.learners_profiles lp
    JOIN public.semesters s ON s.id = lp.semester_id
    WHERE s.institution_id IS DISTINCT FROM lp.institution_id;

  SELECT count(*) INTO v_sec_inst FROM public.learners_profiles lp
    JOIN public.sections sc ON sc.id = lp.section_id
    WHERE sc.institution_id IS DISTINCT FROM lp.institution_id;

  SELECT count(*) INTO v_prog_inst FROM public.learners_profiles lp
    JOIN public.programs p ON p.id = lp.program_id
    WHERE p.institution_id IS DISTINCT FROM lp.institution_id;

  SELECT count(*) INTO v_sem_prog FROM public.learners_profiles lp
    JOIN public.semesters s ON s.id = lp.semester_id
    WHERE s.institution_id = lp.institution_id
      AND s.program_id IS DISTINCT FROM lp.program_id;

  SELECT count(*) INTO v_sec_prog FROM public.learners_profiles lp
    JOIN public.sections sc ON sc.id = lp.section_id
    WHERE sc.institution_id = lp.institution_id
      AND sc.program_id IS DISTINCT FROM lp.program_id;

  IF v_sem_inst <> 0 OR v_sec_inst <> 0 OR v_prog_inst <> 0 THEN
    RAISE EXCEPTION
      'programme residue repair failed: cross-institution rows remain (semester %, section %, programme %)',
      v_sem_inst, v_sec_inst, v_prog_inst;
  END IF;

  RAISE NOTICE 'programme residue repair OK: cross-institution 0/0/0; programme-level residue semester %, section %',
    v_sem_prog, v_sec_prog;
END $$;
