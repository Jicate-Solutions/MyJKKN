-- Phase 1 of the Freshers-semester removal (2026-08-05).
-- Moves every learner off the placeholder Freshers semester onto their program's
-- first real academic term.
--
-- Target rule (semester_order is NOT usable — 28 active programs have every
-- semester tied at order 1, and ordering by it would send BDS admissions to
-- BDS-CRRI, the final-year internship):
--   1. the semester flagged initial_semester, else
--   2. the lowest trailing number in semester_code (BDS-CRRI has none -> sorts last), else
--   3. the program's only real semester.
--
-- The program comes from learners_profiles.program_id, NOT from the placeholder
-- semester's program_id: 2 learners sit on another program's Freshers row and the
-- learner's own program is the authoritative one.

-- Guard: abort the whole migration rather than silently skip anyone.
DO $$
DECLARE v_unresolved int;
BEGIN
  WITH cand AS (
    SELECT s.id, s.program_id, s.semester_code, s.initial_semester,
           NULLIF(regexp_replace(s.semester_code,'^.*?(\d+)$','\1'), s.semester_code)::int AS num
    FROM semesters s WHERE s.semester_order <> 0
  ), target AS (
    SELECT DISTINCT ON (program_id) program_id, id AS target_id
    FROM cand ORDER BY program_id, initial_semester DESC NULLS LAST, num NULLS LAST, semester_code
  )
  SELECT COUNT(*) INTO v_unresolved
  FROM learners_profiles lp
  JOIN semesters f ON f.id = lp.semester_id AND f.semester_order = 0
  LEFT JOIN target t ON t.program_id = lp.program_id
  WHERE t.target_id IS NULL;

  IF v_unresolved > 0 THEN
    RAISE EXCEPTION 'Aborting: % learner(s) on a Freshers semester have no real semester in their program', v_unresolved;
  END IF;
END $$;

-- Step A: the 5 target semesters that have no section at all get an 'A'.
-- BPHARM is deliberately excluded: it already has Batch A-F and its learners
-- map to 'Batch A' below rather than gaining a redundant plain 'A'.
WITH cand AS (
  SELECT s.id, s.program_id, s.institution_id, s.degree_id, s.department_id,
         s.semester_code, s.initial_semester,
         NULLIF(regexp_replace(s.semester_code,'^.*?(\d+)$','\1'), s.semester_code)::int AS num
  FROM semesters s WHERE s.semester_order <> 0
), target AS (
  SELECT DISTINCT ON (program_id) *
  FROM cand ORDER BY program_id, initial_semester DESC NULLS LAST, num NULLS LAST, semester_code
), needed AS (
  SELECT t.* FROM target t
  WHERE t.program_id IN (
          SELECT lp.program_id FROM learners_profiles lp
          JOIN semesters f ON f.id = lp.semester_id AND f.semester_order = 0)
    AND NOT EXISTS (SELECT 1 FROM sections se WHERE se.semester_id = t.id)
)
INSERT INTO sections (institution_id, degree_id, department_id, program_id,
                      semester_id, section_name, is_active)
SELECT n.institution_id, n.degree_id, n.department_id, n.program_id, n.id, 'A', true
FROM needed n
ON CONFLICT ON CONSTRAINT sections_unique_per_semester DO NOTHING;

-- Step B: move the learners. Section preference: exact 'A', else 'Batch A', else NULL
-- (NULL beats leaving a section that belongs to a different semester).
WITH cand AS (
  SELECT s.id, s.program_id, s.semester_code, s.initial_semester,
         NULLIF(regexp_replace(s.semester_code,'^.*?(\d+)$','\1'), s.semester_code)::int AS num
  FROM semesters s WHERE s.semester_order <> 0
), target AS (
  SELECT DISTINCT ON (program_id) program_id, id AS target_id
  FROM cand ORDER BY program_id, initial_semester DESC NULLS LAST, num NULLS LAST, semester_code
), resolved AS (
  SELECT t.program_id, t.target_id,
         (SELECT se.id FROM sections se
           WHERE se.semester_id = t.target_id
             AND upper(btrim(se.section_name)) IN ('A','BATCH A')
           ORDER BY (upper(btrim(se.section_name)) = 'A') DESC, se.section_name
           LIMIT 1) AS target_section_id
  FROM target t
)
UPDATE learners_profiles lp
SET semester_id = r.target_id,
    section_id  = r.target_section_id,
    updated_at  = now()
FROM resolved r
WHERE r.program_id = lp.program_id
  AND lp.semester_id IN (SELECT id FROM semesters WHERE semester_order = 0);

-- Step C: learners already moved to a real semester by hand but still holding a
-- stale Freshers section. A semester-scoped WHERE misses these entirely.
UPDATE learners_profiles lp
SET section_id = (SELECT se.id FROM sections se
                   WHERE se.semester_id = lp.semester_id
                     AND upper(btrim(se.section_name)) IN ('A','BATCH A')
                   ORDER BY (upper(btrim(se.section_name)) = 'A') DESC, se.section_name
                   LIMIT 1),
    updated_at = now()
WHERE lp.semester_id IS NOT NULL
  AND lp.semester_id NOT IN (SELECT id FROM semesters WHERE semester_order = 0)
  AND lp.section_id IN (SELECT se.id FROM sections se
                        JOIN semesters s ON s.id = se.semester_id AND s.semester_order = 0);
