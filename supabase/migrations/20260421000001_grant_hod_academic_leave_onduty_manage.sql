-- Grant HOD role the academic.leave_onduty.manage permission so that the
-- "Workflow Settings" sidebar link at /academic/leave-onduty/settings appears
-- and client-side can() checks succeed.
--
-- The FlowSettingsPage component (app/(routes)/academic/leave-onduty/settings/page.tsx)
-- already whitelists role='hod' as a hard fallback, so HODs who manually type
-- the URL could reach the page — but the sidebar entry was hidden because
-- lib/sidebarMenuLink.ts:235 gates the link on this specific permission key.
--
-- Applied via MCP apply_migration 2026-04-21.

UPDATE custom_roles
SET permissions = jsonb_set(
      permissions,
      '{academic.leave_onduty.manage}',
      'true'::jsonb,
      true
    ),
    updated_at = NOW()
WHERE role_key = 'hod';
