-- Expose learner profile photos to the Hostel Mark Attendance roster.
--
-- WHY: the Mark page rendered profiles.avatar_url, which is NULL for ~all
-- students (only 406/7024 profiles have it). Real student photos live in
-- learners_profiles.student_photo_url (a PUBLIC storage-bucket URL, e.g.
-- .../object/public/student-photos/xxx.jpg). But learners_profiles SELECT RLS
-- (learners_profiles_select_policy) gates on institution access + a learners.*.view
-- permission, so a BLOCK-scoped warden — the primary marker — reads 0 rows for
-- their own cross-college residents (a chief_warden has neither institution access
-- to the residents' home colleges nor a learners view permission). A plain client
-- join therefore returns null photos for exactly the users who need them.
--
-- FIX: a narrow SECURITY DEFINER function returning ONLY {profile_id,
-- student_photo_url} for residents the CALLER is entitled to mark. It bypasses the
-- heavy learners_profiles RLS but SELF-AUTHORIZES on the caller's own grants
-- (mirrors the hostel_attendance policy authority model: institution OR block
-- access, plus super_admin/admin bypass), so it exposes no more than the marker is
-- already entitled to see for their residents — and only the photo URL, which is
-- already a public-bucket URL. Restricted to `authenticated`. See
-- feedback_security_definer_rpc_callable_by_authenticated_must_self_authorize.

CREATE OR REPLACE FUNCTION public.get_markable_resident_photos(p_block_id uuid DEFAULT NULL)
RETURNS TABLE(profile_id uuid, student_photo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT lp.profile_id, lp.student_photo_url
  FROM learners_profiles lp
  JOIN hostel_allocations a
    ON a.learner_id = lp.profile_id AND a.status = 'active'
  WHERE lp.student_photo_url IS NOT NULL
    AND lp.student_photo_url <> ''
    AND (p_block_id IS NULL OR a.block_id = p_block_id)
    AND (
      is_super_admin()
      OR is_admin()
      OR (
        (
          user_has_permission('campus_living.attendance.view')
          OR user_has_permission('campus_living.attendance.mark')
        )
        AND (
          role_has_institution_access(lp.institution_id)
          OR role_has_block_access(a.block_id)
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_markable_resident_photos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_markable_resident_photos(uuid) TO authenticated;
