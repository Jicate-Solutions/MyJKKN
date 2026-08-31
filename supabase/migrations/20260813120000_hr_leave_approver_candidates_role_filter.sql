-- Role filter for the leave approval flow's "one named person" picker.
--
-- WHY THE PREDICATE LIVES HERE AND NOT IN REACT. This function ends in LIMIT 50,
-- so a client-side role filter would filter an already-truncated page: in an
-- organization with more than 50 active staff, a role whose members all sort
-- past the cap renders as "nobody matches that role" while those people plainly
-- exist. The predicate has to run before the LIMIT.
--
-- p_role_key matches custom_roles.role_key -- the same key a step stores in
-- 'role' mode -- so "anyone who could satisfy this step as a role" and "the one
-- person I pin instead" are drawn from the same population, and an admin can
-- narrow to e.g. hod before pinning a specific HOD.
--
-- Filtering is by role membership only; can_approve stays reported rather than
-- filtered on, for the reason the original function documents.
--
-- DROP first: adding a parameter does not replace the function, it creates a
-- second overload, and PostgREST refuses a two-argument call it cannot resolve
-- between (uuid,text) and (uuid,text,text) -- PGRST203. Dropping also discards
-- the EXECUTE grants and reverts the function to PUBLIC, so the lockdown is
-- re-issued below against anon AND PUBLIC (revoking anon alone leaves the
-- PUBLIC grant it inherits from).

DROP FUNCTION IF EXISTS public.hr_leave_approver_candidates(uuid, text);

CREATE FUNCTION public.hr_leave_approver_candidates(
  p_hr_organization_id uuid,
  p_search text DEFAULT NULL,
  p_role_key text DEFAULT NULL
)
RETURNS TABLE (
  profile_id  uuid,
  full_name   text,
  email       text,
  role_names  text,
  can_approve boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
BEGIN
  IF NOT public.is_super_admin()
     AND NOT public.user_has_permission('hr.leave.types.manage') THEN
    RAISE EXCEPTION 'Not authorized to list approver candidates';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), '')::text,
    p.email::text,
    (SELECT string_agg(cr.role_name, ', ' ORDER BY cr.role_name)
       FROM public.user_roles ur
       JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p.id)::text,
    COALESCE(p.is_super_admin, false) OR EXISTS (
      SELECT 1
        FROM public.user_roles ur2
        JOIN public.custom_roles cr2 ON cr2.id = ur2.role_id
       WHERE ur2.user_id = p.id
         AND cr2.is_active
         AND cr2.permissions ->> 'hr.leave.approve' = 'true'
    )
  FROM public.staff s
  JOIN public.hr_organizations o ON o.institution_id = s.institution_id
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE o.id = p_hr_organization_id
    AND COALESCE(s.is_active, true)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR concat_ws(' ', s.first_name, s.last_name) ILIKE '%' || btrim(p_search) || '%'
      OR p.email ILIKE '%' || btrim(p_search) || '%'
    )
    AND (
      p_role_key IS NULL OR btrim(p_role_key) = ''
      OR EXISTS (
        SELECT 1
          FROM public.user_roles ur3
          JOIN public.custom_roles cr3 ON cr3.id = ur3.role_id
         WHERE ur3.user_id = p.id
           AND cr3.is_active
           AND cr3.role_key = btrim(p_role_key)
      )
    )
  ORDER BY 5 DESC, 2 NULLS LAST
  LIMIT 50;
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_approver_candidates(uuid, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_leave_approver_candidates(uuid, text, text) TO authenticated;
