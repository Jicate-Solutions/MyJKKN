-- Add VAC permissions to all relevant roles
-- This ensures VAC menu items appear in the sidebar

-- Add VAC permissions to super_admin role
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  'vac.view', true,
  'vac.progress.view', true,
  'vac.admin.view', true,
  'vac.admin.create', true,
  'vac.admin.edit', true,
  'vac.admin.analytics', true
)
WHERE role_key = 'super_admin';

-- Add VAC view permissions to administrator role
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  'vac.view', true,
  'vac.progress.view', true,
  'vac.admin.view', true
)
WHERE role_key = 'administrator';

-- Add VAC view permissions to faculty role
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  'vac.view', true,
  'vac.progress.view', true
)
WHERE role_key = 'faculty';

-- Add VAC view permissions to student role
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  'vac.view', true,
  'vac.progress.view', true
)
WHERE role_key = 'student';

-- Verify the update
SELECT role_key,
       permissions->>'vac.view' as vac_view,
       permissions->>'vac.admin.view' as vac_admin
FROM custom_roles
WHERE role_key IN ('super_admin', 'administrator', 'faculty', 'student');
