-- Scope the HR leave approval queue to institution, department and rank.
--
-- WHAT WAS WRONG. /hr/leave/approvals lists whatever hr_leave_approval_queue()
-- returns. `hod` and `principal` hold no hr.leave.approve key, so they reached
-- the queue through fn_is_designated_leave_approver() -> fn_leave_step_admits(),
-- whose institution reach came from fn_my_designated_hr_org_ids(). Four defects,
-- each reproduced by simulating the RPC as a real production user:
--
--  1. fn_my_designated_hr_org_ids() treated two institutions sharing a
--     counselling_code as one. That is the CAS Aided/Self sibling rule -- an
--     ADMISSIONS concept -- applied to employment. The Principal of Arts and
--     Science (Aided) saw 132 rows, every one of them Arts and Science (Self),
--     and was waiting_on_me on 124 of them. Not cosmetic: fn_leave_step_admits
--     also backs the write path, so she could actually approve them.
--
--  2. There was no department axis at all. A HOD saw every request in the
--     institution sitting at a `hod` step, from every department.
--
--  3. There was no rank concept anywhere. custom_roles carries institution_scope
--     and is_privileged and nothing else, so nothing expressed "a HOD is below a
--     Principal" and nothing stopped a HOD from seeing the Principal's own leave.
--
--  4. hr_trig_leave_enforce_approver -- the WRITE gate -- re-implemented the
--     current-step role match inline with NO organisation scoping whatsoever. It
--     used fn_leave_step_admits only for the "final authority may act at any
--     point" shortcut. Any of the 118 `hod` holders group-wide could decide any
--     request sitting at a `hod` step in any institution, given the row id. The
--     write gate was strictly wider than the read gate.
--
-- THE RULE NOW. HOD -> own institution, own department, excluding anyone who
-- outranks them. Principal -> own institution, every department. CAO / HR Head ->
-- every institution (already correct via hr_head: hr.leave.approve +
-- institution_scope='all'; nothing here changes it).
--
-- HOW RANK IS EXPRESSED. hr_leave_approver_scopes maps an approver role_key to a
-- scope level. Seniority is DERIVED from that same table -- a department-scoped
-- approver may not see an applicant holding any role with a broader level -- so
-- there is no second list to keep in sync. A role absent from the table defaults
-- to 'institution', which is today's behaviour minus the sibling leak.
--
-- WHY THE CHOKEPOINT. fn_leave_step_admits is the one predicate behind the
-- queue, the mobile queue, the desk counter and the write trigger. Defect 4
-- exists precisely because the trigger grew its own copy of the rule. The scope
-- test therefore goes INSIDE that predicate, and the trigger is rewritten to use
-- it, so read and write cannot drift again.

