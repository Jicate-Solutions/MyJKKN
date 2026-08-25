-- BUG-005884 — leave-approval notifications fan out to every institution.
--
-- The role-step branch of the leave_submitted notifier resolved approvers with
--   profiles.select('id').eq('role', step.approver_role).eq('is_active', true)
-- on a SERVICE-ROLE client. That has no tenancy predicate at all, and the
-- service-role client is exactly the one that bypasses the RLS which would have
-- supplied one. Result: a Dental College leave request notified all 12 active
-- principals in the group; 2,064 of 2,371 delivered rows (87.1%) went to someone
-- whose own RLS then refused them the deep-link, rendering "Application not found."
--
-- The database already states the correct rule, in fn_is_designated_leave_approver:
-- a role step admits you when the application's hr_organization_id is inside your
-- org scope AND you hold that role_key via user_roles/custom_roles. This function
-- is that predicate inverted — "who are the designated approvers for this step" —
-- so the notification recipient set is the read-permitted set BY CONSTRUCTION and
-- the two cannot drift apart again.
--
-- Note it keys off user_roles, NOT profiles.role. Those two diverge here (12
-- principals by profiles.role vs 14 by user_roles); profiles.role is the legacy
-- mirror and the enforced gate reads user_roles.

CREATE OR REPLACE FUNCTION public.hr_leave_step_approver_user_ids(p_application_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH app AS (
    SELECT o.institution_id,
           a.approval_chain -> a.current_step AS step
    FROM public.hr_leave_applications a
    JOIN public.hr_organizations o ON o.id = a.hr_organization_id
    WHERE a.id = p_application_id
  )
  SELECT COALESCE(array_agg(DISTINCT x.uid), ARRAY[]::uuid[])
  FROM app
  CROSS JOIN LATERAL (
    -- A pinned approver wins outright; no role fan-out at all.
    SELECT NULLIF(app.step->>'approver_user_id','')::uuid AS uid
    WHERE NULLIF(app.step->>'approver_user_id','') IS NOT NULL

    UNION ALL

    -- Role step: holders of that role_key inside the applicant's institution.
    SELECT p.id
    FROM public.staff s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE NULLIF(app.step->>'approver_user_id','') IS NULL
      AND NULLIF(app.step->>'approver_role','') IS NOT NULL
      AND s.institution_id = app.institution_id
      AND COALESCE(s.is_active, true)
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p.id
          AND cr.is_active
          AND cr.role_key = NULLIF(app.step->>'approver_role','')
      )

    UNION ALL

    -- Explicit cross-institution grantees who also hold the role. Mirrors the
    -- user_institution_access arm of role_has_institution_access.
    SELECT uia.user_id
    FROM public.user_institution_access uia
    WHERE NULLIF(app.step->>'approver_user_id','') IS NULL
      AND NULLIF(app.step->>'approver_role','') IS NOT NULL
      AND uia.institution_id = app.institution_id
      AND uia.is_active
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = uia.user_id
          AND cr.is_active
          AND cr.role_key = NULLIF(app.step->>'approver_role','')
      )
  ) x
  WHERE x.uid IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.hr_leave_step_approver_user_ids(uuid) IS
  'BUG-005884. Designated approver profile ids for a leave application''s CURRENT chain step. Inverse of fn_is_designated_leave_approver, so notification recipients equal the set RLS admits. Keys off user_roles (not profiles.role).';

-- EXECUTE is granted explicitly: this project has already lost a function's ACL
-- through a prod DROP+CREATE and 403'd every caller as a result.
REVOKE ALL ON FUNCTION public.hr_leave_step_approver_user_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_leave_step_approver_user_ids(uuid) TO authenticated, service_role;
