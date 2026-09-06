-- ================================================================================
-- MIGRATION: Align student_attendance WRITE RLS with the application's auth model
-- Date: 2026-06-19
-- ================================================================================
-- PROBLEM
--   Saving attendance failed with PGRST116 ("JSON object requested, multiple (or no)
--   rows returned") for users such as indhumathi.madhu@jkkn.ac.in, and HODs could
--   not mark/edit attendance for their own department's classes.
--
--   Root cause is a role-drift between two authorization layers:
--     * The APP authorizes a marker via AttendanceCoreService.validateStaffAssignment:
--         - super_admin / admin
--         - HOD whose profiles.department_id = timetable.department_id (their class)
--         - faculty/staff assigned in the timetable (staff.role_key, joined by email)
--     * The DB WRITE policy ("Comprehensive attendance access by role") trusted ONLY
--       `profiles.role IN ('super_admin','admin','faculty')`.
--
--   Two concrete gaps:
--     1. A teaching faculty whose profiles.role differs (e.g. 'staff_counselor' who is
--        faculty in the staff table) is app-authorized but DB-blocked.
--     2. An HOD (profiles.role = 'hod') is not in the role list at all, so they cannot
--        write attendance for their own department's classes.
--   In both cases the SELECT policy (institution match) lets them READ the row, but the
--   UPDATE/INSERT affects 0 rows on write, which PostgREST surfaces as PGRST116.
--
-- FIX
--   Rewrite the WRITE policy with permissive paths that mirror the app:
--     Path 1: profiles.role in (super_admin, admin, faculty) or is_super_admin
--     Path 2: user is FACULTY in the `staff` table for THIS institution
--             (join staff.institution_email = profiles.email — canonical mapping).
--             Covers dual-role teaching staff whose profiles.role differs
--             (e.g. staff_counselor / hod who are faculty in the staff table and
--             teach assigned classes).
--     Path 3: HOD scoped to their OWN department — profiles.role = 'hod' AND the row's
--             department_id matches profiles.department_id (their assigned classes are
--             in their department, plus full department attendance entry).
--     Path 4: Principal scoped to their OWN department — profiles.role = 'principal'
--             AND the row's department_id matches profiles.department_id (same model
--             as HOD, per product decision 2026-06-19).
--   Department/institution scoping makes this strictly TIGHTER per-row than the old
--   faculty rule (which had no scope). Fine-grained per-period gating remains in the
--   application layer.
-- ================================================================================

DROP POLICY IF EXISTS "Comprehensive attendance access by role" ON public.student_attendance;

CREATE POLICY "Comprehensive attendance access by role" ON public.student_attendance
FOR ALL
USING (
    -- Path 1: role recorded directly on the profile
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
        AND (p.role IN ('super_admin', 'admin', 'faculty') OR p.is_super_admin = true)
    )
    OR
    -- Path 2: dual-role teaching staff — faculty in the staff table for THIS institution
    EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.staff s ON s.institution_email = p.email
        WHERE p.id = (SELECT auth.uid())
        AND s.institution_id = student_attendance.institution_id
        AND s.role_key = 'faculty'
    )
    OR
    -- Path 3: HOD can mark/edit attendance for their OWN department's classes
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
        AND p.role = 'hod'
        AND p.department_id = student_attendance.department_id
    )
    OR
    -- Path 4: Principal can mark/edit attendance for their OWN department's classes
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
        AND p.role = 'principal'
        AND p.department_id = student_attendance.department_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
        AND (p.role IN ('super_admin', 'admin', 'faculty') OR p.is_super_admin = true)
    )
    OR
    EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.staff s ON s.institution_email = p.email
        WHERE p.id = (SELECT auth.uid())
        AND s.institution_id = student_attendance.institution_id
        AND s.role_key = 'faculty'
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
        AND p.role = 'hod'
        AND p.department_id = student_attendance.department_id
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
        AND p.role = 'principal'
        AND p.department_id = student_attendance.department_id
    )
);

COMMENT ON POLICY "Comprehensive attendance access by role" ON public.student_attendance IS
'Write/read access for attendance. Grants access to (1) super_admin/admin/faculty by profiles.role,
(2) faculty in the staff table for the same institution (staff.institution_email = profiles.email) -
covers dual-role teaching staff whose profiles.role differs, (3) HODs for their own department
(profiles.role=hod AND department_id match), and (4) principals for their own department
(profiles.role=principal AND department_id match). Added 2026-06-19 to fix role-drift where dual-role
staff, HODs and principals were app-authorized but DB-blocked, causing PGRST116 on attendance save.';
