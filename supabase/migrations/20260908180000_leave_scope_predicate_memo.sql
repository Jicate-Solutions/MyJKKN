-- Make the leave scope predicate cheap enough to run per row.
--
-- 20260908170000 introduced fn_hr_leave_scope_admits and wired it into
-- fn_leave_step_admits, which the approval queue evaluates once per row. Measured
-- immediately afterwards: 1,275 calls took 12.9 s -- about 10 ms each -- and the
-- CAO's queue went to 6.7 s. That is the same shape as the incident where an
-- unguarded per-row DEFINER predicate timed the leave queue out for 94 HODs and
-- rendered 0 records, so it is fixed before anyone meets it.
--
-- WHERE THE TIME WENT. Nothing in the predicate depends on the row except the
-- applicant, yet every call rebuilt the caller's whole world:
-- fn_my_designated_hr_org_ids(), fn_my_hr_organization_ids() -- which runs
-- role_has_institution_access(), itself several EXISTS queries, once per
-- hr_organizations row -- and fn_hr_leave_department_ids(). Three array builds
-- per row, identical on every row.
--
-- THE FIX. Compute the caller's institutions, departments and super-admin flag
-- ONCE and memo them in a TRANSACTION-LOCAL GUC (set_config with is_local =
-- true). Transaction-local is the right lifetime and the safe one: a PostgREST
-- request is one transaction, so the memo covers exactly the statement set that
-- shares an identity, and it is discarded at commit -- it cannot survive into
-- another user's request on a pooled connection. The memo also carries the uid
-- it was built for and is rebuilt if that ever fails to match.
--
-- What remains per row is an indexed staff lookup, two jsonb membership tests
-- and the rank EXISTS.

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
  v_uid   uuid := (SELECT auth.uid());
  v_raw   text;
  v_cache jsonb;
  v_scope text;
  v_inst  uuid;
  v_dept  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- No role on the step means the step is pinned or unconstrained; scope is
  -- decided by the caller, not here. Answered before the memo is even read.
  IF p_approver_role IS NULL THEN
    RETURN true;
  END IF;

  v_raw := current_setting('hr.leave_scope_cache', true);
  IF v_raw IS NOT NULL AND v_raw <> '' THEN
    v_cache := v_raw::jsonb;
    -- Belt and braces: never answer one user from another user's memo.
    IF v_cache ->> 'uid' IS DISTINCT FROM v_uid::text THEN
      v_cache := NULL;
    END IF;
  END IF;

  IF v_cache IS NULL THEN
    v_cache := jsonb_build_object(
      'uid',   v_uid::text,
      'super', COALESCE(public.is_super_admin(), false),
      -- The institutions this caller may act in FOR LEAVE. Both halves, because
      -- both admit in fn_leave_step_admits: the key-gated half honours
      -- institution_scope='all', so folding it in keeps an HR Head / CAO
      -- reaching every college even when the step names a role the scope
      -- catalogue does not list (those default to 'institution'). Without it
      -- this predicate would silently demote every key holder to their own
      -- college.
      'insts', (
        SELECT COALESCE(jsonb_agg(DISTINCT o.institution_id), '[]'::jsonb)
        FROM public.hr_organizations o
        WHERE o.id = ANY (COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[]))
           OR (
                public.user_has_permission('hr.leave.approve')
                AND o.id = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))
              )
      ),
      'depts', (
        SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb)
        FROM unnest(COALESCE(public.fn_hr_leave_department_ids(), ARRAY[]::uuid[])) x
      )
    );
    PERFORM set_config('hr.leave_scope_cache', v_cache::text, true);
  END IF;

  IF (v_cache ->> 'super')::boolean THEN
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

  IF NOT (v_cache -> 'insts' ? v_inst::text) THEN
    RETURN false;
  END IF;

  IF v_scope = 'institution' THEN
    RETURN true;
  END IF;

  -- department
  IF v_dept IS NULL THEN
    -- Staff whose record carries no department stay visible to the Principal
    -- and the CAO. A HOD is not the right desk for a request whose department
    -- nobody has recorded.
    RETURN false;
  END IF;

  IF NOT (v_cache -> 'depts' ? v_dept::text) THEN
    RETURN false;
  END IF;

  -- Does the applicant hold any role that outranks this step's role? Only
  -- reachable at scope 'department', so the comparison is against rank 1.
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.staff st
    JOIN public.user_roles ur              ON ur.user_id = st.profile_id
    JOIN public.custom_roles cr            ON cr.id = ur.role_id AND cr.is_active
    JOIN public.hr_leave_approver_scopes sc ON sc.role_key = cr.role_key
    WHERE st.id = p_employee_id
      AND st.profile_id IS NOT NULL
      AND sc.scope_level IN ('institution', 'group')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) TO service_role;

COMMENT ON FUNCTION public.fn_hr_leave_scope_admits(uuid, text) IS
  'May the caller, matching a leave step through p_approver_role, see this '
  'applicant? group = anywhere; institution = inside the institutions they '
  'reach; department = that, plus the applicant is in a department they head '
  'and does not outrank them. The caller half is memoised transaction-locally '
  'in hr.leave_scope_cache because this runs once per queue row.';
