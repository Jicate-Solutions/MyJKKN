-- ============================================================================
-- Leave approval flows — optional Teaching / Non-teaching split
-- 2026-09-19
-- ----------------------------------------------------------------------------
-- WHY. One leave type has ONE approval flow today, so an institution that wants
-- its non-teaching requests to go to one named person while teaching staff keep
-- the HOD→Principal→CAO chain has nowhere to say so.
--
-- THE MODEL IS AN OVERRIDE, NOT A SPLIT. The flow that exists today keeps
-- governing everyone and is relabelled "All staff". A Teaching and/or a
-- Non-teaching flow may be added; a group with no flow of its own keeps using
-- All staff. With no group flows saved anywhere — which is the state this
-- migration lands in — every request resolves to exactly the flow it resolves
-- to now.
--
-- THE DISCRIMINATOR is staff.category_id → employment_categories.is_teaching.
-- That is the documented teaching/non-teaching axis and it is set for every
-- active member of staff. A person whose category cannot be read resolves to
-- NULL and therefore to the All staff flow — never to an arbitrary group.
--
-- ONE RULE, THREE CALLERS. The flow is picked in three places that must agree
-- (LeaveService.buildApprovalChain at apply time, the drift/resync RPCs behind
-- the "Re-route pending requests?" offer, and the editor). Before this
-- migration each re-implemented "type match, else catch-all". They now all
-- defer to fn_hr_leave_pick_flow_for_group, so the precedence rule exists once.
--
-- PRECEDENCE, for an applicant in group G:
--   1. this leave type + G
--   2. this leave type + All staff
--   3. institution catch-all + G
--   4. institution catch-all + All staff
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The group of one member of staff
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: the only callers are the SECURITY DEFINER
-- functions below, which have already decided the caller may ask. Left as
-- DEFINER it would become a way to probe staff rows RLS hides.
CREATE OR REPLACE FUNCTION public.fn_hr_staff_group(p_employee_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
           WHEN ec.is_teaching IS TRUE  THEN 'teaching'
           WHEN ec.is_teaching IS FALSE THEN 'non_teaching'
           ELSE NULL
         END
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_employee_id;
$function$;

COMMENT ON FUNCTION public.fn_hr_staff_group(uuid) IS
  'The teaching / non_teaching group of one member of staff, from employment_categories.is_teaching. NULL when the category is unset or unreadable, which resolves to the All staff flow.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The precedence rule — the ONE definition
-- ─────────────────────────────────────────────────────────────────────────────
-- p_staff_group NULL (group unknown) matches only rows with no staff_group,
-- because `conditions ->> 'staff_group' = NULL` is NULL and therefore not true.
-- An unknown group can only ever land on All staff, which is the safe side.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_pick_flow_for_group(
  p_hr_org_id uuid,
  p_leave_type_id uuid,
  p_staff_group text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT af.id
  FROM public.hr_approval_flows af
  WHERE af.hr_organization_id = p_hr_org_id
    AND af.flow_for = 'leave_approval'
    AND af.is_active
    AND af.valid_until IS NULL
    AND (af.conditions ->> 'leave_type_id' IS NULL
         OR (af.conditions ->> 'leave_type_id')::uuid = p_leave_type_id)
    AND (af.conditions ->> 'staff_group' IS NULL
         OR af.conditions ->> 'staff_group' = p_staff_group)
  ORDER BY
    (af.conditions ->> 'leave_type_id' IS NOT NULL) DESC,
    (af.conditions ->> 'staff_group'   IS NOT NULL) DESC,
    af.created_at
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_pick_flow_for_group(uuid, uuid, text) IS
  'The one precedence rule for leave approval flows: type+group, then type+all, then catch-all+group, then catch-all+all. Every caller defers to this so apply, re-route and the editor cannot disagree.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The gated entry point — flow for THIS employee
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read the employee's category through RLS, which
-- means the employee id is an untrusted argument and the gate must decide
-- whether the caller may ask about that person at all. Copied from
-- hr_resolve_leave_ladder, plus service_role for the chain-rebuild script.
--
-- auth.role(), never current_user: inside a SECURITY DEFINER function
-- current_user is the OWNER, so a current_user test would pass for everybody.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_pick_flow(
  p_hr_org_id uuid,
  p_leave_type_id uuid,
  p_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_may boolean;
BEGIN
  v_may := public.is_super_admin()
        OR auth.role() = 'service_role'
        OR p_employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]))
        OR public.user_has_permission('hr.leave.approve')
        OR public.user_has_permission('hr.leave.types.manage');

  -- COALESCE, not a bare NOT: a NULL from any of the checks above would make
  -- `NOT v_may` NULL, the IF would not fire, and the gate would pass silently.
  IF NOT COALESCE(v_may, false) THEN
    RAISE EXCEPTION 'Not authorized to resolve the leave approval flow for this employee.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public.fn_hr_leave_pick_flow_for_group(
    p_hr_org_id,
    p_leave_type_id,
    public.fn_hr_staff_group(p_employee_id)
  );
