-- Migration: 20260515_ensure_hod_compositions_perms.sql
--
-- Problem: An HOD reports the /bos/compositions page renders blank under the
-- tabs (no filter bar, no data table, no New Composition button). The page is
-- wrapped in <PermissionGuard module='academic.bos-compositions' action='view'>
-- which renders `null` when the user lacks the .view permission key. So the
-- HOD's runtime perms are missing academic.bos-compositions.view (and likely
-- .create as well, which would hide the toolbar button even if view passed).
--
-- Why this can happen even after 20260512_grant_bos_compositions_dotformat_to_roles.sql:
--   1. Environment hasn't applied that migration yet.
--   2. Migration applied to custom_roles WHERE role_key='hod' but the affected
--      HOD user's user_roles row links to a *different* custom_role (e.g. a
--      hand-rolled "Faculty + COE" role) that lacks BOS keys. The use-permissions
--      safety net at hooks/use-permissions.ts:114-144 was added to merge the
--      profile-role perms in this case, but it only fires if NO user_role has
--      role_key='hod'. If user_roles points to a custom 'hod-coordinator' role
--      with role_key='hod' but stripped perms, the safety net won't run.
--   3. JSONB key got removed by a later UPDATE that used `permissions = ...` (overwrite)
--      instead of `permissions || ...` (merge).
--
-- Fix: idempotent UPSERT of the three keys HOD needs to use the compositions
-- page. Uses jsonb || (non-destructive merge) — safe to re-run, safe even if
-- the keys are already present. All other HOD permissions (including the ones
-- intentionally revoked by 20260514c_revoke_hod_overgranted_bos_permissions.sql)
-- are untouched.
--
-- Reversible via:
--   UPDATE public.custom_roles
--   SET permissions = permissions
--     - 'academic.bos-compositions.view'
--     - 'academic.bos-compositions.create'
--     - 'academic.bos-compositions.edit'
--   WHERE role_key = 'hod';

BEGIN;

UPDATE public.custom_roles
SET
  permissions = permissions || '{
    "academic.bos-compositions.view": true,
    "academic.bos-compositions.create": true,
    "academic.bos-compositions.edit": true
  }'::jsonb,
  updated_at = NOW()
WHERE role_key = 'hod';

COMMIT;
