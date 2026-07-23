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
  SYLLABI: 'academic.bos-syllabus',
  TAXONOMY: 'academic.bos-taxonomy',
  EXPERTS: 'academic.bos-experts',
  COMPOSITIONS: 'academic.bos-compositions',
  MEETINGS: 'academic.bos-meetings',
  TA_DA: 'academic.bos-ta-da',
  REPORTS: 'academic.bos-reports',
  COURSES: 'academic.bos-courses',
  SCHEME: 'academic.bos-scheme',
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
  IMPORT: 'import',
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
    [BOS_MODULES.COURSES]: ['view', 'create', 'edit', 'delete', 'import'],
    [BOS_MODULES.SCHEME]: ['view', 'edit'],
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
    [BOS_MODULES.COURSES]: ['view', 'create', 'edit', 'import'],
    [BOS_MODULES.SCHEME]: ['view', 'edit'],
  },

  // Principal: Full edit across compositions, meetings, taxonomy
  principal: {
    [BOS_MODULES.SYLLABI]: ['view', 'export'],
    [BOS_MODULES.TAXONOMY]: ['view', 'edit'],
    [BOS_MODULES.EXPERTS]: ['view', 'edit'],
    [BOS_MODULES.COMPOSITIONS]: ['view', 'create', 'edit'],
    [BOS_MODULES.MEETINGS]: ['view', 'create', 'edit'],
    [BOS_MODULES.TA_DA]: ['view'],
    [BOS_MODULES.REPORTS]: ['view', 'export'],
    [BOS_MODULES.COURSES]: ['view'],
    [BOS_MODULES.SCHEME]: ['view'],
  },

  // Faculty (display name "Facilitator", role_key='faculty')
  // Can create/edit/revise/duplicate syllabi, compositions, and taxonomy.
  // NOTE: role_key is always 'faculty' — there is no 'facilitator' key in use.
  faculty: {
    [BOS_MODULES.SYLLABI]: ['view', 'create', 'edit', 'revise', 'duplicate', 'export'],
    [BOS_MODULES.TAXONOMY]: ['view', 'edit'],
    [BOS_MODULES.EXPERTS]: ['view'],
    [BOS_MODULES.COMPOSITIONS]: ['view', 'edit'],
    [BOS_MODULES.MEETINGS]: ['view', 'edit'],
    [BOS_MODULES.TA_DA]: ['view', 'submit'],
    [BOS_MODULES.REPORTS]: ['view'],
    [BOS_MODULES.COURSES]: ['view', 'create', 'edit'],
    [BOS_MODULES.SCHEME]: ['view'],
  },

  // Default (no specific role): No BOS access
  // BOS module is restricted to: faculty, hod, principal, super_admin
  // All other roles (student, staff, parent, coordinator, guest, driver, nif_coordinator, etc.)
  // must be explicitly granted access via custom_roles.permissions in user_roles
  default: {},
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

/**
 * Merges DEFAULT_ROLE_PERMISSIONS for the given role keys into a flat permissions map
 * when the database role has no academic.bos-* keys yet. Also ensures the parent
 * 'bos.view' sidebar gate is set whenever any academic.bos-*.view permission is present.
 *
 * Two problems this solves:
 * 1. DB roles that predate BOS modules have no academic.bos-* keys — seed from defaults.
 * 2. MENU_PERMISSIONS['/bos'] requires 'bos.view' — without it the entire BOS sidebar
 *    section is hidden even when all granular academic.bos-*.view keys are present
 *    (BUG-003340: HOD at JKKN CAS could not see /bos/experts).
 */
export function applyBOSFallback(
  flatPerms: Record<string, boolean>,
  roleKeys: string[]
): void {
  const hasBOS = Object.keys(flatPerms).some((k) => k.startsWith('academic.bos'));
  if (!hasBOS) {
    for (const roleKey of roleKeys) {
      const defaultPerms = getRolePermissions(roleKey);
      for (const [module, actions] of Object.entries(defaultPerms)) {
        for (const action of actions) {
          const key = `${module}.${action}`;
          if (!flatPerms[key]) flatPerms[key] = true;
        }
      }
    }
  }
  // Ensure the parent sidebar gate is set regardless of whether perms came from DB or
  // were just seeded above — only when the user actually has a BOS view permission.
  const hasBosViewPerm = Object.keys(flatPerms).some(
    (k) => k.startsWith('academic.bos') && k.endsWith('.view') && flatPerms[k]
  );
  if (hasBosViewPerm && flatPerms['bos.view'] === undefined) flatPerms['bos.view'] = true;
}
