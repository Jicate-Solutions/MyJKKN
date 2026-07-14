-- Allow hostel attendance markers (e.g. chief_warden) to UPDATE an existing
-- hostel_attendance row via upsert.
--
-- WHY: hostel_attendance has UNIQUE(learner_id, date). markAttendance /
-- bulkMarkAttendance (HostelAttendanceService) both upsert on that key
-- (onConflict: 'learner_id,date'), which Postgres runs as
-- INSERT ... ON CONFLICT (learner_id, date) DO UPDATE. The FIRST mark for a
-- learner+date is an INSERT, gated by hostel_attendance_insert_permission
-- (campus_living.attendance.mark). Any SUBSEQUENT mark for the SAME
-- learner+date (e.g. setting evening_status after morning_status was
-- already recorded, or simply re-submitting the roll-call) hits the
-- conflict branch, which Postgres evaluates against the UPDATE policy
-- instead: hostel_attendance_update_permission requires
-- campus_living.attendance.edit -- a DIFFERENT key. chief_warden has
-- .mark=true but .edit=false, so re-marking an already-marked resident
-- fails with 42501 ("new row violates row-level security policy for table
-- hostel_attendance"). Unlike a plain UPDATE (which would just silently
-- affect 0 rows), INSERT ... ON CONFLICT DO UPDATE raises 42501 when the
-- conflicting row fails the UPDATE policy, because Postgres has already
-- located that exact row via the unique index. Reproduced directly via
-- impersonated SQL (INSERT ... ON CONFLICT DO UPDATE as chief_warden) and
-- confirmed root cause before this fix.
--
-- FIX: additive UPDATE policy mirroring the INSERT grant (same permission
-- key + same institution/block scoping as hostel_attendance_insert_permission).
-- Permissive policies OR together, so this only adds access -- it cannot
-- reduce what hostel_attendance_update_permission already allows editors.
-- Same pattern as student_attendance_update_marker
-- (20260630210400_attendance_update_allow_marker.sql) — see
-- project memory project_attendance_consolidated_row_update_rls_blocks_mark_roles.

DROP POLICY IF EXISTS hostel_attendance_update_marker ON public.hostel_attendance;

CREATE POLICY hostel_attendance_update_marker ON public.hostel_attendance
    FOR UPDATE TO authenticated
    USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.attendance.mark')
            AND role_has_institution_access(institution_id)
            AND role_has_block_access(block_id)
        )
    )
    WITH CHECK (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.attendance.mark')
            AND role_has_institution_access(institution_id)
            AND role_has_block_access(block_id)
        )
    );
