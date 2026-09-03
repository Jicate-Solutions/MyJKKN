-- ============================================================================
-- Full leave-approval access = HR Head + Managing Director + super admin
-- 2026-08-31 (follows 20260831140000_hr_leave_role_step_scoped_to_own_institution)
-- ----------------------------------------------------------------------------
-- Everyone else reaches the Approvals tab ONLY by being named in an approval
-- flow -- pinned, on a step's role, on a ladder rung, or as the fallback -- and
-- then sees only the requests routed to them, in their own institution.
--
-- THE KEY IS REVOKED, ROLES ARE NOT NAMED IN SQL. Role Management is the source
-- of truth and policies gate on permission keys, never on role names. Stored as
-- false rather than removed, which is this codebase's convention for revocation
-- (63 roles CONTAIN the key; only the granted ones have it true -- never test
-- membership with `permissions ? 'key'`).
--
-- SAFE ON LIVE DATA. ceo, coo, hr_admin and hr_manager have made 0 leave
-- decisions between them, ever. The only active approver is the holder of
-- hr_head (57 decisions, last 2026-08-27), who keeps the key. The COO also holds
-- hr_head personally, so he keeps full access through that role.
--
-- SIDE EFFECT, DELIBERATE. hcoc_select / hcoc_update (comp-off credits),
-- hlb_select (leave balances) and hleo_select (entitlement overrides) gate on
-- this same key, so ceo/coo lose READ there too. Their hr_leave_applications
-- read survives via hr.leave.view. Widening those three policies to accept
-- hr.leave.view instead was REJECTED: 52 Staff Counsellors hold that key and
-- would have gained leave-balance and comp-off visibility.
-- ============================================================================

UPDATE public.custom_roles
SET permissions = jsonb_set(permissions, '{hr.leave.approve}', 'false'::jsonb, true),
    updated_at  = now()
WHERE is_active
  AND role_key IN ('ceo', 'coo', 'hr_admin', 'hr_manager')
  AND (permissions->>'hr.leave.approve')::boolean IS TRUE;

-- ---------------------------------------------------------------------------
-- Named in an ACTIVE flow, whether or not anything is pending yet
-- ---------------------------------------------------------------------------
-- fn_is_any_leave_approver() only fires while a request is actually sitting on
-- the person's step, so a freshly configured approver would have had no tab
-- until someone applied -- and it would vanish again once the queue cleared.
-- Configuration is the stable signal, and "set them in the approval flow and
-- they can see it" is what was asked for.
--
-- The PINNED branch is org-exempt, matching fn_leave_step_admits; the role
-- branches are confined to the approver's own institutions.

CREATE OR REPLACE FUNCTION public.fn_is_configured_leave_approver()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH my_roles AS (
    SELECT cr.role_key
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id AND cr.is_active
    WHERE ur.user_id = auth.uid()
  ),
  f AS (
    SELECT af.hr_organization_id, af.steps, af.role_ladder, af.fallback_approver,
           af.hr_organization_id = ANY (
             COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[])) AS mine
    FROM public.hr_approval_flows af
    WHERE af.flow_for = 'leave_approval' AND af.is_active AND af.valid_until IS NULL
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM f
    WHERE
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(f.steps,'[]'::jsonb)) st
        CROSS JOIN LATERAL public.fn_leave_step_approvers(st) e
        WHERE e.approver_user_id = auth.uid()
      )
      OR NULLIF(f.fallback_approver->>'approver_user_id','')::uuid = auth.uid()
      OR (
        f.mine
        AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(f.steps,'[]'::jsonb)) st
            CROSS JOIN LATERAL public.fn_leave_step_approvers(st) e
            JOIN my_roles r ON r.role_key = e.approver_role
          )
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(f.role_ladder,'[]'::jsonb)) rung
            JOIN my_roles r ON r.role_key = rung
          )
          OR EXISTS (
            SELECT 1 FROM my_roles r
            WHERE r.role_key = NULLIF(f.fallback_approver->>'approver_role','')
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.hr_can_approve_leave()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.is_super_admin()
      OR (
        public.user_has_permission('hr.leave.approve')
        AND COALESCE(array_length(public.fn_my_hr_organization_ids(), 1), 0) > 0
      )
      OR public.fn_is_any_leave_approver()
      OR public.fn_is_configured_leave_approver();
$function$;

REVOKE ALL ON FUNCTION public.fn_is_configured_leave_approver() FROM anon;
