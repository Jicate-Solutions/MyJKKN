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

  // Check merged permissions (set via custom roles). Keys are stored in the
  // canonical "academic.bos-syllabus.<action>" dot format — matching what
  // applyBOSFallback() writes and what the rest of the codebase reads (see
  // scripts/fix-bos-permission-format-drift.sql and hooks/use-permissions.ts).
  // The old "bos.syllabus.*" prefix used here previously did not exist in any
  // user's merged_permissions, so this branch always returned all-false and
  // the role-default fallback below was unreachable — causing blank pages for
  // any faculty/HOD/principal user with merged_permissions populated.
  if (profile.merged_permissions) {
    const hasAnyBosKey = Object.keys(profile.merged_permissions).some((k) =>
      k.startsWith('academic.bos-syllabus.')
    );
    if (hasAnyBosKey) {
      const perms: BosPermissions = {
        canView: profile.merged_permissions['academic.bos-syllabus.view'] ?? false,
        canCreate: profile.merged_permissions['academic.bos-syllabus.create'] ?? false,
        canEdit: profile.merged_permissions['academic.bos-syllabus.edit'] ?? false,
        canDelete: profile.merged_permissions['academic.bos-syllabus.delete'] ?? false,
        canRevise: profile.merged_permissions['academic.bos-syllabus.revise'] ?? false,
        canDuplicate: profile.merged_permissions['academic.bos-syllabus.duplicate'] ?? false,
        canExport: profile.merged_permissions['academic.bos-syllabus.export'] ?? false,
        canManageTaxonomy: profile.merged_permissions['academic.bos-syllabus.manage_taxonomy'] ?? false,
        hasAnyPermission: false,
      };
      perms.hasAnyPermission = Object.values(perms).some((v) => v === true);
      return perms;
    }
    // No academic.bos-syllabus.* keys in merged_permissions — fall through to
    // the role-default seed below (mirrors applyBOSFallback's behaviour).
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
