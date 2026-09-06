-- Candidate approvers for the leave approval flow editor.
--
-- WHY AN RPC RATHER THAN A CLIENT-SIDE QUERY. The identity stored in a step's
-- approver_user_id must be a profiles.id (an auth uid), NOT a staff.id:
-- LeaveService.assertCanDecide() resolves the caller via
-- staff.profile_id = approverId, the new trg_hla_approver_gate compares against
-- auth.uid(), and hla_select matches final_approver_id = auth.uid(). A picker
-- that stored staff.id would save cleanly, display correctly, and then match
-- nobody at approval time — a silent failure this codebase has already shipped
-- once with event member pickers. Returning the id from one authoritative place
-- removes the chance of picking the wrong one.
--
-- can_approve is reported rather than filtered on. An admin pinning someone who
-- lacks hr.leave.approve has built a step that RLS will refuse, and seeing the
-- warning next to the name explains it far better than that person silently
-- missing from the list.
--
-- custom_roles.permissions is a JSONB OBJECT of key -> boolean, not an array,
-- so membership is `->>` compared to 'true' rather than a containment test.

CREATE OR REPLACE FUNCTION public.hr_leave_approver_candidates(
  p_hr_organization_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  profile_id  uuid,
  full_name   text,
  email       text,
  role_names  text,
  can_approve boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
BEGIN
  IF NOT public.is_super_admin()
     AND NOT public.user_has_permission('hr.leave.types.manage') THEN
    RAISE EXCEPTION 'Not authorized to list approver candidates';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), '')::text,
    p.email::text,
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
  JOIN public.hr_organizations o ON o.institution_id = s.institution_id
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE o.id = p_hr_organization_id
    AND COALESCE(s.is_active, true)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR concat_ws(' ', s.first_name, s.last_name) ILIKE '%' || btrim(p_search) || '%'
      OR p.email ILIKE '%' || btrim(p_search) || '%'
    )
  ORDER BY 5 DESC, 2 NULLS LAST
  LIMIT 50;
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_approver_candidates(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_approver_candidates(uuid, text) TO authenticated;
