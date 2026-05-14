-- Migration: Grant the `administrator` custom role full Employee module access
-- Date: 2026-05-13
-- Reason: User reported that the "Add Staff" button on /staff/list was hidden
--         for the administrator role despite intending to grant complete access.
--         Root cause: only `staff.view` was set; staff.create / staff.edit /
--         staff.delete / staff.status_update plus the sub-module *.view keys
--         (dashboard/categories/class_incharges) were all false, and
--         module_scopes.staff was the most restrictive 'own_records'.
--         This is the recurring "module_scopes set without matching perm keys"
--         pattern (see feedback_module_scope_needs_matching_perm_keys.md,
--         2026-05-11 staff lockdown for hr_admin).
--
-- Approach: jsonb `||` concatenation overwrites only the listed keys,
-- preserving every other permission already on the role.

UPDATE public.custom_roles
SET
  permissions = COALESCE(permissions, '{}'::jsonb)
    || jsonb_build_object(
         'staff.create',                true,
         'staff.edit',                  true,
         'staff.delete',                true,
         'staff.status_update',         true,
         'staff.dashboard.view',        true,
         'staff.categories.view',       true,
         'staff.class_incharges.view',  true
       ),
  module_scopes = COALESCE(module_scopes, '{}'::jsonb)
    || jsonb_build_object('staff', 'all_institutions'),
  updated_at = NOW()
WHERE role_key = 'administrator';

-- Refresh PostgREST schema cache so cached role rows are evicted
NOTIFY pgrst, 'reload schema';
