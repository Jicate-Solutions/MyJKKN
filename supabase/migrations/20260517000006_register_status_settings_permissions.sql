-- Register dynamic admission status permission keys on existing roles.
-- Mirrors lib/constants/permissions.ts additions for
--   admission.settings.statuses.view
--   admission.settings.statuses.manage
--
-- Per feedback_reserved_perm_keys_need_role_grants.md: declaring keys in
-- permissions.ts alone only populates the Role Management UI; without this
-- JSONB-merge migration the Settings page would render empty for every
-- non-super-admin until an admin manually re-saves each role.
--
-- Note: admission_admin and admission_director role_keys do not exist in
-- this project as of 2026-05-17, so they are omitted from the IN clauses.

BEGIN;

-- Grant view + manage to roles that already hold admission.settings.* manage rights.
UPDATE public.custom_roles
SET permissions = permissions
  || jsonb_build_object(
       'admission.settings.statuses.view', true,
       'admission.settings.statuses.manage', true
     )
WHERE role_key IN ('super_admin');

-- Grant view-only to other admission-facing roles.
UPDATE public.custom_roles
SET permissions = permissions
  || jsonb_build_object('admission.settings.statuses.view', true)
WHERE role_key IN ('administrator','admission_counselor','expo_counselor');

COMMIT;
