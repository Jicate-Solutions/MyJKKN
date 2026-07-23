-- 20260711130000_refund_role_members_rpc.sql
-- Returns (role_id, user_id) membership pairs for ACTIVE custom_roles so the
-- refund-approval flow editor can filter its user picker to holders of the
-- selected role(s). SECURITY DEFINER + self-authorizing: only config authors
-- (super admin / admin / billing.refunds.configure) get rows — mirrors the
-- aggregate-only fn_role_user_counts() pattern but returns the member ids.
CREATE OR REPLACE FUNCTION public.fn_refund_role_members()
RETURNS TABLE(role_id uuid, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role_id, ur.user_id
  FROM user_roles ur
  JOIN custom_roles cr ON cr.id = ur.role_id
  WHERE cr.is_active
    AND (is_super_admin() OR is_admin() OR user_has_permission('billing.refunds.configure'));
$$;

REVOKE EXECUTE ON FUNCTION public.fn_refund_role_members() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_refund_role_members() TO authenticated;
