-- Allow attendance markers to UPDATE the consolidated student_attendance row.
--
-- WHY: student_attendance stores ALL periods of a (institution_id, timetable_id,
-- section_id, attendance_date) in ONE row's attendance_data JSONB. Only the FIRST
-- period marked for a section-day is an INSERT; every subsequent period is an UPDATE
-- that merges into that existing row (attendance-core-service.ts upsertConsolidatedAttendance).
--
-- The existing INSERT policy (student_attendance_insert_admin) grants writes to any
-- holder of 'academic.attendance.mark', but NO UPDATE policy mirrored that grant:
-- UPDATE required 'academic.attendance.edit' (student_attendance_update_admin) or a
-- specific profiles.role / matching custom_roles row (update_by_role / "Comprehensive
-- attendance access by role"). A marker on a custom role such as 'staff_counselor'
-- therefore passed INSERT but got a SILENT 0-row UPDATE on the 2nd+ period of a
-- section-day, surfaced to the user as "Failed to save attendance" / logged as
-- "Save result was null/undefined". This was independent of the entry tab (My Classes
-- vs Search) -- it depended only on whether a row already existed for that section-day.
--
-- FIX: additive, permission-keyed UPDATE policy that mirrors student_attendance_insert_admin,
-- so anyone allowed to MARK attendance in their institution can also UPDATE the day's
-- consolidated row. Permissive/additive -- it cannot reduce any existing access. Keyed on
-- user_has_permission('academic.attendance.mark') (the robust resolver), NOT an inline
-- custom_roles role_name join, because the latter is precisely what fails for custom roles
-- whose role_name does not lower-case-match profiles.role.

DROP POLICY IF EXISTS student_attendance_update_marker ON public.student_attendance;

CREATE POLICY student_attendance_update_marker ON public.student_attendance
    FOR UPDATE TO authenticated
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academic.attendance.mark')
    )
    WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM profiles
            WHERE id = auth.uid() AND institution_id IS NOT NULL
        )
        AND user_has_permission('academic.attendance.mark')
    );
