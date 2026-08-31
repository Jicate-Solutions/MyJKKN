-- =====================================================================
-- Designated leave approvers: the flow decides who may approve
-- =====================================================================
-- PROBLEM: hla_update required user_has_permission('hr.leave.approve')
-- unconditionally, so an approval flow could NARROW who approves but never
-- AUTHORIZE anyone. Naming a specific HOD as approver saved cleanly and that
-- HOD still could not act.
--
-- Measured consequence on 2026-08-12: 311 leave applications pending, none
-- ever approved, oldest 2026-07-28. Only ceo/coo/hr_admin/hr_manager/hr_head/
-- managing_director carry the permission, and 8 of 14 institutions had ZERO
-- such person -- 166 of those applications sat where nobody could act at all.
-- Meanwhile the people who actually approve departmental leave (118 HODs,
-- 13 Principals) had no permission.
--
-- FIX: an additional RLS branch that authorizes the person the application's
-- own approval chain designates for its current step. No blanket permission
-- grant: a HOD gains approval rights ONLY for applications routed to them,
-- and only at their own institution. Editing a flow changes who can approve.

BEGIN;

-- ---------------------------------------------------------------------
-- Is the caller the designated approver for this application's CURRENT step?
--
-- SECURITY DEFINER because it reads user_roles/custom_roles, which the
-- caller cannot necessarily select. STABLE, not VOLATILE, so the planner may
-- cache it per statement -- this runs inside an RLS predicate on every row.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_designated_leave_approver(
  p_application_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_leave_applications a
    CROSS JOIN LATERAL (
      SELECT a.approval_chain -> a.current_step AS step
    ) s
    WHERE a.id = p_application_id
      AND auth.uid() IS NOT NULL
      AND s.step IS NOT NULL
      AND (
        -- (1) Named person. Inherently scoped: it is one specific auth uid,
        --     so no organization clause is needed or wanted -- being named IS
        --     the authorization, including for a cross-institution approver.
        NULLIF(s.step->>'approver_user_id', '')::uuid = auth.uid()

        OR
        -- (2) Named role. The organization clause is NOT optional here.
        --     Without it, any chain saying 'hod' would let all 118 HODs in
        --     the group approve any institution's leave. Role identifies a
        --     KIND of person; only the org clause makes it THIS institution's.
        (
          NULLIF(s.step->>'approver_role', '') IS NOT NULL
          AND a.hr_organization_id IN (
            SELECT unnest(public.fn_my_hr_organization_ids())
          )
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = auth.uid()
              AND cr.role_key = NULLIF(s.step->>'approver_role', '')
              AND cr.is_active
          )
        )
      )
  );
$function$;

COMMENT ON FUNCTION public.fn_is_designated_leave_approver(uuid) IS
  'True when auth.uid() is the approver named by the application''s current '
  'approval_chain step -- either the pinned approver_user_id, or a holder of '
  'approver_role within the same hr_organization. Placeholder role keys that '
  'match no custom_roles row (e.g. the seeded ''hr_approver'' sentinel) return '
  'false here on purpose, so those flows keep falling through to the '
  'permission-based branch of hla_update rather than silently granting anyone.';

REVOKE ALL ON FUNCTION public.fn_is_designated_leave_approver(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_is_designated_leave_approver(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Widen hla_update by exactly one branch.
--
-- ALTER POLICY, not DROP + CREATE: dropping leaves a window with no policy
-- on a live table. The three existing branches are reproduced verbatim.
--
-- Self-approval is NOT re-checked here: hr_trig_leave_enforce_approver
-- already raises on OLD.employee_id IN fn_my_staff_ids(), and duplicating
-- that rule in two places invites the two copies to drift.
-- ---------------------------------------------------------------------
ALTER POLICY hla_update ON public.hr_leave_applications
USING (
  (SELECT public.is_super_admin())
  OR (employee_id IN (SELECT unnest(public.fn_my_staff_ids())))
  OR (
    (SELECT public.user_has_permission('hr.leave.approve'))
    AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
  )
  OR public.fn_is_designated_leave_approver(id)
)
WITH CHECK (
  (SELECT public.is_super_admin())
  OR ((status)::text <> ALL (ARRAY['approved'::text, 'rejected'::text]))
  OR (
    (SELECT public.user_has_permission('hr.leave.approve'))
    AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
  )
  OR public.fn_is_designated_leave_approver(id)
);

COMMIT;
