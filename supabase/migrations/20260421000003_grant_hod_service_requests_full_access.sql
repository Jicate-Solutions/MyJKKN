-- Grant HOD role 13 of the 14 service_requests permissions so the module
-- becomes visible and actionable from the sidebar. external_api.manage is
-- intentionally excluded — it controls platform-level API integration, not
-- an institution-scoped capability, so it stays with admin/super_admin.
--
-- MUST be paired with 20260421000004 which rewrites service_requests RLS
-- to scope non-admin access to own institution. Granting this permission
-- without that RLS change would give HOD cross-institutional access.
--
-- Applied via MCP apply_migration 2026-04-21.

UPDATE custom_roles
SET permissions = permissions
  || jsonb_build_object(
       'service_requests.types.view',     true,
       'service_requests.types.create',   true,
       'service_requests.types.edit',     true,
       'service_requests.types.delete',   true,
       'service_requests.submit',         true,
       'service_requests.view_own',       true,
       'service_requests.view_all',       true,
       'service_requests.edit_own',       true,
       'service_requests.cancel_own',     true,
       'service_requests.approve',        true,
       'service_requests.fulfill',        true,
       'service_requests.close',          true,
       'service_requests.analytics.view', true
  ),
    updated_at = NOW()
WHERE role_key = 'hod';
