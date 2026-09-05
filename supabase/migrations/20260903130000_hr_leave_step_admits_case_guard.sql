-- ============================================================================
-- fn_leave_step_admits: stop building fn_my_hr_organization_ids() on every row
-- 2026-09-03 (follows 20260831140000_hr_leave_role_step_scoped_to_own_institution)
-- ----------------------------------------------------------------------------
-- THE APPROVALS QUEUE WAS TIMING OUT FOR EVERY ROLE-STEP APPROVER.
--
-- hr_leave_approval_queue() admits a row for a caller WITHOUT hr.leave.approve
-- only through fn_is_designated_leave_approver(a.id), so for the 94 HODs and
-- 13 Principals it evaluates this function once per candidate row -- 1,139 rows
-- today (968 pending + twelve months of decided). Inside, the role branch read
--
--     user_has_permission('hr.leave.approve')
--     AND p_hr_organization_id = ANY (fn_my_hr_organization_ids())
--
-- which LOOKS as if it skips the org build when the key is false. It does not.
-- Postgres promises no evaluation order for AND/OR, and none of these
-- SECURITY DEFINER functions can be inlined, so fn_my_hr_organization_ids()
-- (3.7 ms) ran for every row whether or not the caller held the key.
--
-- Measured 2026-09-03, acting as the named user via request.jwt.claims:
--
--     queue as cao@ (holds the key; the queue's WHERE admits on it)   1.29 s  1,139 rows
--     queue as principaljkkncet@ (role-step only)                     7.29 s    126 rows
--     the designated predicate alone over the 1,139 rows              6.88 s
--     authenticated role statement_timeout                            8 s
--
-- Under real load it crossed the line: 69 x "POST /rpc/hr_leave_approval_queue
-- -> 500" in one day and ~600 "canceling statement due to statement timeout".
-- The Approvals page never read the error off the hook, so a Principal saw a
-- spinner for two attempts and then zero rows -- indistinguishable from
-- "nothing to approve".
--
-- THE FIX IS ONE CASE. CASE is the one construct Postgres evaluates lazily, so
-- the org array is now built only for a caller who actually holds the key --
-- and that caller never reaches this function from the queue anyway, because
-- its WHERE admits them on the key before the designated test runs. The truth
-- table is unchanged. The same predicate, inline, over the same 1,139 rows:
-- 6.88 s -> 0.30 s, the same 126 hits.
--
-- Signature, volatility, SECURITY DEFINER, search_path and the existing grants
-- are all kept (CREATE OR REPLACE preserves the ACL), so the seventeen policies
-- and functions that route through this one -- hla_select, hla_update,
-- hr_leave_approval_queue, fn_is_any_leave_approver,
-- hr_trig_leave_enforce_approver and the rest -- pick the change up untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_leave_step_admits(
  p_step jsonb,
  p_uid uuid,
  p_hr_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fn_leave_step_approvers(p_step) e
    WHERE p_uid IS NOT NULL
      AND (
        -- Pinned: an explicit naming, reachable from any institution.
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
          AND (
            public.is_super_admin()
            -- CASE, not AND. AND carries no evaluation-order guarantee, and
            -- this array build (3.7 ms) was running once per row for callers
            -- who do not hold the key. See the header.
            OR CASE
                 WHEN public.user_has_permission('hr.leave.approve')
                 THEN p_hr_organization_id = ANY (
                        COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))
                 ELSE false
               END
            OR p_hr_organization_id = ANY (
                 COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[]))
          )
        )
      )
  );
$function$;
