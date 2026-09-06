-- ============================================================================
-- Seed the default "Freshers" semester + section "A" for every active program
-- ============================================================================
-- Every program should expose at least one semester and one section so the
-- modules hanging off them (attendance, timetable, hostel allocation, learner
-- mapping) always have a valid target. Before this migration there was no such
-- guarantee: 5 active programs carried no semester at all.
--
-- The seeded row is ORG STRUCTURE, not an academic term:
--
--   semester_order   = 0      Sorts ahead of Semester I..VIII. No pre-existing
--                             row uses 0, so it doubles as an unambiguous
--                             sentinel for "this is the Freshers row".
--
--   initial_semester = false  Deliberately NOT claimed. Both admission
--                             course-selection flows auto-pick the FIRST YEAR
--                             semester via `find(initial_semester) ?? sorted[0]`
--                             and probe `sorted[0].semester_name` with /year/i to
--                             classify a program as year-based vs semester-based.
--                             Claiming the flag -- or letting this row reach
--                             sorted[0] -- would silently re-route first-year
--                             admits and mis-target lateral entry. The frontend
--                             filters this row out of auto-pick; see
--                             lib/constants/semesters.ts.
--
--   semester_type    = 'odd'  semesters_semester_type_check permits only
--                             'even' | 'odd', and every existing first semester
--                             is 'odd'.
--
--   semester_code             upper(left(program_id, 14)) || '-FRESH'.
--                             semester_code is varchar(20) and the longest
--                             program_id is 15 chars, so the left() is load
--                             bearing -- without it one program overflows.
--                             Uppercased to match SemesterService.createSemester.
--
--   semester_group   = NULL   Left unset so "Freshers" does not pollute the
--                             existing 'Year 1' / 'Year 2' groupings.
--
-- Scope: active programs whose institution/degree/department are all present.
-- semesters declares those three columns NOT NULL, so a program with a broken
-- hierarchy CANNOT receive a semester. Such programs are skipped by the WHERE
-- clause rather than failing the migration. At time of writing that is 3
-- programs: M.A. ENGLISH (Aided), M.Sc. MATHEMATICS (Aided), and
-- B.Ed (Historical Aggregate) -- all missing degree_id and department_id.
--
-- Both statements are idempotent via ON CONFLICT DO NOTHING against the
-- existing unique constraints, so re-running this migration is a no-op.
-- ============================================================================

-- 1. The Freshers semester, one per eligible program.
INSERT INTO semesters (
  institution_id,
  degree_id,
  department_id,
  program_id,
  semester_code,
  semester_name,
  semester_type,
  semester_order,
  initial_semester,
  terminal_semester,
  is_active
)
SELECT
  p.institution_id,
  p.degree_id,
  p.department_id,
  p.id,
  upper(left(btrim(p.program_id), 14)) || '-FRESH',
  'Freshers',
  'odd',
  0,
  false,
  false,
  true
FROM programs p
WHERE p.is_active
  AND p.institution_id IS NOT NULL
  AND p.degree_id     IS NOT NULL
  AND p.department_id IS NOT NULL
ON CONFLICT ON CONSTRAINT unique_semester_hierarchy DO NOTHING;

-- 2. Section "A" under each Freshers semester. Driven off the semesters table
--    rather than programs so it also picks up rows the trigger created later.
--    "A" is the house convention -- 340 of the 501 pre-existing sections use it.
INSERT INTO sections (
  institution_id,
  degree_id,
  department_id,
  program_id,
  semester_id,
  section_name,
  is_active
)
SELECT
  s.institution_id,
  s.degree_id,
  s.department_id,
  s.program_id,
  s.id,
  'A',
  true
FROM semesters s
WHERE s.semester_name  = 'Freshers'
  AND s.semester_order = 0
ON CONFLICT ON CONSTRAINT sections_unique_per_semester DO NOTHING;
