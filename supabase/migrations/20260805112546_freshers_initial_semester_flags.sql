-- Phase 2 of the Freshers-semester removal (2026-08-05).
--
-- Once the Freshers holding pen is gone, the admission forms' FIRST YEAR
-- auto-pick falls back to `find(initial_semester) ?? sorted[0]`. 28 active
-- programs set initial_semester on NO semester AND have every semester tied at
-- the same semester_order, so sorted[0] would resolve arbitrarily -- BDS could
-- default to BDS-CRRI (the final-year internship) for every future admission.
--
-- Flag the true first term on each, using the same rule as Phase 1: lowest
-- trailing number in semester_code. Note this is "the program's first term",
-- not literally semester 1 -- B.PHARM LE correctly lands on BPHARM-SEM-3 and
-- PHARM D PB on PHARMD-YEAR-4, because those programs begin there.
WITH real_sems AS (
  SELECT s.id, s.program_id, s.semester_code, s.semester_order, s.initial_semester,
         NULLIF(regexp_replace(s.semester_code,'^.*?(\d+)$','\1'), s.semester_code)::int AS num
  FROM semesters s
  JOIN programs p ON p.id = s.program_id
  WHERE s.semester_order <> 0 AND p.is_active
), prog AS (
  SELECT r.program_id,
         COALESCE(bool_or(r.initial_semester), false) AS has_init,
         (COUNT(*) FILTER (
            WHERE r.semester_order = (SELECT MIN(r2.semester_order) FROM real_sems r2
                                       WHERE r2.program_id = r.program_id)) > 1) AS tied_order
  FROM real_sems r GROUP BY r.program_id
), ambiguous AS (
  SELECT program_id FROM prog WHERE NOT has_init AND tied_order
), pick AS (
  SELECT DISTINCT ON (r.program_id) r.id
  FROM real_sems r
  JOIN ambiguous a ON a.program_id = r.program_id
  ORDER BY r.program_id, r.num NULLS LAST, r.semester_code
)
UPDATE semesters s
SET initial_semester = true, updated_at = now()
FROM pick
WHERE s.id = pick.id;
