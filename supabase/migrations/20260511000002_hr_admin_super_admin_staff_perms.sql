-- 20260511000002_hr_admin_super_admin_staff_perms.sql
-- Closes a latent gap surfaced by Batch D verification of the staff scope lockdown:
-- hr_admin and super_admin roles had module_scopes.staff = 'all_institutions' but
-- their custom_roles.permissions jsonb lacked staff.* keys. Today this is harmless
-- because super_admin is short-circuited via is_super_admin() and the only live
-- non-super hr_admin user holds additional roles that grant staff.view. But a
-- future pure-hr_admin user would be silently denied by user_has_permission('staff.view')
-- inside staff_select_scope_aware.
--
-- Fix: grant the full 13-key staff.* matrix to hr_admin and super_admin. Idempotent.

BEGIN;

WITH staff_perm_keys(perms) AS (
  VALUES (jsonb_build_object(
    'staff.dashboard.view',          true,
    'staff.categories.view',         true,
    'staff.categories.create',       true,
    'staff.categories.edit',         true,
    'staff.categories.delete',       true,
    'staff.view',                    true,
    'staff.create',                  true,
    'staff.edit',                    true,
    'staff.delete',                  true,
    'staff.status_update',           true,
    'staff.class_incharges.view',    true,
    'staff.class_incharges.create',  true,
    'staff.class_incharges.delete',  true
  ))
)
UPDATE public.custom_roles cr
SET permissions = COALESCE(cr.permissions, '{}'::jsonb) || k.perms,
    updated_at  = NOW()
FROM staff_perm_keys k
WHERE cr.role_key IN ('hr_admin', 'super_admin');

-- Smoke verify: both roles now carry staff.view=true (the gating key for RLS SELECT)
DO $$
DECLARE
  missing_count int;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM public.custom_roles
  WHERE role_key IN ('hr_admin', 'super_admin')
    AND (permissions->>'staff.view')::boolean IS NOT TRUE;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'hr_admin/super_admin still missing staff.view after migration (count=%)', missing_count;
  END IF;
END$$;

COMMIT;
