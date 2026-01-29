-- Script to Fix Student-Section Data Integrity Issues
-- Created: 2026-01-29
-- Purpose: Ensure all students' degree_id, department_id, program_id, semester_id match their section

-- Step 1: Check current mismatches
SELECT
  'Before Fix - Mismatches Found' as status,
  COUNT(*) as total_mismatches
FROM learners_profiles lp
JOIN sections s ON lp.section_id = s.id
WHERE lp.degree_id != s.degree_id
   OR lp.department_id != s.department_id
   OR lp.program_id != s.program_id
   OR lp.semester_id != s.semester_id;

-- Step 2: Show detailed breakdown
SELECT
  'Degree Mismatches' as type,
  COUNT(*) as count
FROM learners_profiles lp
JOIN sections s ON lp.section_id = s.id
WHERE lp.degree_id != s.degree_id

UNION ALL

SELECT
  'Department Mismatches' as type,
  COUNT(*) as count
FROM learners_profiles lp
JOIN sections s ON lp.section_id = s.id
WHERE lp.department_id != s.department_id

UNION ALL

SELECT
  'Program Mismatches' as type,
  COUNT(*) as count
FROM learners_profiles lp
JOIN sections s ON lp.section_id = s.id
WHERE lp.program_id != s.program_id

UNION ALL

SELECT
  'Semester Mismatches' as type,
  COUNT(*) as count
FROM learners_profiles lp
JOIN sections s ON lp.section_id = s.id
WHERE lp.semester_id != s.semester_id;

-- Step 3: Show sample mismatches (first 10)
SELECT
  lp.id,
  lp.first_name || ' ' || lp.last_name as student_name,
  lp.roll_number,
  s.section_name,
  CASE WHEN lp.degree_id != s.degree_id THEN '❌' ELSE '✅' END as degree_match,
  CASE WHEN lp.department_id != s.department_id THEN '❌' ELSE '✅' END as dept_match,
  CASE WHEN lp.program_id != s.program_id THEN '❌' ELSE '✅' END as program_match,
  CASE WHEN lp.semester_id != s.semester_id THEN '❌' ELSE '✅' END as semester_match
FROM learners_profiles lp
JOIN sections s ON lp.section_id = s.id
WHERE lp.degree_id != s.degree_id
   OR lp.department_id != s.department_id
   OR lp.program_id != s.program_id
   OR lp.semester_id != s.semester_id
LIMIT 10;

-- Step 4: FIX ALL MISMATCHES
-- IMPORTANT: Review the above results before running this update!
-- Uncomment the following UPDATE statement to fix all mismatches:

/*
UPDATE learners_profiles lp
SET
  degree_id = s.degree_id,
  department_id = s.department_id,
  program_id = s.program_id,
  semester_id = s.semester_id,
  updated_at = NOW()
FROM sections s
WHERE lp.section_id = s.id
  AND (
    lp.degree_id != s.degree_id
    OR lp.department_id != s.department_id
    OR lp.program_id != s.program_id
    OR lp.semester_id != s.semester_id
  );
*/

-- Step 5: Verify fix (run after uncommenting and executing the UPDATE)
SELECT
  'After Fix - Remaining Mismatches' as status,
  COUNT(*) as total_mismatches
FROM learners_profiles lp
JOIN sections s ON lp.section_id = s.id
WHERE lp.degree_id != s.degree_id
   OR lp.department_id != s.department_id
   OR lp.program_id != s.program_id
   OR lp.semester_id != s.semester_id;

-- Expected result: 0 mismatches
