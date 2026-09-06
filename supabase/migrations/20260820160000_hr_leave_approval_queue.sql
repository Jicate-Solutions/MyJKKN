-- HR Leave — one approval queue carrying WHO is asking.
--
-- WHY THIS EXISTS
-- ---------------
-- The Approvals tab read /api/hr/leave/applications, which embeds only
-- hr_leave_types. Three consequences, all visible on the screen:
--
-- 1. NO IDENTITY. The table showed leave type, dates, days and status — never
--    the staff member. An approver decided on anonymous rows. Adding a staff
--    embed on the client does not fix it: staff_select_scope_aware requires
--    is_super_admin() OR staff.view within a module scope, and hr.leave.approve
--    grants neither, so the embed returns NULL for exactly the approvers who
--    need the name. Blank instead of missing is worse than either. Resolving it
--    in a SECURITY DEFINER function that mirrors the hla_select predicate is
--    the only way the name is there for every legitimate approver.
--
-- 2. NO INSTITUTION. hr_leave_applications has no institution_id at all; the
--    college comes from staff.institution_id, one join further out — and staff
--    is the table the approver cannot read.
--
-- 3. SUPER ADMINS SAW NOTHING, OR ONE ORG. The page passed the caller's own
--    hr_organization_id and the hook was enabled: !!hrOrgId, so a super admin
--    with no HR employee record never issued the query, and one with a record
--    saw a single organisation. The database was never the constraint —
--    hla_select, hla_update, hr_can_approve_leave() and
--    hr_trig_leave_enforce_approver all short-circuit TRUE on is_super_admin().
--    The gap was entirely client-side scoping, and it is fixed here by scoping
--    in one place that copies the RLS predicate rather than guessing at it.
--
-- Also returns request_category, so the tab can separate Leave from Short Time
-- Off. They share hr_leave_applications and differ only by the type's category,
-- and the old queue filtered on neither — so 240 pending short-time-off requests
-- were being rendered in the "Leave Requests" table with a day count and no
-- times, against 206 real leave requests.
--
-- And it returns EVERY pending row. The REST route defaults to pageSize 50 and
-- the page never overrode it, so the queue silently stopped at 50 of 446.
--
-- SCOPE PREDICATE — copied from hla_select, deliberately, not invented:
--     is_super_admin()
--  OR (hr.leave.approve AND hr_organization_id IN fn_my_hr_organization_ids())
--  OR fn_is_designated_leave_approver(id)
-- A DEFINER function bypasses RLS, so drifting from the policy here would hand
-- out rows the table itself refuses. The hr.leave.approve test is already made
-- by the hr_can_approve_leave() gate at the top.

CREATE OR REPLACE FUNCTION public.hr_leave_approval_queue()
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
  is_own               boolean,
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
    -- category would make the row vanish from EVERY tab, which is the silent
    -- hiding the service layer's LEFT joins exist to prevent.
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
    (a.employee_id = ANY (v_mine)),
    (
      -- Waiting on ME: the same three tests as hr_trig_leave_enforce_approver,
      -- so the badge cannot promise a decision the trigger will refuse.
      --
      -- Unlike hr_leave_my_approval_queue this does NOT return true for every
      -- row just because the caller is a super admin. A super admin CAN decide
      -- anything — the trigger says so — but a filter that selects the entire
      -- queue tells them nothing, and this one is a filter, not a permission.
      a.employee_id <> ALL (v_mine)
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
    )
  FROM public.hr_leave_applications a
  LEFT JOIN public.hr_leave_types   lt ON lt.id = a.leave_type_id
  LEFT JOIN public.staff            s  ON s.id  = a.employee_id
  LEFT JOIN public.institutions     i  ON i.id  = s.institution_id
  LEFT JOIN public.hr_organizations o  ON o.id  = a.hr_organization_id
  CROSS JOIN LATERAL (SELECT a.approval_chain -> a.current_step AS step) st
  WHERE a.status IN ('pending', 'escalated')
    AND (
      v_sa
      OR a.hr_organization_id = ANY (v_orgs)
      OR public.fn_is_designated_leave_approver(a.id)
    )
  ORDER BY a.created_at DESC;
END;
$fn$;

-- CREATE OR REPLACE resets EXECUTE to PUBLIC, so re-state the grants every time.
REVOKE ALL ON FUNCTION public.hr_leave_approval_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_approval_queue() TO authenticated;

COMMENT ON FUNCTION public.hr_leave_approval_queue() IS
  'Leave + short-time-off awaiting a decision, with the requester''s name, staff code and institution. Scope copies hla_select; super admins see every organisation.';