-- ---------------------------------------------------------------------------
-- 1. The scope catalogue.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hr_leave_approver_scopes (
  role_key    text PRIMARY KEY
                REFERENCES public.custom_roles(role_key) ON DELETE CASCADE,
  scope_level text NOT NULL
                CHECK (scope_level IN ('department', 'institution', 'group')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_leave_approver_scopes IS
  'How far an approver role sees in the leave queue. department < institution < '
  'group; a role absent here defaults to institution. Also the SENIORITY '
  'ordering: a department-scoped approver never sees an applicant holding a '
  'role with a broader level, which is what keeps the Principal''s own leave '
  'request out of every HOD queue.';

ALTER TABLE public.hr_leave_approver_scopes ENABLE ROW LEVEL SECURITY;

-- One permissive policy per verb -- multiple permissive policies are ORed AND
-- all evaluated per row. Read is open to authenticated because this is the
-- config every leave gate consults; write follows the screen that owns it
-- (/hr/admin/leave-types, hr.leave.types.manage), so no new permission key and
-- therefore no role-grant migration is needed.
DROP POLICY IF EXISTS hlas_select ON public.hr_leave_approver_scopes;
CREATE POLICY hlas_select ON public.hr_leave_approver_scopes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS hlas_write ON public.hr_leave_approver_scopes;
CREATE POLICY hlas_write ON public.hr_leave_approver_scopes
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_has_permission('hr.leave.types.manage')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.user_has_permission('hr.leave.types.manage')
  );

-- Seeded only for role_keys that exist; the FK would reject the rest.
INSERT INTO public.hr_leave_approver_scopes (role_key, scope_level, notes)
SELECT v.role_key, v.scope_level, v.notes
FROM (VALUES
  ('hod',              'department',  'Own department only, and never a senior colleague.'),
  ('principal',        'institution', 'Whole own institution, every department.'),
  ('vice_principal',   'institution', 'Whole own institution, every department.'),
  ('school_principal', 'institution', 'Whole own institution, every department.'),
  ('cao',              'group',       'Every institution.'),
  ('hr_head',          'group',       'Every institution.')
) AS v(role_key, scope_level, notes)
WHERE EXISTS (SELECT 1 FROM public.custom_roles cr WHERE cr.role_key = v.role_key)
ON CONFLICT (role_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Own institution means OWN institution.
-- ---------------------------------------------------------------------------
-- The counselling_code branch is gone. Two colleges sharing a CAS code are one
-- ADMISSIONS entity, never one employer, and treating them as one let the Aided
-- Principal both see and approve 124 Self requests. Signature unchanged, so all
-- four callers (fn_leave_step_admits, fn_is_configured_leave_approver,
-- fn_my_desk_waiting and this function's own users) are fixed at once.
--
-- user_institution_access survives: that is an explicit, per-user, revocable
-- grant somebody deliberately made, not a shape inferred from a shared code.

CREATE OR REPLACE FUNCTION public.fn_my_designated_hr_org_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH own AS (
    SELECT s.institution_id AS id
    FROM public.staff s
    WHERE s.profile_id = (SELECT auth.uid()) AND s.is_active
  )
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM public.hr_organizations o
  WHERE o.included_in_hr
    AND (
      o.institution_id IN (SELECT id FROM own)
      OR o.institution_id IN (
           SELECT uia.institution_id
           FROM public.user_institution_access uia
           WHERE uia.user_id = (SELECT auth.uid()) AND uia.is_active
         )
    );
$function$;

-- ---------------------------------------------------------------------------
-- 3. The caller's departments.
-- ---------------------------------------------------------------------------
-- The HOD's OWN staff.department_id, deliberately: departments.head_of_department_id
-- is set on 7 of 82 active departments and stores profiles.id rather than
-- staff.id, so scoping on it would blank 111 of 118 HOD holders. Returns an
-- array to match the fn_my_*_ids idiom even though no profile currently has more
-- than one active staff row.

CREATE OR REPLACE FUNCTION public.fn_hr_leave_department_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT s.department_id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.profile_id = (SELECT auth.uid())
    AND s.is_active
    AND s.department_id IS NOT NULL;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The scope predicate.
-- ---------------------------------------------------------------------------
-- Takes NO caller id: a SECURITY DEFINER function must derive the caller from
-- auth.uid() itself, because a parameter is attacker-controlled.
--
-- Answers one question: may I, matching a step through the role p_approver_role,
-- see this particular applicant?
--
--   group       -> yes, wherever they work.
--   institution -> only inside the institutions I actually reach.
--   department  -> that, AND the applicant is in a department I head, AND the
--                  applicant does not outrank me.
--
-- The rank test is what keeps a Principal's own leave out of the HOD queue of
-- the department the Principal happens to be staffed in.
--
-- Every comparison is IS NULL / IS NOT NULL / IS DISTINCT FROM. `x <> NULL` is
-- neither true nor false, and in a plpgsql IF that silently skips the branch --
-- a gate that fails OPEN.

CREATE OR REPLACE FUNCTION public.fn_hr_leave_scope_admits(
  p_employee_id  uuid,
  p_approver_role text
)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_scope      text;
  v_rank       int;
  v_inst       uuid;
  v_dept       uuid;
  v_org_insts  uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- A super admin is outside this model entirely, as everywhere else in the
  -- module.
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  -- No role on the step means the step is pinned or unconstrained; scope is
  -- decided by the caller, not here.
  IF p_approver_role IS NULL THEN
    RETURN true;
  END IF;

  SELECT s.scope_level INTO v_scope
  FROM public.hr_leave_approver_scopes s
  WHERE s.role_key = p_approver_role;

  v_scope := COALESCE(v_scope, 'institution');

  IF v_scope = 'group' THEN
    RETURN true;
  END IF;

  SELECT st.institution_id, st.department_id
    INTO v_inst, v_dept
  FROM public.staff st
  WHERE st.id = p_employee_id;

  -- An applicant with no staff row has no institution to test against. Refuse
  -- rather than fall through: the row is still reachable by a group-scoped
  -- approver and by a super admin.
  IF v_inst IS NULL THEN
    RETURN false;
  END IF;

  -- The institutions this caller may act in FOR LEAVE. Both halves, because
  -- both admit in fn_leave_step_admits: the key-gated half honours
  -- institution_scope='all', so folding it in keeps an HR Head / CAO reaching
  -- every college even when the step names a role this catalogue does not list
  -- (those default to 'institution'). Without it this predicate would have
  -- silently demoted every key holder to their own college.
  SELECT COALESCE(array_agg(DISTINCT o.institution_id), ARRAY[]::uuid[])
    INTO v_org_insts
  FROM public.hr_organizations o
  WHERE o.id = ANY (COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[]))
     OR (
          public.user_has_permission('hr.leave.approve')
          AND o.id = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))
        );

  IF NOT (v_inst = ANY (v_org_insts)) THEN
    RETURN false;
  END IF;

  IF v_scope = 'institution' THEN
    RETURN true;
  END IF;

  -- department
  IF v_dept IS NULL THEN
    -- 23% of pending requests come from staff with no department. They stay
    -- visible to the Principal and the CAO; a HOD is not the right desk for a
    -- request whose department nobody has recorded.
    RETURN false;
  END IF;

  IF NOT (v_dept = ANY (COALESCE(public.fn_hr_leave_department_ids(), ARRAY[]::uuid[]))) THEN
    RETURN false;
  END IF;

  v_rank := CASE v_scope WHEN 'department' THEN 1 WHEN 'institution' THEN 2 ELSE 3 END;

  -- Does the applicant hold any role that outranks this step's role?
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.staff st
    JOIN public.user_roles ur         ON ur.user_id = st.profile_id
    JOIN public.custom_roles cr       ON cr.id = ur.role_id AND cr.is_active
    JOIN public.hr_leave_approver_scopes sc ON sc.role_key = cr.role_key
    WHERE st.id = p_employee_id
      AND st.profile_id IS NOT NULL
      AND CASE sc.scope_level
            WHEN 'department'  THEN 1
            WHEN 'institution' THEN 2
            ELSE 3
          END > v_rank
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.fn_hr_leave_department_ids() FROM public;
REVOKE ALL ON FUNCTION public.fn_hr_leave_department_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_department_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_department_ids() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The chokepoint gains the applicant.
-- ---------------------------------------------------------------------------
-- DROP then CREATE, never CREATE OR REPLACE: replacing a function with a CHANGED
-- argument list adds a SECOND overload rather than editing the first, and two
-- PostgREST-callable overloads break every call to the name.
--
-- The old ACL was {=X/postgres,...} -- PUBLIC held EXECUTE, which includes anon.
-- It is not restored. A re-created function silently re-grants EXECUTE to
-- PUBLIC, so the REVOKEs below are mandatory and must come after the CREATE.

