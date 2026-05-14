-- Fix: Approver dropdown returned empty for non-super-admin users.
--
-- Root cause: ApproverSelector calls ProfileService.getProfilesForApproverSelection,
-- which queried user_roles directly from the browser. The user_roles SELECT policy
-- ("user_roles_select_admin") only allows super_admin / admin / users with
-- 'roles.edit' to read other users' rows; everyone else silently saw an empty set
-- via RLS, so the role filter produced no users.
--
-- Fix: narrow SECURITY DEFINER RPC that returns the user_ids assigned to a given
-- role_key. Only exposes IDs (not permissions or other sensitive fields) and
-- authenticated users can call it -- profiles RLS is already open to all
-- authenticated callers, so this composes safely with the existing profile query.
CREATE OR REPLACE FUNCTION public.get_user_ids_by_role_key(p_role_key text)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ur.user_id
  FROM user_roles ur
  INNER JOIN custom_roles cr ON ur.role_id = cr.id
  WHERE cr.role_key = p_role_key
$$;

REVOKE ALL ON FUNCTION public.get_user_ids_by_role_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_ids_by_role_key(text) TO authenticated;

COMMENT ON FUNCTION public.get_user_ids_by_role_key(text) IS
'Returns user IDs assigned to the given role_key. SECURITY DEFINER bypasses user_roles RLS so non-admin callers (e.g. resource owners building an approver chain) can resolve role -> users. Read-only.';
