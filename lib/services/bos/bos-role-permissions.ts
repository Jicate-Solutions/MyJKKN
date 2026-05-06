/**
 * BOS Role Permissions Configuration
 *
 * Defines permission mappings for all BOS modules across user roles.
 * Used by usePermissions() hook and PermissionGuard component.
 */

export interface RolePermissions {
  [module: string]: string[];
}

export const BOS_MODULES = {
  SYLLABI: 'academic.bos-syllabi',
  TAXONOMY: 'academic.bos-taxonomy',
  EXPERTS: 'academic.bos-experts',
  COMPOSITIONS: 'academic.bos-compositions',
  MEETINGS: 'academic.bos-meetings',
  TA_DA: 'academic.bos-ta-da',
  REPORTS: 'academic.bos-reports',
} as const;

export const BOS_ACTIONS = {
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  REVISE: 'revise',
  DUPLICATE: 'duplicate',
  EXPORT: 'export',
  SUBMIT: 'submit',
} as const;

/**
 * Default role permissions for BOS modules
 * Super admin and explicit custom_roles override these defaults
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  // Administrator / Super Admin: Full access (handled by isSuperAdmin flag)
  administrator: {
    [BOS_MODULES.SYLLABI]: ['view', 'create', 'edit', 'delete', 'revise', 'duplicate', 'export'],
    [BOS_MODULES.TAXONOMY]: ['view', 'create', 'edit', 'delete'],
    [BOS_MODULES.EXPERTS]: ['view', 'create', 'edit', 'delete'],
    [BOS_MODULES.COMPOSITIONS]: ['view', 'create', 'edit', 'delete'],
    [BOS_MODULES.MEETINGS]: ['view', 'create', 'edit', 'delete'],
    [BOS_MODULES.TA_DA]: ['view', 'create', 'edit', 'delete', 'approve'],
    [BOS_MODULES.REPORTS]: ['view', 'export'],
  },

  // HOD: Can manage syllabi, experts, compositions, meetings for their department
  hod: {
    [BOS_MODULES.SYLLABI]: ['view', 'create', 'edit', 'revise', 'duplicate', 'export'],
    [BOS_MODULES.TAXONOMY]: ['view', 'edit'],
    [BOS_MODULES.EXPERTS]: ['view', 'create', 'edit', 'delete'],
    [BOS_MODULES.COMPOSITIONS]: ['view', 'create', 'edit'],
    [BOS_MODULES.MEETINGS]: ['view', 'create', 'edit'],
    [BOS_MODULES.TA_DA]: ['view', 'submit'],
    [BOS_MODULES.REPORTS]: ['view'],
  },

  // Principal: View-only access
  principal: {
    [BOS_MODULES.SYLLABI]: ['view', 'export'],
    [BOS_MODULES.TAXONOMY]: ['view'],
    [BOS_MODULES.EXPERTS]: ['view'],
    [BOS_MODULES.COMPOSITIONS]: ['view'],
    [BOS_MODULES.MEETINGS]: ['view'],
    [BOS_MODULES.TA_DA]: ['view'],
    [BOS_MODULES.REPORTS]: ['view', 'export'],
  },

  // Faculty: Limited access to syllabi and TA/DA
  faculty: {
    [BOS_MODULES.SYLLABI]: ['view', 'export'],
    [BOS_MODULES.TAXONOMY]: ['view'],
    [BOS_MODULES.EXPERTS]: ['view'],
    [BOS_MODULES.COMPOSITIONS]: ['view'],
    [BOS_MODULES.MEETINGS]: ['view'],
    [BOS_MODULES.TA_DA]: ['view', 'submit'],
    [BOS_MODULES.REPORTS]: ['view'],
  },

  // Coordinator: Can help manage BOS operations
  coordinator: {
    [BOS_MODULES.SYLLABI]: ['view', 'create', 'edit', 'export'],
    [BOS_MODULES.TAXONOMY]: ['view'],
    [BOS_MODULES.EXPERTS]: ['view', 'create', 'edit'],
    [BOS_MODULES.COMPOSITIONS]: ['view', 'create', 'edit'],
    [BOS_MODULES.MEETINGS]: ['view', 'create', 'edit'],
    [BOS_MODULES.TA_DA]: ['view', 'submit'],
    [BOS_MODULES.REPORTS]: ['view'],
  },

  // Default (no specific role): View only
  default: {
    [BOS_MODULES.SYLLABI]: ['view'],
    [BOS_MODULES.TAXONOMY]: ['view'],
    [BOS_MODULES.EXPERTS]: ['view'],
    [BOS_MODULES.COMPOSITIONS]: ['view'],
    [BOS_MODULES.MEETINGS]: ['view'],
    [BOS_MODULES.TA_DA]: ['view'],
    [BOS_MODULES.REPORTS]: ['view'],
  },
};

/**
 * Get default permissions for a role
 */
export function getRolePermissions(role: string | null): RolePermissions {
  if (!role) return DEFAULT_ROLE_PERMISSIONS.default;

  const lowerRole = role.toLowerCase();
  return DEFAULT_ROLE_PERMISSIONS[lowerRole] || DEFAULT_ROLE_PERMISSIONS.default;
}

/**
 * Check if a role has permission for a specific module action
 */
export function hasModuleAccess(
  role: string | null,
  module: string,
  action: string
): boolean {
  const permissions = getRolePermissions(role);
  const modulePermissions = permissions[module];

  return modulePermissions ? modulePermissions.includes(action) : false;
}

/**
 * Get all modules a role can access
 */
export function getAccessibleModules(role: string | null): string[] {
  const permissions = getRolePermissions(role);
  return Object.keys(permissions).filter(module => {
    const actions = permissions[module];
    return actions && actions.length > 0;
  });
}

/**
 * Check if a role has any permission in a module
 */
export function canAccessModule(role: string | null, module: string): boolean {
  const permissions = getRolePermissions(role);
  const modulePermissions = permissions[module];
  return modulePermissions !== undefined && modulePermissions.length > 0;
}
