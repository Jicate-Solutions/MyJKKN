-- 2026-08-08 PHASE 2 — the 21 JKKN College of Arts and Science (Self) M.COM
-- learners whose program_id, semester_id AND section_id ALL point at Arts&Sci
-- (Aided)'s M.COM rows. A COMPOUND corruption, and the reason this block
-- survived all three 2026-07-30/31 repair waves plus 20260731170000.
--
-- WHY EVERY EARLIER KEY MISSED IT: each prior repair searches for the correct
-- row within (learner institution, learner program_id). Here the program_id is
-- itself foreign, so that scope is empty and every candidate count came back 0.
-- The rows were then recorded as "unresolvable — own institution+programme has
-- no semester of that name", which was true but for the wrong reason.
--
-- WHY IT WAS NEVER CAUGHT BY THE GUARD: validate_learner_semester_year_scope
-- covers degree_id, department_id, semester_id, academic_year_id and
-- section_id. It has NEVER covered program_id. Phase 5 (20260808140000) closes
-- that gap; without it this block can simply reappear.
--
-- GROUND TRUTH: department_id. Wave two established that the learners'
-- department_id matched their institution 4341/4341 — department is the one
-- scope column the 2026-07-30 write did not move. Arts&Sci (Self) owns
-- department 'Commerce (PG)' (76921a44…), and exactly one programme named
-- 'MASTER OF COMMERCE' hangs off it (40633012…), carrying its own four
-- semesters and four sections. So the chain resolves by direct FK read:
--
--   program  := the programme of the learner's OWN department with the same name
--   semester := the semester of that programme with the same ORDINAL
--   section  := the section of that programme+semester with the same NAME
--
-- ORDER IS LOAD-BEARING: program_id must be corrected first, because the
-- semester and section lookups are both scoped by it. All three are written in
-- ONE update so no intermediate half-corrected state is ever visible.

-- ---------------------------------------------------------------------------
-- 1. Snapshot + resolution, with a candidate count at every level.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._bak_learner_mcom_scope_repair_20260808;

CREATE TABLE public._bak_learner_mcom_scope_repair_20260808 AS
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
),
broken AS (
  SELECT lp.id              AS learner_id,
         lp.roll_number,
         lp.lifecycle_status,
         lp.institution_id,
         lp.department_id,
         lp.program_id      AS old_program_id,
         lp.semester_id     AS old_semester_id,
         lp.section_id      AS old_section_id,
         oldp.program_name,
         o.semester_name    AS old_semester_name,
         o.ordinal          AS old_ordinal,
         oldsec.section_name AS old_section_name
  FROM public.learners_profiles lp
  JOIN public.programs oldp        ON oldp.id   = lp.program_id
  LEFT JOIN ord o                  ON o.id      = lp.semester_id
  LEFT JOIN public.sections oldsec ON oldsec.id = lp.section_id
  WHERE oldp.institution_id IS DISTINCT FROM lp.institution_id
)
SELECT b.*,
       np.new_program_id,   np.candidates AS program_candidates,
       ns.new_semester_id,  ns.candidates AS semester_candidates,
       nx.new_section_id,   nx.candidates AS section_candidates,
       now() AS snapshot_at
FROM broken b
LEFT JOIN LATERAL (
  SELECT (array_agg(p2.id))[1] AS new_program_id, count(*) AS candidates
  FROM public.programs p2
  WHERE p2.institution_id = b.institution_id
    AND p2.department_id  = b.department_id
    AND p2.program_name   = b.program_name
) np ON true
LEFT JOIN LATERAL (
  SELECT (array_agg(s2.id))[1] AS new_semester_id, count(*) AS candidates
  FROM ord s2
  WHERE s2.institution_id = b.institution_id
    AND s2.program_id     = np.new_program_id
    AND s2.ordinal        = b.old_ordinal
) ns ON true
LEFT JOIN LATERAL (
  SELECT (array_agg(sc2.id))[1] AS new_section_id, count(*) AS candidates
  FROM public.sections sc2
  WHERE sc2.institution_id = b.institution_id
    AND sc2.program_id     = np.new_program_id
    AND sc2.semester_id    = ns.new_semester_id
    AND sc2.section_name   = b.old_section_name
) nx ON true;

-- ---------------------------------------------------------------------------
-- 2. Refuse to write anything unless EVERY level resolved to exactly one row.
--    A 0 means the target does not exist; a 2+ means the name is ambiguous
--    inside the corrected scope. Either way, guessing is not acceptable here.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public._bak_learner_mcom_scope_repair_20260808
  WHERE program_candidates <> 1
     OR (old_semester_id IS NOT NULL AND semester_candidates <> 1)
     OR (old_section_id  IS NOT NULL AND section_candidates  <> 1);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'M.COM compound repair aborted: % row(s) did not resolve to exactly one candidate at every level — inspect _bak_learner_mcom_scope_repair_20260808',
      v_bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Repair. Triggers OFF: the row set still holds several mutually dependent
--    violations at once, and validate_learner_semester_year_scope would fire on
--    the semester/section columns before the programme move is visible.
-- ---------------------------------------------------------------------------
ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;

UPDATE public.learners_profiles lp
SET    program_id  = b.new_program_id,
       semester_id = COALESCE(b.new_semester_id, lp.semester_id),
       section_id  = COALESCE(b.new_section_id,  lp.section_id),
       updated_at  = now()
FROM   public._bak_learner_mcom_scope_repair_20260808 b
WHERE  lp.id         = b.learner_id
  AND  lp.program_id = b.old_program_id;  -- idempotent: no-op on re-run

ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 4. Verify: no learner may hold another institution's programme.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_prog int;
  v_sem  int;
  v_sec  int;
BEGIN
  SELECT count(*) INTO v_prog
  FROM public.learners_profiles lp
  JOIN public.programs p ON p.id = lp.program_id
  WHERE p.institution_id IS DISTINCT FROM lp.institution_id;

  SELECT count(*) INTO v_sem
  FROM public.learners_profiles lp
  JOIN public.semesters s ON s.id = lp.semester_id
  WHERE s.institution_id IS DISTINCT FROM lp.institution_id;

  SELECT count(*) INTO v_sec
  FROM public.learners_profiles lp
  JOIN public.sections sc ON sc.id = lp.section_id
  WHERE sc.institution_id IS DISTINCT FROM lp.institution_id;

  IF v_prog <> 0 THEN
    RAISE EXCEPTION 'M.COM repair verification failed: % cross-institution program_id rows remain', v_prog;
  END IF;

  RAISE NOTICE 'M.COM compound repair OK: program 0, semester % remaining, section % remaining',
    v_sem, v_sec;
END $$;
