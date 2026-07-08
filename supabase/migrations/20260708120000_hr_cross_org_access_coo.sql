-- =============================================================================
-- Migration: COO cross-organization HR access
-- TIER classification: TIER-1 (modifies an RLS helper + adds a read policy)
-- =============================================================================
--
-- WHY
-- ---
-- The COO (Chief Operating Officer) role has institution_scope='all' in
-- custom_roles, and role_has_institution_access() honors it — so recruitment
-- jobs/candidates are already visible across institutions. But the HR module
-- has a SECOND tenancy layer: hr_* config tables are gated by
--   hr_organization_id = auth_hr_organization_id()
-- which resolves from user_hr_access (single row, LIMIT 1) and completely
-- ignores custom_roles.institution_scope. The COO user's only user_hr_access
-- row maps to one org, so the Recruitment Approval Flows builder
-- (/hr/admin/recruitment-approval-flows) showed a single organization.
--
-- The May 2026 fix for the same wall (20260520140000_hr_approval_flows_hr_admin_rls)
-- introduced fn_is_hr_admin() as the cross-org bypass for hr_admin/hr_head/
-- hr_manager on hr_approval_flows. Two gaps remained:
--   1. 'coo' is not in the fn_is_hr_admin() role list.
--   2. hr_organizations itself has NO fn_is_hr_admin() branch, so even
--      hr_admin/hr_head/hr_manager could not LIST other orgs (the flow
--      builder's organization checkboxes) — only super admins could.
--
-- WHAT THIS MIGRATION DOES (additive only, never narrows access)
-- --------------------------------------------------------------
-- 1. Adds 'coo' to fn_is_hr_admin()'s cross-org role-key list.
-- 2. Adds a read-only additive policy on hr_organizations for
--    fn_is_hr_admin() holders. Writes on hr_organizations stay
--    tenant-scoped / super-admin only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: widen fn_is_hr_admin() with the COO role
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_hr_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    -- Roles with cross-organization HR access (bypass hr_organization_id
    -- tenant isolation). COO added 2026-07-08: institution_scope='all'
    -- executives must see every org in the HR module too.
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND cr.role_key IN ('hr_admin', 'hr_head', 'hr_manager', 'coo')
    );
$function$;

GRANT EXECUTE ON FUNCTION public.fn_is_hr_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- Step 2: additive read policy on hr_organizations for cross-org HR roles
-- (SELECT only — org creation/edit remains tenant-scoped or super-admin)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_orgs_hr_admin_read ON public.hr_organizations;

CREATE POLICY hr_orgs_hr_admin_read
ON public.hr_organizations
FOR SELECT
TO public
USING (fn_is_hr_admin());

-- =============================================================================
-- ROLLBACK (manual, if needed)
-- =============================================================================
-- DROP POLICY IF EXISTS hr_orgs_hr_admin_read ON public.hr_organizations;
-- CREATE OR REPLACE FUNCTION public.fn_is_hr_admin() ... role_key IN
--   ('hr_admin','hr_head','hr_manager');  -- previous list
-- =============================================================================