DROP FUNCTION IF EXISTS public.fn_leave_step_admits(jsonb, uuid, uuid);

CREATE FUNCTION public.fn_leave_step_admits(
  p_step               jsonb,
  p_uid                uuid,
  p_hr_organization_id uuid,
  p_employee_id        uuid
)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fn_leave_step_approvers(p_step) e
    WHERE p_uid IS NOT NULL
      AND (
        -- Pinned: an explicit naming, reachable from any institution. Exempt
        -- from every scope test, here as in every other gate in this module --
        -- somebody chose this person for this step by name.
        e.approver_user_id = p_uid
        OR (
          e.approver_role IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = p_uid
              AND cr.role_key = e.approver_role
              AND cr.is_active
          )
          -- CASE, not AND, all the way down. AND carries no evaluation-order
          -- guarantee, and these array builds (3.7 ms each) were running once
          -- per row for callers who do not hold the key. The CASE also pins
          -- the NEW scope test (institution, department, rank) behind the
          -- organisation test, so the per-row call is reached only by rows
          -- that already matched a role this caller holds in an organisation
          -- they already reach. Nested inside the role branch, so a PINNED
          -- approver is exempt from all of it -- somebody named them.
          AND CASE
                WHEN public.is_super_admin() THEN true
                WHEN CASE
                       WHEN public.user_has_permission('hr.leave.approve')
                       THEN p_hr_organization_id = ANY (
                              COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))
                       ELSE false
                     END
                  THEN public.fn_hr_leave_scope_admits(p_employee_id, e.approver_role)
                WHEN p_hr_organization_id = ANY (
                       COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[]))
                  THEN public.fn_hr_leave_scope_admits(p_employee_id, e.approver_role)
                ELSE false
              END
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_leave_step_admits(jsonb, uuid, uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.fn_leave_step_admits(jsonb, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_leave_step_admits(jsonb, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_leave_step_admits(jsonb, uuid, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Callers, each now passing the applicant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_is_designated_leave_approver(p_application_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_leave_applications a
    WHERE a.id = p_application_id
      AND public.fn_leave_step_admits(
            a.approval_chain -> a.current_step,
            (SELECT auth.uid()),
            a.hr_organization_id,
            a.employee_id)
  );
$function$;

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
            a.approval_chain -> a.current_step,
            (SELECT auth.uid()),
            a.hr_organization_id,
            a.employee_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_hr_leave_can_finalize(p_application_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_app record;
  v_idx integer;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT a.approval_chain, a.current_step, a.status, a.employee_id, a.hr_organization_id
    INTO v_app
  FROM public.hr_leave_applications a
  WHERE a.id = p_application_id;

  IF NOT FOUND OR v_app.status NOT IN ('pending', 'escalated') THEN
    RETURN false;
  END IF;

  v_idx := public.fn_hr_leave_final_step_index(v_app.approval_chain);
  IF v_idx < 0 THEN RETURN false; END IF;

  IF v_app.current_step >= v_idx THEN RETURN false; END IF;

  IF public.is_super_admin() THEN RETURN true; END IF;

  IF v_app.employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[])) THEN
    RETURN false;
  END IF;

  RETURN public.fn_leave_step_admits(
    v_app.approval_chain -> v_idx, v_uid, v_app.hr_organization_id, v_app.employee_id);
END $function$;

-- ---------------------------------------------------------------------------
-- 7. The write gate stops being wider than the read gate.
-- ---------------------------------------------------------------------------
-- The inline WITH entries block matched a role holder with no organisation test
-- whatsoever, so the trigger admitted people the queue would never have shown.
-- `matched` now carries the same scope predicate the read path uses, for role
-- matches only -- a pinned approver stays exempt, exactly as in
-- fn_leave_step_admits.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_approver()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_step jsonb;
  v_constraining int;
  v_matched int;
  v_labels text;
  v_deciding boolean;
  v_final int;
BEGIN
  v_deciding := (NEW.status IN ('approved','rejected') AND OLD.status IS DISTINCT FROM NEW.status)
             OR (COALESCE(NEW.current_step, 0) > COALESCE(OLD.current_step, 0));

  IF NOT v_deciding THEN RETURN NEW; END IF;
  IF public.is_super_admin() THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  IF OLD.employee_id IN (SELECT unnest(public.fn_my_staff_ids())) THEN
    RAISE EXCEPTION 'You cannot decide on your own leave application.';
  END IF;

  -- THE FINAL AUTHORITY MAY ACT AT ANY POINT. Without this the CAO on step 3
  -- is refused while the request sits on step 1, and a direct approval is
  -- impossible. Deliberately checked BEFORE the current-step test so it also
  -- covers a rejection by the final approver.
  v_final := public.fn_hr_leave_final_step_index(OLD.approval_chain);
  IF v_final >= 0
     AND public.fn_leave_step_admits(
           OLD.approval_chain -> v_final, v_uid, OLD.hr_organization_id, OLD.employee_id) THEN
    RETURN NEW;
  END IF;

  v_step := OLD.approval_chain -> OLD.current_step;
  IF v_step IS NULL THEN RETURN NEW; END IF;

  WITH entries AS (
    SELECT
      (cr.role_key IS NOT NULL OR e.approver_user_id IS NOT NULL) AS constraining,
      (
        e.approver_user_id = v_uid
        OR (cr.role_key IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              JOIN public.custom_roles cr2 ON cr2.id = ur.role_id
              WHERE ur.user_id = v_uid AND cr2.role_key = e.approver_role AND cr2.is_active
            )
            -- The organisation/department/rank test the read path applies. Its
            -- absence here is what let any of 118 hod holders decide a `hod`
            -- step in any institution.
            AND public.fn_hr_leave_scope_admits(OLD.employee_id, e.approver_role))
      ) AS matched,
      COALESCE(cr.role_name, 'the assigned approver') AS label
    FROM public.fn_leave_step_approvers(v_step) e
    LEFT JOIN public.custom_roles cr ON cr.role_key = e.approver_role AND cr.is_active
  )
  SELECT count(*) FILTER (WHERE constraining), count(*) FILTER (WHERE matched),
         string_agg(DISTINCT label, ' or ')
  INTO v_constraining, v_matched, v_labels
  FROM entries;

  IF COALESCE(v_constraining, 0) = 0 THEN RETURN NEW; END IF;
  IF COALESCE(v_matched, 0) > 0 THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'This approval step is reserved for %.', COALESCE(v_labels, 'a different approver');
END
$function$;

-- ---------------------------------------------------------------------------
-- 8. The mobile queue.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hr_leave_my_approval_queue(p_hr_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(application_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.id
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types lt ON lt.id = a.leave_type_id
  CROSS JOIN LATERAL (SELECT a.approval_chain -> a.current_step AS step) s
  WHERE a.status IN ('pending', 'escalated')
    AND (p_hr_organization_id IS NULL OR a.hr_organization_id = p_hr_organization_id)
    AND a.hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    AND a.employee_id NOT IN (SELECT unnest(public.fn_my_staff_ids()))
    AND (
      public.is_super_admin()
      OR (
        public.hr_can_approve_leave()
        AND (
          s.step IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.fn_leave_step_approvers(s.step) e
            LEFT JOIN public.custom_roles cr
                   ON cr.role_key = e.approver_role AND cr.is_active
            WHERE e.approver_user_id IS NOT NULL OR cr.role_key IS NOT NULL
          )
          OR public.fn_leave_step_admits(s.step, v_uid, a.hr_organization_id, a.employee_id)
        )
      )
      OR public.fn_leave_step_admits(s.step, v_uid, a.hr_organization_id, a.employee_id)
    );
END $function$;

-- ---------------------------------------------------------------------------
-- 9. The queue itself, now carrying the department.
-- ---------------------------------------------------------------------------
-- DROP + CREATE because the return type changes. The ACL is restored explicitly
-- below: a DROP takes it with it, and the re-CREATE would otherwise hand PUBLIC
-- (hence anon) EXECUTE on a SECURITY DEFINER function.
--
-- department_id/department_name are returned so the Principal's institution-wide
-- list can be cut by department in the UI. They are the APPLICANT's, read from
-- the same staff row that already supplies institution_id.

DROP FUNCTION IF EXISTS public.hr_leave_approval_queue();

CREATE FUNCTION public.hr_leave_approval_queue()
 RETURNS TABLE(id uuid, employee_id uuid, staff_name text, staff_code text, institution_id uuid, institution_name text, department_id uuid, department_name text, hr_organization_id uuid, hr_organization_name text, leave_type_id uuid, leave_type_name text, leave_type_code text, request_category text, start_date date, end_date date, start_time time without time zone, end_time time without time zone, duration_type text, duration_minutes integer, total_days numeric, reason text, is_emergency boolean, status text, created_at timestamp with time zone, applied_by uuid, applied_by_name text, applied_on_behalf boolean, final_approver_id uuid, final_approver_name text, final_decided_at timestamp with time zone, rejection_reason text, is_own boolean, can_decide boolean, waiting_on_me boolean, biometric_gap_from date, documents jsonb, current_step integer, chain_length integer, step_is_final boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
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
    (a.current_step = public.fn_hr_leave_final_step_index(a.approval_chain)) AS step_is_final
  FROM public.hr_leave_applications a
  LEFT JOIN public.hr_leave_types   lt ON lt.id = a.leave_type_id
  LEFT JOIN public.staff            s  ON s.id  = a.employee_id
  LEFT JOIN public.institutions     i  ON i.id  = s.institution_id
  LEFT JOIN public.departments      d  ON d.id  = s.department_id
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

REVOKE ALL ON FUNCTION public.hr_leave_approval_queue() FROM public;
REVOKE ALL ON FUNCTION public.hr_leave_approval_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_approval_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_leave_approval_queue() TO service_role;

-- ---------------------------------------------------------------------------
-- 10. The desk counter.
-- ---------------------------------------------------------------------------
-- Its leave CTE inlines fn_leave_step_admits set-based on purpose: the four
-- helper calls are hoisted out of the row loop. The new scope test cannot be
-- hoisted -- it depends on the applicant -- so it is added as a per-row call
-- placed LAST and wrapped in CASE, never ANDed. AND carries no evaluation-order
-- guarantee, and an unguarded per-row DEFINER predicate in exactly this area
-- previously timed the queue out for 94 HODs and rendered 0 records. The CASE
-- runs it only for rows that have already passed the cheap set-based tests.

CREATE OR REPLACE FUNCTION public.fn_my_desk_waiting()
 RETURNS TABLE(source text, item_id uuid, title text, detail text, amount numeric, waiting_since timestamp with time zone, age_days integer, href text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid                uuid := (SELECT auth.uid());
  v_is_super           boolean;
  v_is_admin           boolean;
  v_has_leave_perm     boolean;
  v_has_recruit_edit   boolean;
  v_has_recruit_view   boolean;
  v_org_ids            uuid[];
  v_designated_org_ids uuid[];
  v_staff_ids          uuid[];
BEGIN
  -- No identity, no answer. Every branch below is keyed on v_uid, so a NULL
  -- would match nothing anyway — but returning here keeps the helper calls
  -- (fn_my_hr_organization_ids and friends) from running for nobody.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_is_super       := COALESCE(public.is_super_admin(), false);
  v_is_admin       := COALESCE(public.is_admin(), false);
  -- Computed ONCE. All are SECURITY DEFINER helpers keyed on auth.uid(); the
  -- leave rule (fn_leave_step_admits) calls them per row, which is the cost
  -- this function avoids. These four together are the inputs of that rule.
  v_has_leave_perm     := COALESCE(public.user_has_permission('hr.leave.approve'), false);
  -- The recruitment module's own management key — the gate the 'offer' branch
  -- mirrors (see the header). Computed once, like the rest. .view is required
  -- alongside .edit because the row is a LINK into a page every one of whose
  -- screens gates on .view; today the .edit set is a strict subset of the
  -- .view set, so the conjunct removes no row from anyone's desk.
  v_has_recruit_edit   := COALESCE(public.user_has_permission('hr.recruitment.edit'), false);
  v_has_recruit_view   := COALESCE(public.user_has_permission('hr.recruitment.view'), false);
  v_org_ids            := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_designated_org_ids := COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[]);
  v_staff_ids          := COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]);

  RETURN QUERY
  WITH my_roles AS (
    -- Multi-role, OR-merged. role_key kept in BOTH cases: recruitment matches
    -- lower() (its RPC does), leave matches exact (fn_leave_step_admits does).
    SELECT cr.id AS role_id, cr.role_key, lower(cr.role_key) AS role_key_lc,
           cr.role_name, cr.is_active
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
  ),

  -- 1. RECRUITMENT — mirrors fn_list_my_pending_recruitment(p_user_id).
  recruitment AS (
    SELECT
      'recruitment'::text                                  AS source,
      c.id                                                 AS item_id,
      c.name || ' — ' || c.role_title                      AS title,
      CASE
        WHEN (s.step ->> 'approver_user_id') = v_uid::text THEN 'pinned to you by name'
        ELSE 'you hold role ' || COALESCE(s.step ->> 'approver_role', '?')
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      c.submitted_at                                       AS waiting_since,
      '/hr/recruitment/approvals'::text                    AS href
    FROM public.hr_recruitment_candidates c
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(c.approval_chain) = 'array'
         AND jsonb_array_length(c.approval_chain) > 0
         AND c.current_step >= 0
        THEN c.approval_chain -> c.current_step
      END AS step
    ) s
    WHERE c.status IN ('submitted', 'pending_approval')
      AND s.step IS NOT NULL
      AND (
        (s.step ->> 'approver_user_id') = v_uid::text
        OR (
          (s.step ->> 'approver_user_id') IS NULL
          AND lower(s.step ->> 'approver_role') IN (SELECT role_key_lc FROM my_roles)
        )
      )
  ),

  -- 2. REFUND — mirrors the stage predicate (fn_refund_assignee_match) that the
  --    refund RLS and stage-action panel already use.
  refund AS (
    SELECT
      'refund'::text                                       AS source,
      r.id                                                 AS item_id,
      r.request_number || ' — '
        || COALESCE(NULLIF(trim(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), ''),
                    'learner')                             AS title,
      CASE
        WHEN COALESCE(s.stage -> 'assignee_users' ? v_uid::text, false) THEN 'pinned to you by name'
        ELSE 'you hold role ' || COALESCE((
          SELECT string_agg(mr.role_name, ', ' ORDER BY mr.role_name)
          FROM my_roles mr
          WHERE COALESCE(s.stage -> 'assignee_roles' ? mr.role_id::text, false)
        ), '?')
      END                                                  AS detail,
      r.total_refund_amount                                AS amount,
      COALESCE(r.initiated_at, r.created_at)               AS waiting_since,
      '/billing/refunds'::text                             AS href
    FROM public.billing_refund_requests r
    LEFT JOIN public.learners_profiles lp ON lp.id = r.student_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(r.flow_snapshot -> 'stages') = 'array'
         AND r.current_stage_index >= 0
        THEN r.flow_snapshot -> 'stages' -> r.current_stage_index
      END AS stage
    ) s
    WHERE r.status = 'pending_review'
      AND s.stage IS NOT NULL
      AND public.fn_refund_assignee_match(s.stage -> 'assignee_roles', s.stage -> 'assignee_users', v_uid)
  ),

  -- 3. LEAVE — fn_leave_step_admits (20260831140000) minus its super-admin
  --    "may act" clause, set-based: the same four inputs (hr.leave.approve,
  --    fn_my_hr_organization_ids, fn_my_designated_hr_org_ids, fn_my_staff_ids)
  --    evaluated once above instead of per row. The step is read through
  --    fn_leave_step_approvers exactly as the rule does, so a legacy single
  --    approver step and a multi-approver / ladder step resolve identically.
  --
  --    The scope test (institution/department/rank) CANNOT be hoisted -- it is
  --    per applicant -- so it is a CASE at the very end, entered only for rows
  --    that already matched a role and an organisation.
  leave AS (
    SELECT
      'leave'::text                                        AS source,
      a.id                                                 AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — ' || to_char(a.start_date::date, 'DD Mon')
        || ' to ' || to_char(a.end_date::date, 'DD Mon YYYY')    AS title,
      CASE
        WHEN m.pinned_to_me THEN 'pinned to you by name'
        ELSE 'you hold role ' || m.my_step_roles
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      a.created_at                                         AS waiting_since,
      '/hr/leave/approvals'::text                          AS href
    FROM public.hr_leave_applications a
    LEFT JOIN public.staff st ON st.id = a.employee_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(a.approval_chain) = 'array'
         AND a.current_step >= 0
        THEN a.approval_chain -> a.current_step
      END AS step
    ) s
    CROSS JOIN LATERAL (
      -- One pass over the step's approver entries: am I named, which of the
      -- step's roles do I actively hold (fn_leave_step_admits: exact role_key,
      -- cr.is_active), and -- for the scope test below -- ONE of those role
      -- keys, since every role I hold on this step shares the step.
      SELECT
        COALESCE(bool_or(e.approver_user_id = v_uid), false)           AS pinned_to_me,
        string_agg(DISTINCT e.approver_role, '/')
          FILTER (WHERE e.approver_role IS NOT NULL
                    AND e.approver_role IN (SELECT role_key FROM my_roles WHERE is_active))
                                                                        AS my_step_roles,
        min(e.approver_role)
          FILTER (WHERE e.approver_role IS NOT NULL
                    AND e.approver_role IN (SELECT role_key FROM my_roles WHERE is_active))
                                                                        AS scope_role
      FROM public.fn_leave_step_approvers(s.step) e
    ) m
    WHERE a.status IN ('pending', 'escalated')
      AND s.step IS NOT NULL
      AND NOT (a.employee_id = ANY (v_staff_ids))
      AND (
        -- PINNED: an explicit naming, reachable from any institution.
        m.pinned_to_me
        OR (
          -- ROLE: only inside institutions I genuinely reach (140000's rule,
          -- without the is_super_admin() clause — see the header).
          m.my_step_roles IS NOT NULL
          AND (
            (v_has_leave_perm AND a.hr_organization_id = ANY (v_org_ids))
            OR a.hr_organization_id = ANY (v_designated_org_ids)
          )
          -- CASE, not AND: keeps the per-row DEFINER call off every row that
          -- failed the cheap tests above.
          AND CASE
                WHEN v_is_super THEN true
                ELSE public.fn_hr_leave_scope_admits(a.employee_id, m.scope_role)
              END
        )
      )
  ),

  -- 4. MEETING TRIGGER — /meetings/triggers gate + the console's DECIDABLE set,
  --    restricted to rows decidable NOW (deadline passed, already explained, or
  --    no deadline ever stamped). A broadcast: identical for every admin.
  meeting_trigger AS (
    SELECT
      'meeting_trigger'::text                              AS source,
      e.id                                                 AS item_id,
      e.metric_key || COALESCE(' — ' || e.subject_label, '') AS title,
      'admin/super_admin gate — shown to every admin'::text AS detail,
      NULL::numeric                                        AS amount,
      COALESCE(e.explanation_deadline, e.created_at)       AS waiting_since,
      '/meetings/triggers'::text                           AS href
    FROM public.meeting_trigger_events e
    WHERE (v_is_super OR v_is_admin)
      AND e.director_decision IS NULL
      AND e.status IN ('notified', 'explained', 'meeting_pending')
      AND (
        e.explanation_deadline IS NULL
        OR e.explanation_deadline < now()
        OR e.status = 'explained'
      )
  ),

  -- 5. GRIEVANCE — unassigned and live, exactly as director-signals.ts reads it;
  --    super admin only (Director fallback). A broadcast: identical for every
  --    super admin.
  grievance AS (
    SELECT
      'grievance'::text                                    AS source,
      g.id                                                 AS item_id,
      g.ticket_number || ' — ' || g.subject                AS title,
      'no assignee — Director fallback, shown to every super admin'::text AS detail,
      NULL::numeric                                        AS amount,
      g.created_at                                         AS waiting_since,
      '/learners-council/issues'::text                     AS href
    FROM public.grievance_tickets g
    WHERE v_is_super
      AND g.assigned_to IS NULL
      AND g.resolved_at IS NULL
      AND g.withdrawn_at IS NULL
  ),

  -- 6. OFFER — salary agreed, nobody has started onboarding. Not a chain row:
  --    at 'package_fixed' the chain is complete and no approver is derivable,
  --    so this branch asks who may do the NEXT ACT in this college instead.
  --    Gate mirrored: hr.recruitment.edit + .view (the module's own management
  --    key, plus the key every page in the module requires to open at all —
  --    the status route itself enforces nothing beyond authentication; see the
  --    header for what was read and why that was not mirrored literally).
  --    Scoped on hr_organization_id (NOT NULL here), never institution_id:
  --    role_has_institution_access(NULL) is unconditionally TRUE, so scoping on
  --    a nullable institution_id would show the two NULL rows to every .edit
  --    holder in every college.
  offer AS (
    SELECT
      'offer'::text                                        AS source,
      c.id                                                 AS item_id,
      -- role_title is NOT NULL on this table, so a naked concat is safe here
      -- exactly as it is in the recruitment branch above.
      c.name || ' — ' || c.role_title                      AS title,
      -- The detail must not assert something the row's own data contradicts.
      -- SARANYA R (26d) already has an onboarding checklist started — telling
      -- her college "nobody has started onboarding" would be false — and the
      -- two oldest rows have no job linked, so the page that starts onboarding
      -- cannot be reached from them at all. Three states, three sentences.
      CASE
        WHEN jsonb_typeof(c.role_specific_details) = 'object'
             AND (c.role_specific_details->>'onboarding_started_at') IS NOT NULL
          THEN 'salary agreed — onboarding started, not finished'
        WHEN jsonb_typeof(c.role_specific_details) = 'object'
             AND c.role_specific_details->>'job_id'
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN 'salary agreed — nobody has started onboarding'
        ELSE 'salary agreed — onboarding not started, and no job is linked'
      END                                                  AS detail,
      -- The agreed figure lives on a package row, not on the candidate.
      NULL::numeric                                        AS amount,
      -- submitted_at, not updated_at: a BEFORE UPDATE trigger resets the latter.
      c.submitted_at                                       AS waiting_since,
      -- Point at the page that CAN act. The job workspace gates "Start
      -- Onboarding" on exactly this status; the candidate page renders no
      -- control for it. The link to the job is a soft JSONB value with no
      -- foreign key, so the uuid shape is required before a path is built —
      -- a junk value falls back rather than producing a broken URL, and a
      -- missing key yields NULL (NULL ~ pattern is NULL, not true).
      -- ~* not ~: Postgres regex matching is case-sensitive and the class is
      -- lowercase-only, so an upper- or mixed-case uuid from any client would
      -- silently take the ELSE branch and route a live candidate to the page
      -- with no control. Nothing constrains the shape of this JSONB value.
      -- jsonb_typeof guard for the same reason every other jsonb read in this
      -- file carries one: the column is NOT NULL but may hold a scalar.
      CASE
        WHEN jsonb_typeof(c.role_specific_details) = 'object'
             AND c.role_specific_details->>'job_id'
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN '/hr/recruitment/approvals/' || (c.role_specific_details->>'job_id')
        ELSE '/hr/recruitment/candidates/' || c.id::text
      END                                                  AS href
    FROM public.hr_recruitment_candidates c
    WHERE v_has_recruit_edit
      AND v_has_recruit_view
      AND c.status = 'package_fixed'
      -- The SECOND half of workspace-candidates-tab's isPostApproval. Today it
      -- can never fire — onboard-to-staff writes staff_record_id and
      -- status='joined' in ONE update, so 'package_fixed' + staff_record_id is
      -- unreachable, and 0 of 34 candidates carry the key at all. Encoded so
      -- that the branch is the WHOLE gate it claims to mirror rather than half
      -- of it, and so a future partial write cannot strand an uncleanable row.
      AND (jsonb_typeof(c.role_specific_details) <> 'object'
           OR (c.role_specific_details->>'staff_record_id') IS NULL)
      AND c.hr_organization_id = ANY (v_org_ids)
  ),

  everything AS (
    SELECT * FROM recruitment
    UNION ALL SELECT * FROM refund
    UNION ALL SELECT * FROM leave
    UNION ALL SELECT * FROM meeting_trigger
    UNION ALL SELECT * FROM grievance
    UNION ALL SELECT * FROM offer
  )
  SELECT
    x.source,
    x.item_id,
    x.title,
    x.detail,
    x.amount,
    x.waiting_since,
    -- Floored at 0: an 'explained' trigger whose deadline is still ahead is
    -- decidable today, not in negative days.
    GREATEST(0, floor(extract(epoch FROM (now() - COALESCE(x.waiting_since, now()))) / 86400))::integer AS age_days,
    x.href
  FROM everything x
  ORDER BY x.waiting_since ASC NULLS LAST, x.source, x.item_id
  LIMIT 500;
END;
$function$;
