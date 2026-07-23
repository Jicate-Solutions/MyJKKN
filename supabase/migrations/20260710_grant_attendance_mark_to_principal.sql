-- Grant academic.attendance.mark to the Principal role.
--
-- Principals can be added to staff planning and assigned to timetable periods,
-- and the attendance UI shows their classes (academic.attendance.view = true),
-- but saving failed: every student_attendance INSERT/UPDATE RLS path — and the
-- app-layer checkFacultyAttendancePermission() — requires the
-- academic.attendance.mark key, which the Principal role's permissions JSONB
-- had set to false. The faculty-only RLS branch (staff.role_key = 'faculty')
-- and the principal department-match branch don't cover a principal marking a
-- period outside their own profile department, so the write was denied.
--
-- Marking is still scoped per period: AttendanceCoreService.validateStaffAssignment
-- only authorizes non-admin markers for periods they are actually assigned to
-- in the timetable, and RLS keeps the institution scope.
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object('academic.attendance.mark', true),
    updated_at = now()
WHERE role_key = 'principal';
