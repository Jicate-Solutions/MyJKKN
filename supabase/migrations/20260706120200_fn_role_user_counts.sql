-- =====================================================================================
-- Role → active-holder counts for the recruitment flow builder
-- (/hr/admin/recruitment-approval-flows). SECURITY DEFINER because HR admins
-- cannot read user_roles broadly, but the function discloses ONLY aggregate
-- counts (role_key, users) — no user identities. Grant: authenticated.
-- Used to warn when a flow step routes to a role nobody holds (the root cause
-- of the "approvals not working" incident: director/hr_head had 0 holders).
-- =====================================================================================

CREATE OR REPLACE FUNCTION fn_role_user_counts()
RETURNS TABLE(role_key text, role_name text, users bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(cr.role_key), cr.role_name, count(DISTINCT ur.user_id)::bigint
  FROM custom_roles cr
  LEFT JOIN user_roles ur ON ur.role_id = cr.id
  WHERE cr.is_active
  GROUP BY lower(cr.role_key), cr.role_name
  ORDER BY cr.role_name;
$$;

REVOKE EXECUTE ON FUNCTION fn_role_user_counts() FROM anon;
GRANT EXECUTE ON FUNCTION fn_role_user_counts() TO authenticated;
