-- 2026-07-31: repair learners_profiles.semester_id pointing at ANOTHER
-- institution's semester, using sections.semester_id as ground truth.
--
-- RESIDUE of the 2026-07-30 bulk-write incident. Wave one (20260730160000)
-- repaired semester_id + academic_year_id by NAME, keyed
-- (institution_id, program_id, semester_name), and deliberately left 319 rows
-- alone because their own institution+programme had no semester of that name.
-- This migration clears the largest part of that residue with a key that does
-- not involve names at all.
--
-- WHY A NAME KEY COULD NEVER WORK HERE: the group spells the same ordinal three
-- different ways. Dental and Allied are year-style ('4 Year'); Arts&Sci
-- Self/Aided, Engineering, Education and Pharmacy are roman ('Semester IV').
-- So a Dental BDS learner stranded on Pharmacy's 'Semester IV' has no Dental
-- row of that name to match: wave one (20260730100923) recorded
-- semester_candidates = 0 and skipped it. Nursing failed identically at the
-- time, because it then used ARABIC names ('Semester 1'..'Semester 8').
--
-- CORRECTED 2026-08-08 — DO NOT re-derive the old claim from this file:
-- Nursing's BSC semesters have since been renamed to ROMAN ('Semester I'..
-- 'Semester VIII', codes BSC-NS-SEM-1..8). There are now ZERO arabic-named
-- semester rows group-wide. A name key would therefore work for the Nursing
-- rows today — but still NOT for the 57 Dental BDS rows, whose own programme
-- names that ordinal '4 Year'. The section-derived key below is unaffected by
-- any of this: it never reads a name.
--
-- HOW IT SURFACED: /billing/coverage — Institution=Nursing, Programme=BSC
-- (Nursing), Show=Not generated -> 80 learners, every row DISPLAYING
-- 'Semester VIII · A'; picking any semester from the dropdown -> 0 rows.
-- get_billing_coverage_learners renders the label off
-- `LEFT JOIN semesters sem ON sem.id = s.semester_id` (so a foreign row prints
-- a perfectly plausible name) but filters on `lp.semester_id = p_semester_id`.
-- The dropdown is correctly scoped by programme, so it can only ever offer
-- Nursing's own uuids — none of which those 80 rows hold. Display forgives a
-- same-named FK; a uuid comparison does not.
--
-- KEY: sections.semester_id — a direct FK read, no name matching, the same
-- technique wave two used to recover degree_id from departments.degree_id.
-- `sections` is semester-scoped, and these learners' section_id already points
-- at their OWN institution's section, so the section names the right semester.
-- 228 of the 260 broken rows resolve this way. (It was 228 of 318 when this was
-- drafted; a separate repair on 2026-08-05 — snapshot
-- _bak_nursing_sem6_section_repair_20260805 — cleared the 57-row Nursing
-- '6 Year' cohort plus one stray. The resolvable set itself is unchanged.)
--   Nursing BSC  'Semester VIII' -> 'Semester VIII'  58
--   Nursing BSC  'Semester II'   -> 'Semester II'    57
--   Nursing BSC  'Semester IV'   -> 'Semester IV'    56
--   Dental BDS   'Semester IV'   -> '4 Year'         57
--
-- CORROBORATION: for all 228, the semester NUMBER implied by the foreign row's
-- name equals the number of the section-derived semester. Two independent
-- signals agree on every row — 228 agreements, 0 disagreements, re-verified
-- 2026-08-08. This check is load-bearing: 229 rows group-wide have a section
-- naming a DIFFERENT semester than the learner holds. 228 of those are these
-- same corrupted rows (the section is right, the semester is wrong), but 1 is
-- genuine promotion drift — learner moved on, section did not. Trusting the
-- section alone would silently rewrite that one. Step 2 refuses to run if any
-- row disagrees.
--
-- 32 LEFT UNFIXED BY THIS MIGRATION: no section, a foreign section, or a
-- section whose semester belongs to a different programme. As of 2026-08-08:
--   21  Arts&Sci (Self) M.COM learners whose program_id ALSO points at
--       Arts&Sci (Aided). This key cannot see past that — it searches within
--       (learner institution, learner program_id) and the programme itself is
--       foreign, so the scope is empty. Handled in 20260808110000, which must
--       repair program_id FIRST.
--    9  no usable section; recoverable only from the name's ordinal
--       (20260808120000).
--    2  no valid target at all (20260808130000).

-- ---------------------------------------------------------------------------
-- 1. Snapshot: old + new for every cross-institution row, resolvable or not.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._bak_learner_semester_repair_20260731;

