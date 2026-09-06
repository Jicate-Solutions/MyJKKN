-- Approver picker: offer staff from every accessible institution, not just one.
--
-- The Approval flow modal could only pin an approver from the leave type's own
-- HR organisation, because this function filtered
-- `WHERE o.id = p_hr_organization_id`. A group whose leave is signed off
-- centrally — one HR Head covering several colleges — could not express that.
--
-- THE ENFORCEMENT STACK ALREADY SUPPORTED IT. Nothing else needed changing,
-- because a PINNED approver is deliberately exempt from the organisation term
-- everywhere it appears:
--
--   fn_is_designated_leave_approver  the approver_user_id branch has NO org
--                                    test (only the approver_ROLE branch does)
--   hla_select / hla_update RLS      both end `OR fn_is_designated_leave_approver(id)`,
--                                    USING and WITH CHECK alike
--   hr_trig_leave_enforce_approver   a matching pinned uid returns NEW before any
--                                    org check is reached
--   hr_leave_approval_queue          scoped `... OR fn_is_designated_leave_approver(a.id)`
--
-- So the picker was the only thing standing in the way. That escape hatch exists
-- precisely so somebody outside the organisation can be named as the approver.
--
-- SCOPED TO ACCESSIBLE INSTITUTIONS, not simply unfiltered. Every role that
-- actually holds hr.leave.types.manage today is institution_scope='all'
-- (Managing Director, HR Head, CEO, COO — the one 'own'-scoped role, HR Manager,
-- has zero holders), so role_has_institution_access returns all 14 for all of
-- them and the picker shows everybody. Verified against a real non-super-admin
-- HR Head: 14 of 14 accessible. Using the helper rather than dropping the filter
-- keeps it correct if an 'own'-scoped role is ever granted the permission.
--
-- ORDERING: can_approve FIRST, then the leave type's own institution, then name.
-- Only 13 of 751 staff with a login hold hr.leave.approve, so ordering by
-- institution first would bury every real approver below hundreds of people who
-- cannot act on the step. p_hr_organization_id is now an ORDERING hint rather
-- than a filter — the common choice still surfaces near the top.
--
-- LIMIT raised 50 -> 100: the candidate pool went from ~150 to 751.

DROP FUNCTION IF EXISTS public.hr_leave_approver_candidates(uuid, text, text);

CREATE OR REPLACE FUNCTION public.hr_leave_approver_candidates(
  p_hr_organization_id uuid,
  p_search text DEFAULT NULL::text,
  p_role_key text DEFAULT NULL::text
)
RETURNS TABLE(
  profile_id uuid,
  full_name text,
  email text,
  institution_name text,
  role_names text,
  can_approve boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_own_institution_id uuid;
BEGIN
  IF NOT public.is_super_admin()
     AND NOT public.user_has_permission('hr.leave.types.manage') THEN
    RAISE EXCEPTION 'Not authorized to list approver candidates';
  END IF;

  -- Resolved once, and used only to sort the caller's own institution to the
  -- top within each can_approve band.
  SELECT o.institution_id INTO v_own_institution_id
  FROM public.hr_organizations o
  WHERE o.id = p_hr_organization_id;

  RETURN QUERY
  SELECT
    p.id,
    NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), '')::text,
    p.email::text,
    i.name::text,
    (SELECT string_agg(cr.role_name, ', ' ORDER BY cr.role_name)
       FROM public.user_roles ur
       JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p.id)::text,
    COALESCE(p.is_super_admin, false) OR EXISTS (
      SELECT 1
        FROM public.user_roles ur2
        JOIN public.custom_roles cr2 ON cr2.id = ur2.role_id
       WHERE ur2.user_id = p.id
         AND cr2.is_active
         AND cr2.permissions ->> 'hr.leave.approve' = 'true'
    )
  FROM public.staff s
  JOIN public.profiles p ON p.id = s.profile_id
  JOIN public.institutions i ON i.id = s.institution_id
  WHERE COALESCE(s.is_active, true)
    AND public.role_has_institution_access(s.institution_id)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR concat_ws(' ', s.first_name, s.last_name) ILIKE '%' || btrim(p_search) || '%'
      OR p.email ILIKE '%' || btrim(p_search) || '%'
    )
    AND (
      p_role_key IS NULL OR btrim(p_role_key) = ''
      OR EXISTS (
        SELECT 1
          FROM public.user_roles ur3
          JOIN public.custom_roles cr3 ON cr3.id = ur3.role_id
         WHERE ur3.user_id = p.id
           AND cr3.is_active
           AND cr3.role_key = btrim(p_role_key)
      )
    )
  ORDER BY
    6 DESC,                                                  -- can_approve
    (s.institution_id IS NOT DISTINCT FROM v_own_institution_id) DESC,
    2 NULLS LAST                                             -- full_name
  LIMIT 100;
END $function$;

COMMENT ON FUNCTION public.hr_leave_approver_candidates(uuid, text, text) IS
  'Approver candidates across every institution the caller can access. p_hr_organization_id is an ordering hint, not a filter — a pinned approver is exempt from the organisation term in fn_is_designated_leave_approver, the RLS policies and the approver trigger, so naming someone outside the organisation is supported end to end.';
