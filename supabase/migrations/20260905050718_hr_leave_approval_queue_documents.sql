-- Approval queue returns the supporting documents, so the queue can show them.
--
-- The Approvals table had no way to know a request carried a medical
-- certificate: hr_leave_approval_queue() returned 34 columns and documents was
-- not one of them, so the only route to the evidence was open the row menu ->
-- View -> wait for a SECOND fetch (/hr/leave/applications/[id]) to come back.
-- 102 of the 816 open requests carry a document; an approver clearing a queue
-- had to open every row to find out which.
--
-- The column is free here. The queue already selects from hr_leave_applications
-- as `a` -- documents is one more column off a row that is already being read,
-- not a join, a subquery or a second scan. That is exactly why this belongs in
-- the RPC and not in a companion query: a client-side .in('id', ...) over
-- hr_leave_applications runs under RLS, and hla_select is the policy that put
-- this queue into 57014 statement timeouts for 94 HODs in September.
--
-- COALESCE because the column is nullable (default '[]'), and a null would make
-- the client test `documents.length` on nothing.
--
-- Adding a column to a RETURNS TABLE function requires DROP; CREATE OR REPLACE
-- cannot change the return type. Everything below the signature is the body
-- CURRENTLY DEPLOYED (pg_get_functiondef, 2026-09-05 -- which carries the
-- v_key / fn_is_designated_leave_approver widening from
-- 20260903_* that the 20260829 file on disk predates) apart from the new final
-- column.
--
-- GRANTS ARE NOT AUTOMATIC AFTER A DROP. Dropping a function drops its ACL, and
-- the recreated one inherits the default EXECUTE-to-PUBLIC instead. The 0829
-- migration dropped without re-granting, which is why proacl currently reads
-- `{=X/postgres,...}` -- PUBLIC, and therefore anon, holds EXECUTE on the leave
-- approval queue. Harmless in practice (the body returns immediately on a null
-- auth.uid() and raises 42501 without hr_can_approve_leave()), but it is not
-- what the original migration intended. Restored below.

DROP FUNCTION IF EXISTS public.hr_leave_approval_queue();

CREATE FUNCTION public.hr_leave_approval_queue()
 RETURNS TABLE(id uuid, employee_id uuid, staff_name text, staff_code text, institution_id uuid, institution_name text, hr_organization_id uuid, hr_organization_name text, leave_type_id uuid, leave_type_name text, leave_type_code text, request_category text, start_date date, end_date date, start_time time without time zone, end_time time without time zone, duration_type text, duration_minutes integer, total_days numeric, reason text, is_emergency boolean, status text, created_at timestamp with time zone, applied_by uuid, applied_by_name text, applied_on_behalf boolean, final_approver_id uuid, final_approver_name text, final_decided_at timestamp with time zone, rejection_reason text, is_own boolean, can_decide boolean, waiting_on_me boolean, biometric_gap_from date, documents jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_sa   boolean;
  v_orgs uuid[];
  v_mine uuid[];
  v_key  boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF NOT public.hr_can_approve_leave() THEN
    RAISE EXCEPTION 'You do not have permission to approve leave' USING ERRCODE = '42501';
  END IF;

  v_sa   := public.is_super_admin();
  v_orgs := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_mine := COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]);
  v_key  := public.user_has_permission('hr.leave.approve');

  RETURN QUERY
  SELECT
    a.id, a.employee_id,
    NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), '')::text,
    NULLIF(btrim(s.staff_id), '')::text,
    s.institution_id, i.name::text,
    a.hr_organization_id, o.name::text,
    a.leave_type_id, lt.leave_type_name::text, lt.leave_type_code::text,
    COALESCE(lt.request_category, 'leave')::text,
    a.start_date, a.end_date, a.start_time, a.end_time,
    a.duration_type::text, a.duration_minutes, a.total_days,
    a.reason, a.is_emergency, a.status::text, a.created_at, a.applied_by,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email)::text,
    (a.applied_by IS DISTINCT FROM s.profile_id),
    a.final_approver_id,
    COALESCE(NULLIF(btrim(fp.full_name), ''), fp.email)::text,
    a.final_decided_at, a.rejection_reason,
    (a.employee_id = ANY (v_mine)) AS is_own,
    (a.status IN ('pending','escalated') AND (v_sa OR a.employee_id <> ALL (v_mine))) AS can_decide,
    (
      a.status IN ('pending', 'escalated')
      AND (v_sa OR a.employee_id <> ALL (v_mine))
      AND (
        st.step IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.fn_leave_step_approvers(st.step) e
          LEFT JOIN public.custom_roles cr ON cr.role_key = e.approver_role AND cr.is_active
          WHERE e.approver_user_id IS NOT NULL OR cr.role_key IS NOT NULL
        )
        OR public.fn_leave_step_admits(st.step, v_uid, a.hr_organization_id)
      )
    ) AS waiting_on_me,
    CASE
      WHEN a.status IN ('pending', 'escalated')
        THEN public.fn_hr_leave_biometric_gap(a.employee_id, a.leave_type_id, a.start_date, a.end_date)
      ELSE NULL
    END AS biometric_gap_from,
    COALESCE(a.documents, '[]'::jsonb) AS documents
  FROM public.hr_leave_applications a
  LEFT JOIN public.hr_leave_types   lt ON lt.id = a.leave_type_id
  LEFT JOIN public.staff            s  ON s.id  = a.employee_id
  LEFT JOIN public.institutions     i  ON i.id  = s.institution_id
  LEFT JOIN public.hr_organizations o  ON o.id  = a.hr_organization_id
  LEFT JOIN public.profiles         p  ON p.id  = a.applied_by
  LEFT JOIN public.profiles         fp ON fp.id = a.final_approver_id
  CROSS JOIN LATERAL (SELECT a.approval_chain -> a.current_step AS step) st
  WHERE (
      a.status IN ('pending', 'escalated')
      OR a.final_decided_at >= now() - interval '12 months'
      OR (a.status IN ('withdrawn','cancelled') AND a.updated_at >= now() - interval '12 months')
    )
    AND (
      v_sa
      OR (v_key AND a.hr_organization_id = ANY (v_orgs))
      OR public.fn_is_designated_leave_approver(a.id)
    )
  ORDER BY a.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_leave_approval_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_approval_queue() TO authenticated;

COMMENT ON FUNCTION public.hr_leave_approval_queue() IS
  'Leave/STO approval queue for the caller. documents is the raw '
  'hr_leave_applications.documents array so the queue can show a viewer '
  'without a second fetch per row.';
