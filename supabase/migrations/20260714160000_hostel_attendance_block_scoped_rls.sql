-- Fix hostel_attendance RLS so BLOCK-scoped wardens can mark/read attendance for
-- residents whose HOME COLLEGE differs from the warden's (multi-college hostel).
--
-- ROOT CAUSE (confirmed by impersonated SQL, not inference):
-- The generated policies gate every operation on
--   role_has_institution_access(institution_id) AND role_has_block_access(block_id)
-- where the row's institution_id is the RESIDENT's own college (stamped by the
-- Mark page from resident.profile.institution_id) and block_id is the physical
-- block. In the hostel-rooms-v2 model ONE block houses residents from several
-- affiliated colleges, so a block-scoped warden (e.g. chief_warden, granted the
-- block via user_block_access) has block access to their block but NO institution
-- access to the residents' home colleges. The AND therefore fails on the
-- institution dimension for every resident they can actually mark, surfacing as
--   42501: new row violates row-level security policy for table "hostel_attendance"
-- on bulkMarkAttendance. Verified: for chief_warden SUNITHA J,
--   user_has_permission('campus_living.attendance.mark') = true,
--   role_has_block_access(<her block>)                    = true,
--   role_has_institution_access(<each resident college>)  = false.
-- Every resident in her block belongs to a college she has no institution access to.
--
-- FIX: the two scope helpers encode two DIFFERENT authority models —
--   role_has_institution_access = "I manage this college's data" (institution-scoped staff)
--   role_has_block_access        = "I manage this physical block"  (block-scoped wardens)
-- The correct rule is OR, not AND: you may act on an attendance row if you have
-- authority over its college OR over its block. This preserves institution-scoped
-- hostel staff (institution path) AND enables block-scoped wardens (block path),
-- while super_admin/admin keep their unconditional bypass. block_id is NOT NULL on
-- hostel_attendance, and the app stamps it from the resident's own allocation, so
-- role_has_block_access still precisely scopes a warden to THEIR blocks — a warden
-- cannot forge a row for a block they were not granted.
--
-- Scope: INSERT (marking), both UPDATE policies (edit + the mark-keyed upsert-conflict
-- path — see 20260630210400 for why upsert's ON CONFLICT DO UPDATE needs a mark-keyed
-- UPDATE grant), and SELECT (so wardens can read back the attendance they marked and
-- see history/dashboard for their block's residents). DELETE is left unchanged: its key
-- campus_living.attendance.delete is not in the permission catalog / granted to no role,
-- so it is admin/super-admin-only already and unaffected by cross-college residents.
--
-- NOTE (latent, NOT fixed here — out of scope): sibling warden-written tables
-- (hostel_allocations, hostel_leave_requests, and any campus_living table gated by the
-- same persona-design generator) carry the identical AND(institution, block) conjunction
-- and will exhibit the same failure once a cross-college warden exercises them. Audit and
-- retrofit them the same way when those flows surface.

-- ── INSERT: allow marking by institution OR block authority ──────────────
DROP POLICY IF EXISTS hostel_attendance_insert_permission ON public.hostel_attendance;
CREATE POLICY hostel_attendance_insert_permission ON public.hostel_attendance
    FOR INSERT TO public
    WITH CHECK (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.attendance.mark')
            AND (
                role_has_institution_access(institution_id)
                OR role_has_block_access(block_id)
            )
        )
    );

-- ── UPDATE (edit key): editors, by institution OR block authority ────────
DROP POLICY IF EXISTS hostel_attendance_update_permission ON public.hostel_attendance;
CREATE POLICY hostel_attendance_update_permission ON public.hostel_attendance
    FOR UPDATE TO public
    USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.attendance.edit')
            AND (
                role_has_institution_access(institution_id)
                OR role_has_block_access(block_id)
            )
        )
    )
    WITH CHECK (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.attendance.edit')
            AND (
                role_has_institution_access(institution_id)
                OR role_has_block_access(block_id)
            )
        )
    );

-- ── UPDATE (mark key): the upsert-on-conflict path for markers ───────────
-- Supersedes 20260714153000's version, which mirrored the broken AND scoping.
DROP POLICY IF EXISTS hostel_attendance_update_marker ON public.hostel_attendance;
CREATE POLICY hostel_attendance_update_marker ON public.hostel_attendance
    FOR UPDATE TO authenticated
    USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.attendance.mark')
            AND (
                role_has_institution_access(institution_id)
                OR role_has_block_access(block_id)
            )
        )
    )
    WITH CHECK (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.attendance.mark')
            AND (
                role_has_institution_access(institution_id)
                OR role_has_block_access(block_id)
            )
        )
    );

-- ── SELECT: read back by institution OR block authority ──────────────────
DROP POLICY IF EXISTS hostel_attendance_select_permission ON public.hostel_attendance;
CREATE POLICY hostel_attendance_select_permission ON public.hostel_attendance
    FOR SELECT TO public
    USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.attendance.view')
            AND (
                role_has_institution_access(institution_id)
                OR role_has_block_access(block_id)
            )
        )
    );
