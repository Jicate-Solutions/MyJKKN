-- "Waiting on me" for the leave approvals screen.
--
-- WHY NOT THE EXISTING FILTER. LeaveService.list() already accepts
-- pending_approver_id and implements it as JSONB containment:
--   approval_chain @> [{"approver_user_id": <me>}]
-- That only ever matches a step PINNED to a named person. Every role-routed
-- step carries approver_user_id = null, so the filter silently returns nothing
-- for them — and the hook that used it, useApprovalInbox, was never called from
-- anywhere, which is presumably why nobody noticed. An inbox that renders empty
-- is the exact failure this module has hit before.
--
-- WHAT "WAITING ON ME" ACTUALLY MEANS. The same three tests trg_hla_approver_gate
-- applies to the CURRENT step, and in the same order:
--   * pinned to someone else            -> not mine
--   * routed to a real role I lack      -> not mine
--   * otherwise (placeholder or my role)-> mine
-- plus the two rules that sit outside the chain: it cannot be my own request,
-- and I must be able to approve at all. Deriving the queue from the same tests
-- as the enforcement is the point — a queue that disagreed with the gate would
-- list work its owner is then refused.
--
-- Returns ids only. The row payload already comes back through the existing
-- list query and RLS; duplicating the projection here would mean two places to
-- keep in step.

CREATE OR REPLACE FUNCTION public.hr_leave_my_approval_queue(
  p_hr_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (application_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.hr_can_approve_leave() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.id
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types lt ON lt.id = a.leave_type_id
  CROSS JOIN LATERAL (
    SELECT a.approval_chain -> a.current_step AS step
  ) s
  WHERE a.status IN ('pending', 'escalated')
    AND (p_hr_organization_id IS NULL OR a.hr_organization_id = p_hr_organization_id)
    AND a.hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    -- Never my own request.
    AND a.employee_id NOT IN (SELECT unnest(public.fn_my_staff_ids()))
    AND (
      public.is_super_admin()
      OR s.step IS NULL                                   -- no chain: any approver
      OR (
        CASE
          -- Pinned: mine only if it names me.
          WHEN NULLIF(s.step ->> 'approver_user_id', '') IS NOT NULL
            THEN (s.step ->> 'approver_user_id')::uuid = v_uid
          -- Role-routed: mine if the key is a placeholder, or a role I hold.
          WHEN NULLIF(s.step ->> 'approver_role', '') IS NOT NULL
            THEN NOT EXISTS (
                   SELECT 1 FROM public.custom_roles cr
                    WHERE cr.role_key = s.step ->> 'approver_role' AND cr.is_active
                 )
                 OR EXISTS (
                   SELECT 1
                     FROM public.user_roles ur
                     JOIN public.custom_roles cr2 ON cr2.id = ur.role_id
                    WHERE ur.user_id = v_uid
                      AND cr2.role_key = s.step ->> 'approver_role'
                 )
          ELSE true
        END
      )
    );
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_my_approval_queue(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_my_approval_queue(uuid) TO authenticated;