CREATE TABLE public._bak_learner_semester_repair_20260731 AS
WITH ord AS (
  -- Semester number implied by the name, across all three naming conventions
  -- in use group-wide: roman ('Semester VIII'), arabic ('Semester 8') and
  -- year-style ('4 Year'). NULL for 'Freshers', which carries no number.
  SELECT s.id,
         s.semester_name,
         s.institution_id,
         s.program_id,
         CASE upper(regexp_replace(s.semester_name, '^\s*Semester\s+', '', 'i'))
           WHEN 'I'   THEN 1 WHEN 'II'   THEN 2 WHEN 'III' THEN 3
           WHEN 'IV'  THEN 4 WHEN 'V'    THEN 5 WHEN 'VI'  THEN 6
           WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8 WHEN 'IX'  THEN 9
           WHEN 'X'   THEN 10
           ELSE NULLIF(regexp_replace(s.semester_name, '\D', '', 'g'), '')::int
         END AS ordinal
  FROM public.semesters s
),
broken AS (
  SELECT lp.id            AS learner_id,
         lp.roll_number,
         lp.lifecycle_status,
         lp.institution_id,
         lp.program_id,
         lp.semester_id   AS old_semester_id,
         lp.section_id,
         -- Only a section belonging to the learner's OWN institution can serve
         -- as ground truth. A foreign section is itself unrepaired corruption.
         sec.semester_id  AS new_semester_id
  FROM public.learners_profiles lp
  JOIN public.semesters oldsem ON oldsem.id = lp.semester_id
  LEFT JOIN public.sections sec
         ON sec.id             = lp.section_id
        AND sec.institution_id = lp.institution_id
  WHERE oldsem.institution_id IS DISTINCT FROM lp.institution_id
)
SELECT b.learner_id,
       b.roll_number,
       b.lifecycle_status,
       b.institution_id,
       b.program_id,
       b.section_id,
       b.old_semester_id,
       o.semester_name   AS old_semester_name,
       o.institution_id  AS old_semester_belonged_to,
       o.ordinal         AS old_ordinal,
       b.new_semester_id,
       n.semester_name   AS new_semester_name,
       n.ordinal         AS new_ordinal,
       -- Resolvable: the section named a semester that is this learner's own
       -- institution AND own programme, and it is actually a different row.
       (b.new_semester_id IS NOT NULL
        AND n.institution_id = b.institution_id
        AND n.program_id     = b.program_id
        AND b.new_semester_id <> b.old_semester_id) AS resolvable,
       (o.ordinal IS NOT DISTINCT FROM n.ordinal)   AS corroborated
FROM broken b
JOIN      ord o ON o.id = b.old_semester_id
LEFT JOIN ord n ON n.id = b.new_semester_id;

-- ---------------------------------------------------------------------------
-- 2. Assert corroboration BEFORE writing anything. A resolvable row whose
--    section-derived semester disagrees with the number in the foreign row's
--    name is drift, not corruption — writing it would move a real learner to
--    the wrong semester. Fail the migration rather than guess.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public._bak_learner_semester_repair_20260731
  WHERE resolvable AND NOT corroborated;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'semester repair aborted: % resolvable row(s) whose section-derived semester does not match the ordinal of the name they currently display — inspect _bak_learner_semester_repair_20260731 before proceeding',
      v_bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Repair. Triggers OFF: learners_profiles carries six AFTER sync/CDC
--    triggers plus BEFORE setters, and validate_learner_semester_year_scope
--    fires BEFORE UPDATE across five FKs — this row set still holds unrelated
--    pre-existing violations (foreign section_id, foreign academic_year_id)
--    that would abort an otherwise correct write.
-- ---------------------------------------------------------------------------
ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;

UPDATE public.learners_profiles lp
SET    semester_id = b.new_semester_id,
       updated_at  = now()
FROM   public._bak_learner_semester_repair_20260731 b
WHERE  lp.id           = b.learner_id
  AND  b.resolvable
  AND  b.corroborated
  AND  lp.semester_id  = b.old_semester_id;  -- idempotent: no-op on re-run

ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 4. Verify: cross-institution rows must drop to exactly the unresolvable set.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_remaining int;
  v_expected  int;
  v_fixed     int;
BEGIN
  SELECT count(*) FILTER (WHERE NOT resolvable),
         count(*) FILTER (WHERE resolvable)
    INTO v_expected, v_fixed
  FROM public._bak_learner_semester_repair_20260731;

  SELECT count(*) INTO v_remaining
  FROM public.learners_profiles lp
  JOIN public.semesters s ON s.id = lp.semester_id
  WHERE s.institution_id IS DISTINCT FROM lp.institution_id;

  IF v_remaining <> v_expected THEN
    RAISE EXCEPTION
      'semester repair verification failed: % cross-institution rows remain, expected % (the unresolvable set)',
      v_remaining, v_expected;
  END IF;

  RAISE NOTICE 'semester repair OK: % rows fixed, % left unresolvable',
    v_fixed, v_expected;
END $$;
