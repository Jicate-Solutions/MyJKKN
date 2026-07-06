-- 2026-07-01 — Merge duplicate staff "Prithiviraj A" (JKKN College of Pharmacy).
--
-- Symptom: faculty reported "Attendance not showing" on 2026-07-01 (Wednesday) — My Classes
--          logged "No periods found for faculty" with timetablesCount: 15, i.e. timetables were
--          found for the institution but none matched this teacher's assigned periods.
--
-- Root cause: two staff rows exist for the same person (created 3 weeks apart):
--   Ghost  b6224c99-da0c-452a-831e-a22c55befb87  institution_email = NULL (personal gmail only),
--                                                 created 2026-06-09, yet holds the timetable slot
--                                                 and staff_plan_courses row.
--   Canon  6baba91c-0e88-4c35-9094-92613366443f  institution_email = prithiviraj_a@jkkn.ac.in,
--                                                 created 2026-06-30, the row the faculty logs in as.
--   The My-Classes view resolves the teacher by institution_email
--   (FacultyAttendanceService.getStaffIdByEmail) -> canonical id, but the timetable slot referenced
--   the ghost id, so getFacultyTodayPeriods' staff matcher never fired. Same pattern as
--   20260630120000_merge_duplicate_staff_prabhakaran_m.sql; the 2026-06-30 picker guard
--   (use-staff-planning-data.ts) prevents NEW assignments from picking a ghost, but this slot
--   predates the canonical row's creation and the guard does not retroactively fix existing data.
--
-- Fix: merge the ghost into the canonical row, then retire the ghost.

-- 1) Timetable JSONB: replace every occurrence of the ghost UUID with the canonical UUID across
--    the 1 timetable that contains it. A whole-blob REPLACE covers every nested shape
--    (primary_staff_id, staff_ids[], sub_slots[].staff_ids[], practical_config); the UUID is
--    globally unique so it can never be a substring of another id, and the canonical id appeared
--    in 0 timetables beforehand, so there is no collision.
UPDATE timetables
SET timetable_data = REPLACE(
      timetable_data::text,
      'b6224c99-da0c-452a-831e-a22c55befb87',
      '6baba91c-0e88-4c35-9094-92613366443f'
    )::jsonb,
    updated_at = now()
WHERE timetable_data::text LIKE '%b6224c99-da0c-452a-831e-a22c55befb87%';

-- 2) staff_plan_courses: reassign the ghost's row to canonical. Unique key is
--    (staff_id, course_id, staff_plan_id); the canonical row has no existing entry for this
--    (course_id, staff_plan_id) pair, so no unique-constraint collision.
UPDATE staff_plan_courses
SET staff_id = '6baba91c-0e88-4c35-9094-92613366443f'
WHERE staff_id = 'b6224c99-da0c-452a-831e-a22c55befb87';

-- 3) Retire the ghost so it stops appearing in pickers and can never again be assigned or
--    compete in the institution_email .single() lookup.
UPDATE staff
SET is_active = false, updated_at = now()
WHERE id = 'b6224c99-da0c-452a-831e-a22c55befb87';
