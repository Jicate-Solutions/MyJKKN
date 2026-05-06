-- ============================================================================
-- 20260507100003 — Register admission_fees.{manage_adjustments,override}
-- ============================================================================
-- JSONB on public.custom_roles.permissions. Resolver: user_has_permission(text).
-- manage_adjustments → administrator, super_admin
-- override          → super_admin only (rare escape hatch for legacy edits)
-- Spec: §10.1
-- ============================================================================

-- Grant manage_adjustments to admin-tier roles
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.manage_adjustments": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE(permissions->>'admission_fees.manage_adjustments','false') <> 'true';

-- Grant override to super_admin only (rare escape hatch)
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.override": true}'::jsonb,
       updated_at  = now()
 WHERE role_key = 'super_admin'
   AND COALESCE(permissions->>'admission_fees.override','false') <> 'true';
