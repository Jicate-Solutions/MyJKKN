-- Grant HR Administrator full HR module access.
--
-- hr_admin previously held 24 of the 58 distinct hr.* permission keys defined
-- in the system, missing entire feature areas: attendance (all 12 keys),
-- counseling (all 5), grievance (both), promotion (all 4), career_development,
-- granular leave (apply/cancel/withdraw/balance/dispute/policies),
-- recruitment.approve, recruitment.packages.approve, and the top-level hr.view.
--
-- Per project memory feedback_reserved_perm_keys_need_role_grants: declaring
-- keys in permissions.ts only populates the Role Management UI; the role's
-- permissions JSONB must be patched directly or the UI renders empty even
-- when the user is the system's HR Administrator.
--
-- Also setting module_scopes.hr = 'all_institutions' to match the existing
-- staff scope, so any future RLS policy that gates on get_user_module_scope('hr')
-- recognises hr_admin as system-wide. institution_scope was already 'all'.
--
-- Applied via MCP apply_migration on 2026-05-14.

WITH all_hr_keys AS (
  SELECT DISTINCT k.key
  FROM custom_roles, jsonb_each(permissions) k
  WHERE k.key LIKE 'hr.%'
),
perms_patch AS (
  SELECT jsonb_object_agg(key, to_jsonb(true)) AS patch
  FROM all_hr_keys
)
UPDATE custom_roles
SET
  permissions   = permissions || (SELECT patch FROM perms_patch),
  module_scopes = COALESCE(module_scopes, '{}'::jsonb)
                    || jsonb_build_object('hr', 'all_institutions'),
  updated_at    = now()
WHERE role_key = 'hr_admin';
