-- Migration to fix mismatched faculty assignments in attendance records
-- Date: 2025-01-09
-- Issue: Faculty assignments in attendance_data don't match timetable slot assignments

-- First, create a backup of current data
CREATE TABLE IF NOT EXISTS student_attendance_backup_20250109 AS 
SELECT * FROM student_attendance;

-- Update mismatched faculty assignments
WITH corrections AS (
  -- Get correct faculty assignments from timetables
  SELECT DISTINCT
    sa.id as attendance_id,
    period_key,
    jsonb_build_object(
      'faculty_name', CONCAT(s.first_name, ' ', s.last_name),
      'faculty_email', s.email
    ) as correct_faculty
  FROM 
    student_attendance sa,
    jsonb_each(sa.attendance_data) AS period(period_key, period_data),
    timetables t,
    jsonb_each(t.timetable_data) AS day(day_key, day_data),
    jsonb_each(day_data) AS slot(slot_key, slot_data),
    staff s
  WHERE 
    sa.section_id = t.section_id
    AND period_key = slot_data->>'slot_id'
    AND s.id::text = slot_data->>'primary_staff_id'
    AND jsonb_typeof(day_data) = 'object'
    AND period_data->'assigned_faculty'->>'faculty_email' != s.email
)
UPDATE student_attendance sa
SET 
  attendance_data = (
    SELECT jsonb_object_agg(
      key,
      CASE 
        WHEN c.period_key = key THEN
          jsonb_set(value, '{assigned_faculty}', c.correct_faculty)
        ELSE
          value
      END
    )
    FROM jsonb_each(sa.attendance_data) AS entries(key, value)
    LEFT JOIN corrections c ON c.attendance_id = sa.id AND c.period_key = key
  ),
  updated_at = NOW()
WHERE id IN (SELECT DISTINCT attendance_id FROM corrections);

-- Verify the update
SELECT 
  'Records Updated' as status,
  COUNT(DISTINCT id) as count
FROM student_attendance
WHERE updated_at >= NOW() - INTERVAL '1 minute';