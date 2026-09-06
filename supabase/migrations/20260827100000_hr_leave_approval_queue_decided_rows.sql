-- Approval queue also returns DECIDED requests, and who decided them.
--
-- The queue used to stop at `status IN ('pending','escalated')`, so a request
-- vanished from /hr/leave/approvals the moment it was approved. An approver
-- auditing "who approved all of these?" had nowhere to look: final_approver_id
-- is a profiles id, and profiles is unreadable to most approvers under RLS, so
-- no client-side lookup could name the decider. Resolved here instead — this
-- function is already SECURITY DEFINER, same reasoning as applied_by_name.
--
-- Decided rows (approved/rejected/withdrawn/cancelled) are bounded to the last
-- 12 months so this single-shot, unpaginated payload cannot grow without limit
-- across years; open rows are always returned regardless of age. Withdrawn and
-- cancelled rows never get a final_decided_at, so they bound on updated_at.
--
-- can_decide and waiting_on_me are now false on any decided row: the Approve /
-- Reject menu, bulk-approve selection and the "Waiting on me" count must not
-- offer a decision the trigger would refuse on an already-decided application.
--
-- RETURNS TABLE gains columns, so DROP first. DROP discards EXECUTE; re-granted.
--
-- The body is otherwise identical to 20260821160000 (applied_by columns). See
-- 20260820170000 for the scope predicate and the can_decide rule.

DROP FUNCTION IF EXISTS public.hr_leave_approval_queue();

CREATE FUNCTION public.hr_leave_approval_queue()
RETURNS TABLE (
  id                   uuid,
  employee_id          uuid,
  staff_name           text,
  staff_code           text,
  institution_id       uuid,
  institution_name     text,
  hr_organization_id   uuid,
  hr_organization_name text,
  leave_type_id        uuid,
  leave_type_name      text,
  leave_type_code      text,
  request_category     text,
  start_date           date,
  end_date             date,
  start_time           time without time zone,
  end_time             time without time zone,
  duration_type        text,
  duration_minutes     integer,
  total_days           numeric,
  reason               text,
  is_emergency         boolean,
  status               text,
  created_at           timestamptz,
  applied_by           uuid,
  applied_by_name      text,
  applied_on_behalf    boolean,
  final_approver_id    uuid,
  final_approver_name  text,
  final_decided_at     timestamptz,
  rejection_reason     text,
  is_own               boolean,
  can_decide           boolean,
  waiting_on_me        boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_sa   boolean;
  v_orgs uuid[];
  v_mine uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.hr_can_approve_leave() THEN
    RAISE EXCEPTION 'You do not have permission to approve leave'
      USING ERRCODE = '42501';
  END IF;

  v_sa   := public.is_super_admin();
  -- COALESCE to an empty array so `= ANY(...)` stays false rather than NULL for
  -- an approver with no HR organisation mapping.
  v_orgs := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_mine := COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]);

  RETURN QUERY
  SELECT
    a.id,
    a.employee_id,
    NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), '')::text,
    NULLIF(btrim(s.staff_id), '')::text,
    s.institution_id,
    i.name::text,
    a.hr_organization_id,
    o.name::text,
    a.leave_type_id,
    lt.leave_type_name::text,
    lt.leave_type_code::text,
    -- A missing type is treated as 'leave' rather than dropped: matching no
    -- category would make the row vanish from EVERY tab.
    COALESCE(lt.request_category, 'leave')::text,
    a.start_date,
    a.end_date,
    a.start_time,
    a.end_time,
    a.duration_type::text,
    a.duration_minutes,
    a.total_days,
    a.reason,
    a.is_emergency,
    a.status::text,
    a.created_at,
    a.applied_by,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email)::text  AS applied_by_name,
    (a.applied_by IS DISTINCT FROM s.profile_id)             AS applied_on_behalf,
    a.final_approver_id,
    COALESCE(NULLIF(btrim(fp.full_name), ''), fp.email)::text AS final_approver_name,
    a.final_decided_at,
    a.rejection_reason,
    (a.employee_id = ANY (v_mine))               AS is_own,
    -- Exactly what hr_trig_leave_enforce_approver enforces: super admins are
    -- exempt from the self-approval bar, everyone else is not. Never true on a
    -- decided row — there is nothing left to decide.
    (
      a.status IN ('pending', 'escalated')
      AND (v_sa OR a.employee_id <> ALL (v_mine))
    )                                            AS can_decide,
    (
      -- Waiting on ME: the same three tests as the trigger, so the badge cannot
      -- promise a decision the trigger will refuse.
      --
      -- Unlike hr_leave_my_approval_queue this does NOT return true for every
      -- row just because the caller is a super admin. A super admin CAN decide
      -- anything, but a filter that selects the entire queue tells them nothing
      -- — this is a filter, not a permission.
      a.status IN ('pending', 'escalated')
      AND (v_sa OR a.employee_id <> ALL (v_mine))
      AND (
        st.step IS NULL
        OR CASE
             WHEN NULLIF(st.step ->> 'approver_user_id', '') IS NOT NULL
               THEN (st.step ->> 'approver_user_id')::uuid = v_uid
             WHEN NULLIF(st.step ->> 'approver_role', '') IS NOT NULL
               THEN NOT EXISTS (
                      SELECT 1 FROM public.custom_roles cr
                       WHERE cr.role_key = st.step ->> 'approver_role' AND cr.is_active
                    )
                    OR EXISTS (
                      SELECT 1
                        FROM public.user_roles ur
                        JOIN public.custom_roles cr2 ON cr2.id = ur.role_id
                       WHERE ur.user_id = v_uid
                         AND cr2.role_key = st.step ->> 'approver_role'
                    )
             ELSE true
           END
      )
    )                                            AS waiting_on_me
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
      OR (
        a.status IN ('withdrawn', 'cancelled')
        AND a.updated_at >= now() - interval '12 months'
      )
    )
    -- Scope copied from hla_select. A DEFINER function bypasses RLS, so drifting
    -- from the policy here would hand out rows the table itself refuses.
    AND (
      v_sa
      OR a.hr_organization_id = ANY (v_orgs)
      OR public.fn_is_designated_leave_approver(a.id)
    )
  ORDER BY a.created_at DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hr_leave_approval_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_approval_queue() TO authenticated;

COMMENT ON FUNCTION public.hr_leave_approval_queue() IS
  'Leave + short-time-off approval queue: open requests plus the last 12 months of decided ones, with who submitted and who decided each. Scope copies hla_select; can_decide/waiting_on_me are false on decided rows.';
