-- =====================================================================
-- A designated approver must be able to SEE what they may approve
-- =====================================================================
-- 20260812090000 added the designated-approver branch to hla_update, and
-- verification by impersonation showed the approval still did nothing: a
-- Dental Principal could not SELECT a single application.
--
-- hla_select gates reads on hr.leave.approve OR hr.leave.view, and the whole
-- point of the designated-approver model is that such a person holds neither.
-- So the Approvals page rendered empty and the UPDATE had no row to target --
-- a silent dead end, not an error.
--
-- Same branch, same function, applied to the read policy. Verified after:
-- the Dental Principal sees 94 applications (Dental's exact pending count)
-- and 0 from any other institution.

ALTER POLICY hla_select ON public.hr_leave_applications
USING (
  (SELECT public.is_super_admin())
  OR (employee_id IN (SELECT unnest(public.fn_my_staff_ids())))
  OR (applied_by = (SELECT auth.uid()))
  OR (final_approver_id = (SELECT auth.uid()))
  OR (
    (SELECT public.user_has_permission('hr.leave.approve'))
    AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
  )
  OR (
    (SELECT public.user_has_permission('hr.leave.view'))
    AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
  )
  OR public.fn_is_designated_leave_approver(id)
);
