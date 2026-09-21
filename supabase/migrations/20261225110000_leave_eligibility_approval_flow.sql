-- ============================================================================
-- Leave eligibility — a dedicated, configurable approver flow
-- 2026-09-21
-- ----------------------------------------------------------------------------
-- WHY. An eligibility request (proof of PH.D enrolment, say) is decided by a
-- different set of people from the leave itself: the HR Head reads the
-- certificate once, the HOD → Principal chain then approves each leave. Until
-- now LeaveEligibilityService.request() froze the LEAVE flow onto the request,
-- so there was nowhere to say who reads the proof.
--
-- THE SHAPE. A second flow_for value on hr_approval_flows, 'leave_eligibility',
-- with the same JSONB steps, the same editor, the same fn_leave_step_admits
-- gate and the same applyDecision(). conditions = {leave_type_id} for a
-- per-type flow or {} for the institution catch-all. NO teaching /
-- non-teaching split: eligibility is about the document, not the person's
-- category, and a CHECK below keeps that true until somebody decides otherwise.
--
-- FALLBACK, NOT A WALL. A gated type with no eligibility flow keeps routing
-- to its leave flow, exactly as before this migration — so nothing changes for
-- anybody until HR configures one.
--
-- THREE THINGS SILENTLY BREAK A SECOND flow_for, and they are the point of
-- this file:
--   1. hr_approval_flows_leave_read admits only 'leave_approval', so staff
--      could not read the eligibility flow and the chain would fall back every
--      time, with no error anywhere.
--   2. fn_is_configured_leave_approver scans only 'leave_approval', so a
--      person named ONLY on an eligibility flow never sees the Eligibility tab.
--   3. hr_approval_flows_leave_slot_uniq is 'leave_approval'-only, so two
--      active eligibility flows for one type could coexist.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Staff may read the eligibility flow that governs them
-- ─────────────────────────────────────────────────────────────────────────────
-- Writes stay under hr_approval_flows_tenant_isolation, unchanged — the same
-- gate the leave flows have today.
DROP POLICY IF EXISTS hr_approval_flows_leave_read ON public.hr_approval_flows;
CREATE POLICY hr_approval_flows_leave_read
  ON public.hr_approval_flows
  FOR SELECT
  USING (
    flow_for IN ('leave_approval', 'leave_eligibility')
    AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Shape: no staff group, one active flow per (organization, type)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hr_approval_flows
  DROP CONSTRAINT IF EXISTS hr_approval_flows_eligibility_no_group_chk;

ALTER TABLE public.hr_approval_flows
  ADD CONSTRAINT hr_approval_flows_eligibility_no_group_chk CHECK (
    flow_for <> 'leave_eligibility'
    OR conditions ->> 'staff_group' IS NULL
  );

-- COALESCE to '' so the catch-all (no leave_type_id) occupies a slot too;
-- a NULL in a unique index never collides with anything.
DROP INDEX IF EXISTS public.hr_approval_flows_eligibility_slot_uniq;
CREATE UNIQUE INDEX hr_approval_flows_eligibility_slot_uniq
  ON public.hr_approval_flows (
    hr_organization_id,
    (COALESCE(conditions ->> 'leave_type_id', ''))
  )
  WHERE flow_for = 'leave_eligibility' AND is_active AND valid_until IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Who sees the Eligibility tab
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrors fn_is_configured_leave_approver against the eligibility flows: pinned
-- by name anywhere, or holding a step's role inside an organisation the caller
-- reaches. auth.uid() is read inside, never passed in.
CREATE OR REPLACE FUNCTION public.fn_is_configured_eligibility_approver()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH my_roles AS (
    SELECT cr.role_key
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id AND cr.is_active
    WHERE ur.user_id = auth.uid()
  ),
  f AS (
    SELECT af.hr_organization_id, af.steps, af.role_ladder, af.fallback_approver,
           af.hr_organization_id = ANY (
             COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[])) AS mine
    FROM public.hr_approval_flows af
    WHERE af.flow_for = 'leave_eligibility' AND af.is_active AND af.valid_until IS NULL
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM f
    WHERE
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(f.steps,'[]'::jsonb)) st
        CROSS JOIN LATERAL public.fn_leave_step_approvers(st) e
        WHERE e.approver_user_id = auth.uid()
      )
      OR NULLIF(f.fallback_approver->>'approver_user_id','')::uuid = auth.uid()
      OR (
        f.mine
        AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(f.steps,'[]'::jsonb)) st
            CROSS JOIN LATERAL public.fn_leave_step_approvers(st) e
            JOIN my_roles r ON r.role_key = e.approver_role
          )
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(f.role_ladder,'[]'::jsonb)) rung
            JOIN my_roles r ON r.role_key = rung
          )
          OR EXISTS (
            SELECT 1 FROM my_roles r
            WHERE r.role_key = NULLIF(f.fallback_approver->>'approver_role','')
          )
        )
      )
  );
