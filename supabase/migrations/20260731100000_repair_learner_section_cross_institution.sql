-- 2026-07-31: repair learners_profiles.section_id pointing at ANOTHER institution's section.
--
-- WAVE THREE of the 2026-07-30 bulk-write incident. The first repair
-- (20260730160000) fixed semester_id + academic_year_id; the second
-- (20260808100000) fixed degree_id. section_id was never checked and survived
-- both — 177 of the 179 broken rows carry updated_at on 2026-07-30.
--
-- HOW IT SURFACED: /learners/profiles advanced filter. Institution=Dental,
-- Programme=BDS, Semester='2 Year' -> 99 active learners, all displaying a
-- Section. Adding Section='A' -> 0. 44 of those 99 point at JKKN College of
-- PHARMACY's PHARMD '2 Year' section 'A' (836dec4f...). Dental's own BDS
-- '2 Year' section 'A' (b004c5bb...) had zero learners. Because both rows are
-- literally named 'A', the list rendered the right label off the wrong row —
-- the corruption was invisible until a section filter was applied.
--
-- EVERY one of the 179 broken rows is named 'A'. That is the signature of a
-- name-based resolve that matched section_name without scoping. There are 457
-- section rows named 'A' group-wide, so name alone is meaningless.
--
-- KEY: (institution_id, program_id, semester_id, section_name). `sections` is
-- semester-scoped (carries degree_id/department_id/program_id/semester_id), so
-- a name legitimately repeats across every cohort. Adding the three scope
-- columns makes it unique: 97 of 179 resolve to EXACTLY ONE section, 0 ambiguous.
--
-- 82 LEFT UNFIXED ON PURPOSE: their own institution+programme+semester has no
-- section named 'A' at all (Nursing BSC '6 Year' 57, Arts&Sci Self M.Com
-- 'Semester III' 20). True value is unknowable — same call the first repair made
-- for its 319 unresolvable semesters. Snapshot row has candidate_count = 0.
--
-- NOT TOUCHED (reported only, separate from this incident): 25 rows whose
-- section belongs to the right institution but a different programme, and 236
-- whose section is the right programme but a different semester — the latter is
-- most likely legitimate drift (learner promoted, section not moved with them).

-- ---------------------------------------------------------------------------
-- 1. Snapshot: old + new for every cross-institution row, resolvable or not.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._bak_learner_section_repair_20260731;

CREATE TABLE public._bak_learner_section_repair_20260731 AS
WITH broken AS (
  SELECT lp.id             AS learner_id,
         lp.roll_number,
         lp.lifecycle_status,
         lp.institution_id,
         lp.program_id,
         lp.semester_id,
         lp.section_id      AS old_section_id,
         s.institution_id   AS old_section_belonged_to,
         s.section_name
  FROM public.learners_profiles lp
  JOIN public.sections s ON s.id = lp.section_id
  WHERE s.institution_id IS DISTINCT FROM lp.institution_id
)
SELECT b.learner_id,
       b.roll_number,
       b.lifecycle_status,
       b.institution_id,
       b.program_id,
       b.semester_id,
       b.old_section_id,
       b.old_section_belonged_to,
       b.section_name,
       cand.new_section_id,
       cand.candidate_count
FROM broken b
CROSS JOIN LATERAL (
  -- min(uuid) does not exist in Postgres; array_agg subscript is the portable form.
  SELECT count(*)              AS candidate_count,
         (array_agg(t.id))[1]  AS new_section_id
  FROM public.sections t
  WHERE t.institution_id = b.institution_id
    AND t.program_id     = b.program_id
    AND t.semester_id    = b.semester_id
    AND t.section_name   = b.section_name
) cand;

-- ---------------------------------------------------------------------------
-- 2. Repair. Triggers OFF: learners_profiles carries six AFTER sync/CDC
--    triggers plus BEFORE setters. None react to section_id, but the blanket
--    trg_validate_learner_semester_year_scope fires BEFORE UPDATE on every
--    column, and this row set still holds unrelated pre-existing violations.
-- ---------------------------------------------------------------------------
ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;

UPDATE public.learners_profiles lp
SET    section_id = b.new_section_id,
       updated_at = now()
FROM   public._bak_learner_section_repair_20260731 b
WHERE  lp.id            = b.learner_id
  AND  b.candidate_count = 1
  AND  b.new_section_id IS NOT NULL
  AND  lp.section_id     = b.old_section_id;  -- idempotent: no-op on re-run

ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 3. Verify: cross-institution rows must drop to exactly the 82 unresolvable.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_remaining int;
  v_expected  int;
BEGIN
  SELECT count(*) INTO v_expected
  FROM public._bak_learner_section_repair_20260731
  WHERE candidate_count <> 1;

  SELECT count(*) INTO v_remaining
  FROM public.learners_profiles lp
  JOIN public.sections s ON s.id = lp.section_id
  WHERE s.institution_id IS DISTINCT FROM lp.institution_id;

  IF v_remaining <> v_expected THEN
    RAISE EXCEPTION
      'section repair verification failed: % cross-institution rows remain, expected % (the unresolvable set)',
      v_remaining, v_expected;
  END IF;

  RAISE NOTICE 'section repair OK: % rows fixed, % left unresolvable',
    (SELECT count(*) FROM public._bak_learner_section_repair_20260731 WHERE candidate_count = 1),
    v_expected;
END $$;
