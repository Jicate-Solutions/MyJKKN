'use client';

import { useAuth } from '@/hooks/use-auth-provider';
import { SYSTEM_ROLES } from '@/types/auth';

export type BosSyllabusPermission =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'revise'
  | 'duplicate'
  | 'export'
  | 'manage_taxonomy';

export interface BosPermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canRevise: boolean;
  canDuplicate: boolean;
  canExport: boolean;
  canManageTaxonomy: boolean;
  hasAnyPermission: boolean;
}

// Default permissions by role
const DEFAULT_ROLE_PERMISSIONS: Record<string, Partial<BosPermissions>> = {
  [SYSTEM_ROLES.SUPER_ADMIN]: {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canRevise: true,
    canDuplicate: true,
    canExport: true,
    canManageTaxonomy: true,
  },
  [SYSTEM_ROLES.ADMINISTRATOR]: {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canRevise: true,
    canDuplicate: true,
    canExport: true,
    canManageTaxonomy: true,
  },
  [SYSTEM_ROLES.PRINCIPAL]: {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canRevise: false,
    canDuplicate: false,
    canExport: true,
    canManageTaxonomy: false,
  },
  [SYSTEM_ROLES.HOD]: {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canRevise: true,
    canDuplicate: true,
    canExport: true,
    canManageTaxonomy: false,
  },
  [SYSTEM_ROLES.FACULTY]: {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canRevise: true,
    canDuplicate: true,
    canExport: true,
    canManageTaxonomy: false,
  },
};

/**
 * Hook to check BOS syllabi permissions for current user
 * Returns granular permission flags and merged_permissions from profile
 */
export function useBosPermissions(): BosPermissions {
  const { profile } = useAuth();

  if (!profile) {
    return {
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canRevise: false,
      canDuplicate: false,
      canExport: false,
      canManageTaxonomy: false,
      hasAnyPermission: false,
    };
  }

  // Super admin bypasses all checks
  if (profile.is_super_admin) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canRevise: true,
      canDuplicate: true,
      canExport: true,
      canManageTaxonomy: true,
      hasAnyPermission: true,
    };
  }

  // Check merged permissions (set via custom roles)
  if (profile.merged_permissions) {
    const perms: BosPermissions = {
      canView: profile.merged_permissions['bos.syllabi.view'] ?? false,
      canCreate: profile.merged_permissions['bos.syllabi.create'] ?? false,
      canEdit: profile.merged_permissions['bos.syllabi.edit'] ?? false,
      canDelete: profile.merged_permissions['bos.syllabi.delete'] ?? false,
      canRevise: profile.merged_permissions['bos.syllabi.revise'] ?? false,
      canDuplicate: profile.merged_permissions['bos.syllabi.duplicate'] ?? false,
      canExport: profile.merged_permissions['bos.syllabi.export'] ?? false,
      canManageTaxonomy: profile.merged_permissions['bos.syllabi.manage_taxonomy'] ?? false,
      hasAnyPermission: false,
    };
    perms.hasAnyPermission = Object.values(perms).some(v => v === true);
    return perms;
  }

  // Fall back to default role-based permissions
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[profile.role] || {};
  const perms: BosPermissions = {
    canView: rolePermissions.canView ?? false,
    canCreate: rolePermissions.canCreate ?? false,
    canEdit: rolePermissions.canEdit ?? false,
    canDelete: rolePermissions.canDelete ?? false,
    canRevise: rolePermissions.canRevise ?? false,
    canDuplicate: rolePermissions.canDuplicate ?? false,
    canExport: rolePermissions.canExport ?? false,
    canManageTaxonomy: rolePermissions.canManageTaxonomy ?? false,
    hasAnyPermission: false,
  };
  perms.hasAnyPermission = Object.values(perms).some(v => v === true);
  return perms;
}

/**
 * Check if user has a specific permission
 */
export function useHasBosPermission(permission: BosSyllabusPermission): boolean {
  const perms = useBosPermissions();
  const permissionMap: Record<BosSyllabusPermission, keyof BosPermissions> = {
    view: 'canView',
    create: 'canCreate',
    edit: 'canEdit',
    delete: 'canDelete',
    revise: 'canRevise',
    duplicate: 'canDuplicate',
    export: 'canExport',
    manage_taxonomy: 'canManageTaxonomy',
  };
  return perms[permissionMap[permission]];
}
