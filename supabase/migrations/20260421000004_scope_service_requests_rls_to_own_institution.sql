-- Fix service_requests RLS to scope non-admin roles to their own institution.
--
-- Root problem: the existing admin-level SELECT/UPDATE policies and the
-- legacy role-match SELECT policy all granted module-wide permissions
-- (user_has_permission('service_requests.view_all' / '.approve')) without
-- any institution_id check. Any user holding those permissions could
-- SELECT or UPDATE service requests from EVERY institution.
--
-- This violates the CLAUDE.md-documented standard RLS pattern for tables
-- carrying an institution_id column:
--
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('module.action')
--       AND role_has_institution_access(institution_id))
--
-- Rewrite the three broad policies to follow the standard pattern.
-- Super_admin / admin keep cross-institutional access via the first two
-- OR branches. Other roles (HOD, principal, faculty, staff, etc.) are
-- institution-scoped through role_has_institution_access() which honors
-- custom_roles.institution_scope and user_institution_access grants.
-- Own-request access (requester_id = auth.uid()) is unchanged — users
-- can always see/edit their own requests regardless of institution scope.
--
-- Child tables (service_request_approvals, attachments, timeline) gate
-- access via the parent service_requests row, so they inherit the scoping
-- automatically — no separate migration needed for them.
--
-- Applied via MCP apply_migration 2026-04-21.

-- SELECT: broad admin/approver view
DROP POLICY IF EXISTS "service_requests_admin_view_permission" ON service_requests;
CREATE POLICY "service_requests_admin_view_permission" ON service_requests
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    (user_has_permission('service_requests.view_all') OR user_has_permission('service_requests.approve'))
    AND role_has_institution_access(institution_id)
  )
  OR requester_id = auth.uid()
);

-- UPDATE: admin / approver / self-edit while draft/returned/submitted
DROP POLICY IF EXISTS "service_requests_approve_permission" ON service_requests;
CREATE POLICY "service_requests_approve_permission" ON service_requests
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('service_requests.approve')
    AND role_has_institution_access(institution_id)
  )
  OR (
    requester_id = auth.uid()
    AND status IN ('draft'::service_request_status, 'returned'::service_request_status, 'submitted'::service_request_status)
  )
);

-- SELECT: legacy role-match visibility — the user whose role matches the
-- configured approver_role for the current step can see the request,
-- IF the request belongs to an institution they can access.
DROP POLICY IF EXISTS "Approvers can view pending requests" ON service_requests;
CREATE POLICY "Approvers can view pending requests" ON service_requests
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM service_request_approval_steps sras
    WHERE sras.service_type_id = service_requests.service_type_id
      AND sras.step_order = service_requests.current_approval_step
      AND sras.approver_role::text = get_current_user_role()
  )
  AND (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(service_requests.institution_id)
  )
);
