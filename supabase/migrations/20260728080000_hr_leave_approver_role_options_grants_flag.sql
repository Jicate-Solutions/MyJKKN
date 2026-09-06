-- Tell the flow editor which roles can actually approve leave.
--
-- THE PROBLEM THIS SOLVES. Of 81 active roles, only FIVE grant
-- hr.leave.approve — ceo, hr_head, coo, hr_manager, hr_admin — and only three
-- of those have any members (5 people in total, plus super admins). Critically,
-- `principal` (11 members) and `hod` (101 members) do NOT have it, and they are
-- exactly the roles an administrator would reach for when routing casual leave.
--
-- A step routed to a role without hr.leave.approve is a dead end: the new
-- trg_hla_approver_gate would let that person past the role check, and then the
-- hla_update RLS policy would refuse the write anyway. The flow would read
-- correctly on screen and fail at the moment of approval.
--
-- 63 roles DECLARE the key with a value of false, so mere presence proves
-- nothing — the JSONB is an object of key -> boolean and only `= 'true'` counts.
-- That is the exact trap described in this repo's RBAC notes: declaring a
-- permission key grants nothing until a role's JSONB says true.
--
-- The list is not filtered down to those five. An administrator who wants HODs
-- to approve leave needs to SEE the HOD role and be told what is missing;
-- hiding it would look like the role does not exist. Granting the permission
-- remains a Role Management decision, not something this editor does silently.
--
-- DROP first: CREATE OR REPLACE cannot change a function's return type, and
-- adding a column to RETURNS TABLE is a return-type change.

DROP FUNCTION IF EXISTS public.hr_leave_approver_role_options();

CREATE FUNCTION public.hr_leave_approver_role_options()
RETURNS TABLE (
  role_key       text,
  role_name      text,
  user_count     bigint,
  grants_approve boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
BEGIN
  IF NOT public.is_super_admin()
     AND NOT public.user_has_permission('hr.leave.types.manage') THEN
    RAISE EXCEPTION 'Not authorized to list approver roles';
  END IF;

  RETURN QUERY
  SELECT
    cr.role_key::text,
    cr.role_name::text,
    (SELECT count(*) FROM public.user_roles ur WHERE ur.role_id = cr.id),
    (cr.permissions ->> 'hr.leave.approve') = 'true'
  FROM public.custom_roles cr
  WHERE cr.is_active
  ORDER BY
    ((cr.permissions ->> 'hr.leave.approve') = 'true') DESC,
    (SELECT count(*) FROM public.user_roles ur2 WHERE ur2.role_id = cr.id) DESC,
    cr.role_name;
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_approver_role_options() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_approver_role_options() TO authenticated;
