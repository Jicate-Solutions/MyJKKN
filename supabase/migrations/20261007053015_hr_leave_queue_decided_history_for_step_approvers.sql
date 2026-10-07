-- HR → Time Off → Approvals: a principal (any role-step approver without the
-- hr.leave.approve key) saw "No results" under Status = Approved / Rejected.
--
-- WHY: hr_leave_approval_queue() admits such callers only through
-- fn_is_designated_leave_approver(a.id), which tests the CURRENT step
-- (approval_chain -> current_step). Deciding the final step advances
-- current_step past the end of the chain, so that lookup is NULL and the
-- caller loses the request the moment it is approved or rejected. 2,305 of
-- 2,494 decided rows in the 12-month history window are past the end; the
-- Pharmacy principal's queue returned 14 pending, 44 withdrawn, 1 rejected
-- and 0 approved.
--
-- FIX: for DECIDED rows only, admit a caller who was an approver on ANY step
-- of the frozen chain — pinned by id, decided it, or admitted by the step's
-- role under the same fn_leave_step_admits() scope rules. Pending rows keep
-- the current-step test unchanged.
--
-- fn_is_designated_leave_approver() itself is NOT changed: hla_update uses
-- it, and widening it would let past approvers write to decided rows. The
-- function is SECURITY DEFINER, so this widens only what the queue returns.
--
-- Cost: the per-step role test runs only for decided rows in an organisation
-- the caller reaches (key orgs ∪ designated orgs), computed once per call.

CREATE OR REPLACE FUNCTION public.hr_leave_approval_queue()
 RETURNS TABLE(id uuid, employee_id uuid, staff_name text, staff_code text, institution_id uuid, institution_name text, department_id uuid, department_name text, hr_organization_id uuid, hr_organization_name text, leave_type_id uuid, leave_type_name text, leave_type_code text, request_category text, start_date date, end_date date, start_time time without time zone, end_time time without time zone, duration_type text, duration_minutes integer, total_days numeric, reason text, is_emergency boolean, status text, created_at timestamp with time zone, applied_by uuid, applied_by_name text, applied_on_behalf boolean, final_approver_id uuid, final_approver_name text, final_decided_at timestamp with time zone, rejection_reason text, is_own boolean, can_decide boolean, waiting_on_me boolean, biometric_gap_from date, documents jsonb, current_step integer, chain_length integer, step_is_final boolean, revoked_at timestamp with time zone, revoked_by_name text, revoke_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_sa    boolean;
  v_orgs  uuid[];
  v_mine  uuid[];
  v_key   boolean;
  v_reach uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF NOT public.hr_can_approve_leave() THEN
    RAISE EXCEPTION 'You do not have permission to approve leave' USING ERRCODE = '42501';
  END IF;

  v_sa    := public.is_super_admin();
  v_orgs  := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_mine  := COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]);
  v_key   := public.user_has_permission('hr.leave.approve');
  -- Every organisation fn_leave_step_admits() could admit a ROLE step in.
  v_reach := (CASE WHEN v_key THEN v_orgs ELSE ARRAY[]::uuid[] END)
             || COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[]);

  RETURN QUERY
  SELECT
    a.id, a.employee_id,
    NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), '')::text,
    NULLIF(btrim(s.staff_id), '')::text,
    s.institution_id, i.name::text,
    s.department_id, d.department_name::text,
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
        OR public.fn_leave_step_admits(st.step, v_uid, a.hr_organization_id, a.employee_id)
      )
    ) AS waiting_on_me,
    CASE
      WHEN a.status IN ('pending', 'escalated')
        THEN public.fn_hr_leave_biometric_gap(a.employee_id, a.leave_type_id, a.start_date, a.end_date)
      ELSE NULL
    END AS biometric_gap_from,
    COALESCE(a.documents, '[]'::jsonb) AS documents,
    a.current_step,
    jsonb_array_length(COALESCE(a.approval_chain, '[]'::jsonb)) AS chain_length,
    (a.current_step = public.fn_hr_leave_final_step_index(a.approval_chain)) AS step_is_final,
    a.revoked_at,
    COALESCE(NULLIF(btrim(rp.full_name), ''), rp.email)::text AS revoked_by_name,
    a.revoke_reason
  FROM public.hr_leave_applications a
  LEFT JOIN public.hr_leave_types   lt ON lt.id = a.leave_type_id
  LEFT JOIN public.staff            s  ON s.id  = a.employee_id
  LEFT JOIN public.institutions     i  ON i.id  = s.institution_id
  LEFT JOIN public.departments      d  ON d.id  = s.department_id
  LEFT JOIN public.hr_organizations o  ON o.id  = a.hr_organization_id
  LEFT JOIN public.profiles         p  ON p.id  = a.applied_by
  LEFT JOIN public.profiles         fp ON fp.id = a.final_approver_id
  LEFT JOIN public.profiles         rp ON rp.id = a.revoked_by
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
      -- Decided history: an approver on any step of the frozen chain.
      OR (
        a.status NOT IN ('pending', 'escalated')
        AND (
          jsonb_path_exists(
            COALESCE(a.approval_chain, '[]'::jsonb),
            '$[*] ? (@.approver_user_id == $u || @.decided_by == $u
                     || @.approvers[*].approver_user_id == $u || @.decisions[*].by == $u)',
            jsonb_build_object('u', v_uid::text))
          OR (
            a.hr_organization_id = ANY (v_reach)
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(a.approval_chain, '[]'::jsonb)) ch(step)
              WHERE public.fn_leave_step_admits(ch.step, v_uid, a.hr_organization_id, a.employee_id)
            )
          )
        )
      )
    )
  ORDER BY a.created_at DESC;
END;
$function$;
