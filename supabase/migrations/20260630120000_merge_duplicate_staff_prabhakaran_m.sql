-- 2026-06-30 — Merge duplicate staff "PRABHAKARAN M" (JKKN College of Pharmacy).
--
-- Symptom: a Monday period assigned to "PRABHAKARAN M" in the PHARM D II YEAR timetable
--          did not appear in the Attendance → My Classes view for that teacher.
--
-- Root cause: two staff rows existed for the same person (created 8 min apart on 2026-06-09):
--   Ghost  a658b5ef-063b-448a-8385-e3f580180c16  institution_email = NULL, no login profile,
--                                                 yet held ALL of this teacher's timetable slots.
--   Canon  c0963262-f68d-4a59-b187-7aa9fd7ab219  institution_email = prabhakaranm@jkkn.ac.in,
--                                                 the row the faculty actually logs in as.
--   The My-Classes view resolves the teacher by institution_email
--   (FacultyAttendanceService.getStaffIdByEmail) -> canonical id, but every slot referenced the
--   ghost id, so getFacultyTodayPeriods' staff matcher (primary_staff_id / staff_ids) never fired.
--
-- Fix: merge the ghost into the canonical row, then retire the ghost.

-- 1) Timetable JSONB: replace every occurrence of the ghost UUID with the canonical UUID across
--    all 4 timetables that contain it (3 active + 1 inactive). A whole-blob REPLACE covers every
--    nested shape (primary_staff_id, staff_ids[], sub_slots[].staff_ids[], practical_config); the
--    UUID is globally unique so it can never be a substring of another id, and the canonical id
--    appeared in 0 timetables beforehand, so there is no collision.
UPDATE timetables
SET timetable_data = REPLACE(
      timetable_data::text,
      'a658b5ef-063b-448a-8385-e3f580180c16',
      'c0963262-f68d-4a59-b187-7aa9fd7ab219'
    )::jsonb,
    updated_at = now()
WHERE timetable_data::text LIKE '%a658b5ef-063b-448a-8385-e3f580180c16%';

-- 2) staff_plan_courses: reassign the ghost's 2 rows to canonical. Unique key is
--    (staff_id, course_id, staff_plan_id); the ghost's courses/plans are distinct from the
--    canonical's one existing row, so no unique-constraint collision.
UPDATE staff_plan_courses
SET staff_id = 'c0963262-f68d-4a59-b187-7aa9fd7ab219'
WHERE staff_id::text = 'a658b5ef-063b-448a-8385-e3f580180c16';

-- 3) Retire the ghost so it stops appearing in pickers and can never again be assigned or
--    compete in the institution_email .single() lookup.
UPDATE staff
SET is_active = false, updated_at = now()
WHERE id = 'a658b5ef-063b-448a-8385-e3f580180c16';
