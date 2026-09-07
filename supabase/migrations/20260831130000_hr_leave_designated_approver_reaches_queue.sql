-- ============================================================================
-- A designated leave approver must be able to REACH the queue
-- 2026-08-31 (follows 20260831120000_hr_leave_approval_flow_parallel_ladder)
-- ----------------------------------------------------------------------------
-- WITHOUT THIS THE ROLE LADDER IS DEAD ON ARRIVAL.
--
-- hod (94 holders), principal (13) and cao (1) all carry hr.leave.approve=false.
-- hla_update and trg_hla_approver_gate both let them decide a step routed to
-- them -- but THREE gates sit in front of that, and all three funnel through
-- hr_can_approve_leave(): the sidebar entry, the Approvals page's own guard, and
-- hr_leave_approval_queue(), which RAISES 42501. A ladder-routed HOD would be
-- authorised to approve a request and unable to reach it from anywhere.
--
-- THE ALTERNATIVE WAS WORSE. Granting hr.leave.approve to hod/principal/cao
-- would satisfy every gate, but hla_update's `hr.leave.approve AND org` branch
-- would then let ANY of the 94 HODs approve ANY request in their institution,
-- not only the ones routed to them. Being named as the current approver is the
-- narrower authority and the correct one.
-- ============================================================================

-- 1. "Am I the named approver of anything right now?" Kept as its own function
--    so the cheap permission test stays first in the OR below.
CREATE OR REPLACE FUNCTION public.fn_is_any_leave_approver()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_leave_applications a
    WHERE a.status IN ('pending', 'escalated')
      AND public.fn_leave_step_admits(
            a.approval_chain -> a.current_step, auth.uid(), a.hr_organization_id)
  );
$function$;

-- 2. The capability gate used by the sidebar, the Approvals page and the queue.
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
      OR public.fn_is_any_leave_approver();
$function$;

-- 3. hr_leave_approval_queue(): two changes, both NARROWING.
--
--    (a) The organisation branch now requires hr.leave.approve. A no-op for
--        every caller who could reach the body before -- the gate already
--        demanded the key -- but it stops a designated-only approver, who now
--        passes that gate, from reading every application in their institution.
--        The function is SECURITY DEFINER, so RLS would not have caught this.
--
--    (b) waiting_on_me resolves the step through fn_leave_step_admits instead of
--        the singular approver_user_id / approver_role, so a multi-approver or
--        role-ladder step is evaluated properly rather than matching on
--        whichever single field happened to be present.
--
-- Everything else below is the previous definition, reproduced verbatim because
-- CREATE OR REPLACE has to restate the whole function.

CREATE OR REPLACE FUNCTION public.hr_leave_approval_queue()
RETURNS TABLE(id uuid, employee_id uuid, staff_name text, staff_code text, institution_id uuid,
  institution_name text, hr_organization_id uuid, hr_organization_name text, leave_type_id uuid,
  leave_type_name text, leave_type_code text, request_category text, start_date date, end_date date,
  start_time time without time zone, end_time time without time zone, duration_type text,
  duration_minutes integer, total_days numeric, reason text, is_emergency boolean, status text,
  created_at timestamp with time zone, applied_by uuid, applied_by_name text,
  applied_on_behalf boolean, final_approver_id uuid, final_approver_name text,
  final_decided_at timestamp with time zone, rejection_reason text, is_own boolean,
  can_decide boolean, waiting_on_me boolean, biometric_gap_from date)
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
    END AS biometric_gap_from
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
