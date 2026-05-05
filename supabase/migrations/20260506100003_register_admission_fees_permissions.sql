-- ============================================================================
-- 20260506100003 — Register admission_fees.{read,manage} permission keys
-- ============================================================================
-- Project uses JSONB `permissions` column on `custom_roles` table (verified via
-- public.user_has_permission function which reads cr.permissions->>permission_name).
-- No separate permissions catalogue table or role_permissions join table exists.
--
-- admission_fees.read   → admission_counselor, expo_counselor, administrator, super_admin
-- admission_fees.manage → administrator, super_admin
-- ============================================================================

-- Grant admission_fees.read
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"admission_fees.read": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('admission_counselor','expo_counselor','administrator','super_admin')
   AND COALESCE((permissions->>'admission_fees.read')::boolean, false) = false;

-- Grant admission_fees.manage
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"admission_fees.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE((permissions->>'admission_fees.manage')::boolean, false) = false;
