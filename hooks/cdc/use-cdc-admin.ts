'use client';

// ============================================================
// useCdcAdmin — client mirror of the DB `is_cdc_head_or_super()` gate.
// Grants CDC admin access to super-admins OR holders of the `cdc_head` role
// (via legacy profiles.role OR a multi-role user_roles assignment). Kept in one
// place so every /cdc/admin gate stays in lockstep with the API + RLS, and so
// multi-role cdc_head assignments are never missed.
// ============================================================

import { usePermissions } from '@/hooks/use-permissions';

export interface UseCdcAdminResult {
  /** True for super-admins and cdc_head role holders. */
  isCdcAdmin: boolean;
  /** True only for super-admins (some surfaces gate certain actions to super only). */
  isSuperAdmin: boolean;
  isLoading: boolean;
}

export function useCdcAdmin(): UseCdcAdminResult {
  const { isSuperAdmin, userProfile, userRoles, isLoading } = usePermissions();

  const isCdcHead =
    userProfile?.role === 'cdc_head' ||
    (userRoles ?? []).some((r) => r.role_key === 'cdc_head');

  return {
    isCdcAdmin: isSuperAdmin || isCdcHead,
    isSuperAdmin,
    isLoading,
  };
}