END $function$;

COMMENT ON FUNCTION public.fn_hr_leave_pick_flow(uuid, uuid, uuid) IS
  'The leave approval flow governing one employee''s request, applying the teaching / non-teaching precedence. Gated like hr_resolve_leave_ladder because the employee id is caller-supplied.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Constrain the new condition, and keep one flow per slot
-- ─────────────────────────────────────────────────────────────────────────────
-- Existing rows carry no staff_group, so they satisfy this as written.
ALTER TABLE public.hr_approval_flows
  DROP CONSTRAINT IF EXISTS hr_approval_flows_leave_staff_group_chk;

ALTER TABLE public.hr_approval_flows
  ADD CONSTRAINT hr_approval_flows_leave_staff_group_chk CHECK (
    flow_for <> 'leave_approval'
    OR conditions ->> 'staff_group' IS NULL
    OR conditions ->> 'staff_group' IN ('teaching', 'non_teaching')
  );

-- One ACTIVE flow per (organization, leave type, group). Verified 0 violations
-- before adding. hr_policy_restore supersedes a flow (sets valid_until) before
-- inserting its replacement, so the partial predicate keeps that path working.
DROP INDEX IF EXISTS public.hr_approval_flows_leave_slot_uniq;

CREATE UNIQUE INDEX hr_approval_flows_leave_slot_uniq
  ON public.hr_approval_flows (
    hr_organization_id,
    (COALESCE(conditions ->> 'leave_type_id', '')),
    (COALESCE(conditions ->> 'staff_group', ''))
  )
  WHERE flow_for = 'leave_approval' AND is_active AND valid_until IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Drift / resync scope now asks the resolver
