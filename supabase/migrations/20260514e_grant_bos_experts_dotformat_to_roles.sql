-- Migration: 20260514e_grant_bos_experts_dotformat_to_roles.sql
--
-- Same shape as 20260512_grant_bos_compositions_dotformat_to_roles.sql, but for
-- the BOS Experts module. /bos/experts is gated by:
--
--   <PermissionGuard module='academic.bos-experts' action='view'>
--
-- which routes through usePermissions().canAccess(), which constructs the key
-- with a literal dot:
--
--   const permKey = `${module}.${action}`;   // hooks/use-permissions.ts:378
--   return enhancedPermissions[permKey] || false;
--
-- HOD and principal currently carry only the UNDERSCORE variant
-- (academic.bos-experts_view) in custom_roles.permissions — and one orphan
-- bare module key (academic.bos-experts: true on principal). The dot-format key
-- never existed, so the page renders null for these roles.
--
-- This migration backfills the dot-format keys. Action set per role mirrors
-- the seed in lib/services/bos/bos-role-permissions.ts:
--
--   hod:         view, create, edit, delete       (line 58)
--   principal:   view, edit                       (line 71)
--   facilitator: view                             (line 97 — already has it; no-op safe)
--
-- The jsonb '||' operator overwrites matching keys with the right-hand value
-- (true), so re-running is idempotent.
--
-- Reversible via:
--   UPDATE public.custom_roles
--   SET permissions = permissions
--     - 'academic.bos-experts.view'
--     - 'academic.bos-experts.create'
--     - 'academic.bos-experts.edit'
--     - 'academic.bos-experts.delete'
--   WHERE role_key IN ('hod', 'principal', 'facilitator');

BEGIN;

-- HOD: full CRUD on experts
UPDATE public.custom_roles
SET permissions = permissions || '{
  "academic.bos-experts.view": true,
  "academic.bos-experts.create": true,
  "academic.bos-experts.edit": true,
  "academic.bos-experts.delete": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'hod';

-- Principal: view + edit only (per seed). Also strip the orphan bare-module
-- key that has no action suffix — it never authorized anything but pollutes
-- the JSONB.
UPDATE public.custom_roles
SET permissions = (permissions - 'academic.bos-experts') || '{
  "academic.bos-experts.view": true,
  "academic.bos-experts.edit": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'principal';

-- Facilitator: view only (already present per seed; keeping the UPDATE for
-- idempotence and to document the intended state).
UPDATE public.custom_roles
SET permissions = permissions || '{
  "academic.bos-experts.view": true
}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'facilitator';

COMMIT;
