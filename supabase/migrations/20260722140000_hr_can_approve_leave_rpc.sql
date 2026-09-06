-- Capability check driving the "Approvals" tab in the Time Off workspace.
--
-- WHY a function rather than a client-side permission check: nav visibility
-- must mirror the route guard, and the route guard must mirror RLS. Anything
-- else produces either a tab that leads to an empty page, or an action the
-- user can see but the database rejects.
--
-- This mirrors the hla_update policy on hr_leave_applications exactly:
--
--   is_super_admin()
--   OR (user_has_permission('hr.leave.approve')
--       AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
--
-- minus the per-row org term, which becomes "belongs to at least one org".
--
-- hr.leave.approve resolves to exactly five roles — Chief Executive Officer,
-- Chief Operating Officer, HR Administrator, HR Head, HR Manager — plus super
-- admins via the bypass inside user_has_permission(). Note the catalog stores
-- revocation as `false` rather than removing the key, so 63 roles CONTAIN the
-- key while only 5 have it set true; `permissions ? 'hr.leave.approve'` is the
-- wrong test and over-reports by 12x. user_has_permission() reads the value.

CREATE OR REPLACE FUNCTION public.hr_can_approve_leave()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.is_super_admin()
      OR (
        public.user_has_permission('hr.leave.approve')
        AND COALESCE(array_length(public.fn_my_hr_organization_ids(), 1), 0) > 0
      );
$$;

REVOKE ALL ON FUNCTION public.hr_can_approve_leave() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_can_approve_leave() TO authenticated;

COMMENT ON FUNCTION public.hr_can_approve_leave() IS
  'True when the caller can act on at least one leave application. Mirrors the hla_update RLS policy so the Approvals tab, its route guard and the database agree.';
