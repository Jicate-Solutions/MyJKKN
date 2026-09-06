-- 2026-06-01: Make a student's OWN learner profile view-only at the DB layer.
--
-- Context: Two RLS UPDATE policies silently let a student directly UPDATE their
-- own learners_profiles row with NO permission check, bypassing the intended
-- admin-approved change-request workflow (profile_change_requests +
-- LearnerProfileChangeService.approveChangeRequest, which writes via the
-- service-role client and is therefore unaffected by RLS).
--
-- This migration removes that direct-edit path while preserving:
--   * Student VIEW access  -> SELECT policies (students_view_own_learner_profile
--     + the email-match clause on learners_profiles_select_policy) are untouched.
--   * Admin/staff editing   -> the permission-gated UPDATE clause is kept.
--   * The change-request flow-> approval writes use service-role (bypasses RLS).
--
-- Verified (2026-06-01): no student-session code path performs a direct
-- .update() on learners_profiles. Every writer is either service-role
-- (approve, QR self-fill) or admin/staff browser-client passing the permission
-- clause (enquiry edit form, bulk edit, bulk photo upload, campus-living warden
-- actions). See learner-profile-change-service.ts / student-form-service.ts.
--
-- Note: the orphaned catalog key `learners.my-profile.edit` is already stored as
-- `false` on the student role and is referenced nowhere in app code, so no
-- custom_roles JSONB change is needed (and none is made here).

-- 1. Drop the dedicated student self-update policy entirely.
DROP POLICY IF EXISTS students_update_own_learner_profile ON public.learners_profiles;

-- 2. Strip the two email-match identity clauses from the admin UPDATE policy,
--    keeping only super-admin / admin / (institution scope + learners.* edit
--    permission). ALTER POLICY rewrites only USING; WITH CHECK (null) and the
--    role/permissive attributes are left as-is.
ALTER POLICY learners_profiles_update_policy ON public.learners_profiles
    USING (
        is_super_admin() OR is_admin()
        OR (
            role_has_institution_access(institution_id)
            AND (
                user_has_permission('learners.admissions.edit')
                OR user_has_permission('learners.profiles.edit')
                OR user_has_permission('learners.edit')
            )
        )
    );
