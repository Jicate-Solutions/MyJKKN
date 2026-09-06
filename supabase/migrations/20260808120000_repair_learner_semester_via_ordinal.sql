-- 2026-08-08 PHASE 3 — the 9 rows left by 20260731170000 that have NO usable
-- section, so the section-derived key had nothing to read.
--
-- KEY: the ORDINAL implied by the name the row currently displays, matched
-- against the learner's own institution+programme. 'Semester I' -> 1,
-- 'Semester VIII' -> 8, '6 Year' -> 6; then find the one semester carrying that
-- ordinal in the correct scope.
--
-- WHY THIS IS TRUSTWORTHY DESPITE BEING A SINGLE SIGNAL: 20260731170000 had
-- both signals available on 228 rows — section-derived AND ordinal-derived —
-- and they agreed on the identical uuid 228 times with ZERO disagreements. The
-- ordinal method is therefore not a guess; it is a method already validated
-- against ground truth on this exact dataset. It is used here only where the
-- section signal is missing.
--
-- SCOPE GUARD: the write requires candidates = 1. An ordinal with no target
-- (M.COM has four semesters, so ordinal 8 resolves to nothing) or an ambiguous
-- one is skipped and left for 20260808130000.
--
-- These 9 rows are snapshotted into their OWN table so this phase can be
-- reverted independently of phases 1, 2 and 4.
--   2 active   : PRATHIBA S (A&S Aided, B.Sc MATHEMATICS) and SRIMATHI M
--                (ES23302, Engineering, B.E. CSE) — both stranded on Pharmacy
--                PHARMD '6 Year', both -> their own 'Semester VI'.
--   7 non-active: rejected / reserved / enquiry_submitted.

DROP TABLE IF EXISTS public._bak_learner_semester_ordinal_repair_20260808;

CREATE TABLE public._bak_learner_semester_ordinal_repair_20260808 AS
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
SELECT lp.id            AS learner_id,
       lp.roll_number,
       lp.lifecycle_status,
       lp.institution_id,
       lp.program_id,
       lp.semester_id   AS old_semester_id,
       o.semester_name  AS old_semester_name,
       o.institution_id AS old_semester_belonged_to,
       o.ordinal        AS old_ordinal,
       tgt.new_id       AS new_semester_id,
       tgt.candidates,
       now()            AS snapshot_at
FROM public.learners_profiles lp
JOIN ord o ON o.id = lp.semester_id
LEFT JOIN LATERAL (
  SELECT (array_agg(s2.id))[1] AS new_id, count(*) AS candidates
  FROM ord s2
  WHERE s2.institution_id = lp.institution_id
    AND s2.program_id     = lp.program_id
    AND s2.ordinal        = o.ordinal
) tgt ON true
WHERE o.institution_id IS DISTINCT FROM lp.institution_id;

-- Triggers OFF: the repo pattern for bulk learners_profiles writes. Several of
-- these rows still carry unrelated pre-existing violations (a foreign
-- section_id) that BEFORE-UPDATE validation would abort on.
ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;

UPDATE public.learners_profiles lp
SET    semester_id = b.new_semester_id,
       updated_at  = now()
FROM   public._bak_learner_semester_ordinal_repair_20260808 b
WHERE  lp.id          = b.learner_id
  AND  b.candidates   = 1
  AND  b.new_semester_id IS NOT NULL
  AND  lp.semester_id = b.old_semester_id;  -- idempotent: no-op on re-run

ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;

DO $$
DECLARE
  v_remaining int;
  v_expected  int;
BEGIN
  SELECT count(*) INTO v_expected
  FROM public._bak_learner_semester_ordinal_repair_20260808
  WHERE candidates <> 1 OR new_semester_id IS NULL;

  SELECT count(*) INTO v_remaining
  FROM public.learners_profiles lp
  JOIN public.semesters s ON s.id = lp.semester_id
  WHERE s.institution_id IS DISTINCT FROM lp.institution_id;

  IF v_remaining <> v_expected THEN
    RAISE EXCEPTION
      'ordinal repair verification failed: % cross-institution rows remain, expected %',
      v_remaining, v_expected;
  END IF;

  RAISE NOTICE 'ordinal repair OK: % rows left with no valid target', v_expected;
END $$;
