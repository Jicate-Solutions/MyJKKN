BEGIN;

-- Update timetables with a matching 'Section A'
UPDATE timetables t
SET section = s.section_name
FROM sections s
JOIN semesters sem ON s.semester_id = sem.id
WHERE
  t.section IS NULL
  AND s.section_name = 'A'
  AND t.institution_id = s.institution_id
  AND t.program_id = s.program_id
  AND t.semester = sem.semester_name;

COMMIT;