$function$;

COMMENT ON FUNCTION public.fn_is_configured_eligibility_approver() IS
  'Is the caller named — by person or by role — on any active leave_eligibility flow? Mirror of fn_is_configured_leave_approver.';

-- Somebody on the current step of a request already in flight — needed when
-- the flow that named them has since been edited or cleared.
CREATE OR REPLACE FUNCTION public.fn_is_any_eligibility_approver()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_leave_eligibilities e
    WHERE e.status = 'pending'
      AND public.fn_leave_step_admits(
            e.approval_chain -> e.current_step,
            (SELECT auth.uid()),
            e.hr_organization_id,
            e.employee_id)
  );
$function$;

COMMENT ON FUNCTION public.fn_is_any_eligibility_approver() IS
  'Is the caller on the current step of any pending eligibility request? Mirror of fn_is_any_leave_approver.';

-- Anyone who can approve leave can reach the tab (the fallback routes
-- eligibility to them), plus anyone the eligibility flows name.
CREATE OR REPLACE FUNCTION public.hr_can_decide_eligibility()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.hr_can_approve_leave()
      OR public.fn_is_configured_eligibility_approver()
      OR public.fn_is_any_eligibility_approver();
$function$;

COMMENT ON FUNCTION public.hr_can_decide_eligibility() IS
  'Should this caller see HR → Leave → Eligibility? True for every leave approver and for anyone an eligibility flow names.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Who to notify when a request is filed
-- ─────────────────────────────────────────────────────────────────────────────
-- Reads approvers[] through fn_leave_step_approvers, so EVERY approver on a
-- multi-approver step is a recipient — deliberately not the singular-field
-- shape of hr_leave_step_approver_user_ids, which drops approver #2.
--
-- SERVICE ROLE ONLY. It is called from a server route with the service client
-- after the insert; there is no reason for a browser session to enumerate who
-- holds a role. auth.role(), never current_user: inside SECURITY DEFINER
-- current_user is the OWNER and would pass for everybody.
CREATE OR REPLACE FUNCTION public.fn_hr_eligibility_step_approver_user_ids(p_eligibility_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'fn_hr_eligibility_step_approver_user_ids is server-only'
      USING ERRCODE = '42501';
  END IF;

  WITH req AS (
    SELECT o.institution_id,
           e.approval_chain -> e.current_step AS step
    FROM public.hr_leave_eligibilities e
    JOIN public.hr_organizations o ON o.id = e.hr_organization_id
    WHERE e.id = p_eligibility_id
  ),
  appr AS (
    SELECT a.approver_user_id, a.approver_role, req.institution_id
    FROM req
    CROSS JOIN LATERAL public.fn_leave_step_approvers(req.step) a
  )
  SELECT COALESCE(array_agg(DISTINCT x.uid), ARRAY[]::uuid[])
    INTO v_ids
  FROM (
    -- Pinned by name: reachable from any institution.
    SELECT appr.approver_user_id AS uid
    FROM appr
    WHERE appr.approver_user_id IS NOT NULL

    UNION ALL

    -- A role: its holders staffed at, or granted access to, this institution.
    SELECT p.id
    FROM appr
    JOIN public.staff s ON s.institution_id = appr.institution_id AND COALESCE(s.is_active, true)
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE appr.approver_user_id IS NULL
      AND appr.approver_role IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p.id AND cr.is_active AND cr.role_key = appr.approver_role
      )

    UNION ALL

    SELECT uia.user_id
    FROM appr
    JOIN public.user_institution_access uia
      ON uia.institution_id = appr.institution_id AND uia.is_active
    WHERE appr.approver_user_id IS NULL
      AND appr.approver_role IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = uia.user_id AND cr.is_active AND cr.role_key = appr.approver_role
      )
  ) x
  WHERE x.uid IS NOT NULL;

  RETURN v_ids;
END $function$;

COMMENT ON FUNCTION public.fn_hr_eligibility_step_approver_user_ids(uuid) IS
  'profiles.id of everyone on the current step of one eligibility request — the leave_eligibility notification recipients. Service role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Locks
-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase grants
-- anon directly, so both are named.
REVOKE EXECUTE ON FUNCTION public.fn_is_configured_eligibility_approver() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_configured_eligibility_approver() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_is_any_eligibility_approver() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_any_eligibility_approver() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.hr_can_decide_eligibility() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_can_decide_eligibility() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_hr_eligibility_step_approver_user_ids(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_eligibility_step_approver_user_ids(uuid) TO service_role;
