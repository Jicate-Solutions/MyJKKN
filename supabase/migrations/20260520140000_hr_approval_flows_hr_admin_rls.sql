-- =============================================================================
-- Migration: hr_approval_flows HR Admin RLS widening
-- TIER classification: TIER-1 (modifies an RLS policy on a config table)
-- =============================================================================
--
-- WHY
-- ---
-- Director (non-coder) reported that HR Admin (test.admin@jkkn.ac.in) and other
-- HR-domain admins (HR Head, HR Manager) cannot self-serve the recruitment
-- approval-flow CRUD UI. Postgres returns RLS error code 42501 (insufficient
-- privilege) on INSERT/UPDATE against public.hr_approval_flows.
--
-- ROOT CAUSE (42501 error class)
-- -----------------------------
-- The existing policy hr_approval_flows_tenant_isolation evaluates
--   (hr_organization_id = auth_hr_organization_id()) OR is_super_admin()
-- When auth_hr_organization_id() returns NULL (because the calling user has no
-- user_hr_access mapping row for the target org), both OR branches fail and the
-- row is rejected with 42501. HR Admin / HR Head / HR Manager users frequently
-- have no user_hr_access row because the substrate has been HR-policy-mapped
-- via a different path (role-key in custom_roles).
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- 1. Creates fn_is_hr_admin() — SECURITY DEFINER STABLE — returns true iff the
--    calling user has at least one user_roles row joined to custom_roles where
--    role_key in ('hr_admin','hr_head','hr_manager'). Shape mirrors the existing
--    is_super_admin() helper (LANGUAGE sql STABLE SECURITY DEFINER, SET
--    search_path = public, granted to authenticated).
--
-- 2. Drops and recreates the existing hr_approval_flows_tenant_isolation policy
--    (cmd=ALL) with a third OR branch — fn_is_hr_admin() — added to both qual
--    and with_check. Policy name is preserved so the existing
--    INSERT/UPDATE/DELETE/SELECT routes for tenant-isolated users keep working.
--
-- ADDITIVE / REVERSIBILITY
-- ------------------------
-- This change ONLY WIDENS write access. It NEVER narrows existing tenant
-- isolation. The two original OR branches (tenant-org match + super-admin) are
-- preserved exactly as before. Revert path = re-issue the old policy with the
-- two-branch condition (see ROLLBACK comment block at end of file).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: fn_is_hr_admin() helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_hr_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND cr.role_key IN ('hr_admin', 'hr_head', 'hr_manager')
    );
$function$;

GRANT EXECUTE ON FUNCTION public.fn_is_hr_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- Step 2: Rebuild hr_approval_flows_tenant_isolation policy with HR-admin branch
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_approval_flows_tenant_isolation ON public.hr_approval_flows;

CREATE POLICY hr_approval_flows_tenant_isolation
ON public.hr_approval_flows
FOR ALL
TO public
USING (
    (hr_organization_id = auth_hr_organization_id())
    OR is_super_admin()
    OR fn_is_hr_admin()
)
WITH CHECK (
    (hr_organization_id = auth_hr_organization_id())
    OR is_super_admin()
    OR fn_is_hr_admin()
);

-- =============================================================================
-- ROLLBACK (manual, if needed)
-- =============================================================================
-- DROP POLICY IF EXISTS hr_approval_flows_tenant_isolation ON public.hr_approval_flows;
-- CREATE POLICY hr_approval_flows_tenant_isolation
-- ON public.hr_approval_flows
-- FOR ALL
-- TO public
-- USING ((hr_organization_id = auth_hr_organization_id()) OR is_super_admin())
-- WITH CHECK ((hr_organization_id = auth_hr_organization_id()) OR is_super_admin());
-- DROP FUNCTION IF EXISTS public.fn_is_hr_admin();
-- =============================================================================