-- ─────────────────────────────────────────────────────────────────────────────
-- Same signatures, same gates, same skip rules. Only the "which pending
-- requests does this flow govern?" predicate changes: it used to re-implement
-- "type match, or catch-all where no type flow exists", which cannot see a
-- group flow standing between the two. An application belongs to this flow iff
-- the resolver picks this flow for it — so it now asks.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_pending_chain_drift(p_flow_id uuid)
 RETURNS TABLE(eligible integer, skipped_decided integer, skipped_locked integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org  uuid;
BEGIN
  SELECT af.hr_organization_id
    INTO v_org
  FROM public.hr_approval_flows af
  WHERE af.id = p_flow_id
    AND af.flow_for = 'leave_approval'
    AND af.is_active
    AND af.valid_until IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active leave approval flow with id %', p_flow_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin() THEN
    IF NOT public.user_has_permission('hr.leave.types.manage') THEN
      RAISE EXCEPTION 'Not authorized to re-sync leave approval chains'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (v_org = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'Not authorized to re-sync leave approval chains for this institution'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH classified AS (
    SELECT
      public.fn_hr_leave_build_chain(p_flow_id, a.employee_id) AS new_chain,
      a.approval_chain,
      (a.current_step > 0 OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(a.approval_chain, '[]'::jsonb)) s
         WHERE jsonb_array_length(COALESCE(s -> 'decisions', '[]'::jsonb)) > 0)) AS decided,
      EXISTS (
        SELECT 1
        FROM public.staff st
        JOIN public.hr_attendance_periods ap
          ON ap.institution_id = st.institution_id AND ap.status = 'locked'
        WHERE st.id = a.employee_id
          AND make_date(ap.period_year, ap.period_month, 1) <= a.end_date
          AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > a.start_date
      ) AS locked
    FROM public.hr_leave_applications a
    WHERE a.hr_organization_id = v_org
      AND a.status IN ('pending', 'escalated')
      AND public.fn_hr_leave_pick_flow_for_group(
            v_org, a.leave_type_id, public.fn_hr_staff_group(a.employee_id)
          ) = p_flow_id
  ), drifted AS (
    SELECT * FROM classified
    WHERE new_chain IS NOT NULL AND approval_chain IS DISTINCT FROM new_chain
  )
  SELECT
    count(*) FILTER (WHERE NOT decided AND NOT locked)::int,
    count(*) FILTER (WHERE decided)::int,
    count(*) FILTER (WHERE NOT decided AND locked)::int
  FROM drifted;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_hr_leave_resync_pending_chains(p_flow_id uuid)
 RETURNS TABLE(resynced integer, skipped_decided integer, skipped_locked integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org  uuid;
BEGIN
  SELECT af.hr_organization_id
    INTO v_org
  FROM public.hr_approval_flows af
  WHERE af.id = p_flow_id
    AND af.flow_for = 'leave_approval'
    AND af.is_active
    AND af.valid_until IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active leave approval flow with id %', p_flow_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin() THEN
    IF NOT public.user_has_permission('hr.leave.types.manage') THEN
      RAISE EXCEPTION 'Not authorized to re-sync leave approval chains'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (v_org = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'Not authorized to re-sync leave approval chains for this institution'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH classified AS (
    SELECT
      a.id,
      public.fn_hr_leave_build_chain(p_flow_id, a.employee_id) AS new_chain,
      a.approval_chain,
      (a.current_step > 0 OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(a.approval_chain, '[]'::jsonb)) s
         WHERE jsonb_array_length(COALESCE(s -> 'decisions', '[]'::jsonb)) > 0)) AS decided,
      EXISTS (
        SELECT 1
        FROM public.staff st
        JOIN public.hr_attendance_periods ap
          ON ap.institution_id = st.institution_id AND ap.status = 'locked'
        WHERE st.id = a.employee_id
          AND make_date(ap.period_year, ap.period_month, 1) <= a.end_date
          AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > a.start_date
      ) AS locked
    FROM public.hr_leave_applications a
    WHERE a.hr_organization_id = v_org
      AND a.status IN ('pending', 'escalated')
      AND public.fn_hr_leave_pick_flow_for_group(
            v_org, a.leave_type_id, public.fn_hr_staff_group(a.employee_id)
          ) = p_flow_id
  ), drifted AS (
    SELECT * FROM classified
    WHERE new_chain IS NOT NULL AND approval_chain IS DISTINCT FROM new_chain
  ), upd AS (
    UPDATE public.hr_leave_applications a
    SET approval_chain = d.new_chain,
        current_step   = 0,
        updated_at     = now()
    FROM drifted d
    WHERE a.id = d.id AND NOT d.decided AND NOT d.locked
    RETURNING a.id
  )
  SELECT
    (SELECT count(*) FROM upd)::int,
    (SELECT count(*) FROM drifted WHERE decided)::int,
    (SELECT count(*) FROM drifted WHERE NOT decided AND locked)::int;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Locks
-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase grants
-- anon directly, so both are named: revoking one does not undo the other.
REVOKE EXECUTE ON FUNCTION public.fn_hr_staff_group(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_staff_group(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_pick_flow_for_group(uuid, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_pick_flow_for_group(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_pick_flow(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_pick_flow(uuid, uuid, uuid) TO authenticated, service_role;
