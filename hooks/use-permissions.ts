import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RoleService } from '@/lib/services/roles/role-service';
import { UserRolesService } from '@/lib/services/users/user-roles-service';
import { SYSTEM_ROLES, UserRoleAssignment } from '@/types/auth';
import { Profile, StudentStatus } from '@/types/auth';
import { useAuth } from './use-auth';

interface UsePermissionsOptions {
  /**
   * If true, will only return after permissions are loaded
   * If false (default), will initially return with no permissions
   */
  waitForLoad?: boolean;
}

// Define modules that graduated students can access
const GRADUATED_STUDENT_ALLOWED_MODULES = [
  'service_requests',
  'profile',
  'resources.digital',
  'resources.physical.view', // Read-only access to resources
  'billing.view', // View billing information only
  'academic.view' // View academic records only
];

// Helper function to check if a permission is allowed for graduated students
const isPermissionAllowedForGraduated = (permission: string): boolean => {
  return GRADUATED_STUDENT_ALLOWED_MODULES.some(
    (module) => permission.startsWith(module) || permission === module
  );
};

interface PermissionData {
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  userRoles: UserRoleAssignment[];
  primaryRole: UserRoleAssignment | null;
}

// Stable fallback references to prevent infinite re-render loops.
// Using inline `|| {}` or `|| []` creates new objects each render,
// which breaks useMemo dependency checks downstream.
const EMPTY_PERMISSIONS: Record<string, boolean> = {};
const EMPTY_ROLES: UserRoleAssignment[] = [];

export function usePermissions(
  requiredPermissions: string[] = [],
  options: UsePermissionsOptions = {}
) {
  const {
    profile: userProfile,
    isLoading: authLoading,
    error: authError
  } = useAuth();
  
  const { waitForLoad = false } = options;

  // Fetch permissions using React Query for caching
  const { 
    data: permissionData, 
    isLoading: queryLoading, 
    error: queryError 
  } = useQuery<PermissionData>({
    queryKey: ['permissions', userProfile?.id, userProfile?.role],
    queryFn: async () => {
      // If there's no user profile, return empty defaults
      if (!userProfile) {
        return {
          permissions: {},
          isSuperAdmin: false,
          userRoles: [],
          primaryRole: null
        };
      }

      // Check if user is a super admin (either by role or is_super_admin flag)
      const isSuperAdminUser =
        userProfile.role === SYSTEM_ROLES.SUPER_ADMIN ||
        userProfile.is_super_admin === true;

      // Super admins have all permissions, no need to fetch.
      if (isSuperAdminUser) {
        return {
          permissions: {}, // No specific permissions needed, isSuperAdmin flag is enough
          isSuperAdmin: true,
          userRoles: [],
          primaryRole: null
        };
      }

      // Try multi-role approach first (fetches roles with permissions via SECURITY DEFINER)
      try {
        const roles = await UserRolesService.getUserRoles(userProfile.id);

        if (roles && roles.length > 0) {
          // Merge permissions client-side from the already-fetched role data
          // This avoids the separate getMergedPermissions RPC which uses
          // SECURITY INVOKER and can fail due to RLS restrictions
          const mergedPermissions: Record<string, boolean> = {};
          for (const role of roles) {
            const rolePerms = role.permissions || {};
            for (const [key, value] of Object.entries(rolePerms)) {
              // Union (OR) logic: if ANY role grants permission, user has it
              if (value === true) {
                mergedPermissions[key] = true;
              } else if (mergedPermissions[key] !== true) {
                mergedPermissions[key] = value as boolean;
              }
            }
          }

          // Safety net: If the user's profiles.role is not represented in user_roles,
          // also merge permissions from the profile role's custom_role.
          // This handles data mismatches where profiles.role = 'hod' but user_roles
          // links to different custom_roles (e.g., Faculty + COE instead of HOD).
          const profileRoleKey = userProfile.role;
          const hasProfileRole = roles.some(
            (r) => r.role_key === profileRoleKey
          );

          if (!hasProfileRole && profileRoleKey) {
            console.warn(
              `[permissions] profiles.role="${profileRoleKey}" not found in user_roles (has: ${roles.map(r => r.role_key).join(', ')}). Merging profile role permissions as fallback.`
            );
            try {
              const profileRole = await RoleService.getRoleByKey(profileRoleKey);
              if (profileRole && profileRole.permissions) {
                for (const [key, value] of Object.entries(profileRole.permissions)) {
                  if (value === true) {
                    mergedPermissions[key] = true;
                  } else if (mergedPermissions[key] !== true) {
                    mergedPermissions[key] = value as boolean;
                  }
                }
              }
            } catch (profileRoleError) {
              console.warn(
                `[permissions] Failed to fetch profile role "${profileRoleKey}":`,
                profileRoleError
              );
            }
          }

          return {
            permissions: mergedPermissions,
            isSuperAdmin: false,
            userRoles: roles,
            primaryRole: roles.find((r) => r.is_primary) || roles[0]
          };
        }
      } catch (multiRoleError) {
        // Multi-role not available or failed, fall back to legacy
        console.warn(
          '[permissions] Multi-role fetch failed, falling back to legacy:',
          multiRoleError
        );
      }

      // Fall back to legacy single-role approach
      const role = await RoleService.getRoleByKey(userProfile.role);
      let rolePermissions = {};

      if (!role || typeof role !== 'object' || !('permissions' in role)) {
        console.warn(
          `Role ${userProfile.role} not found, using empty permissions`
        );
      } else {
        rolePermissions = (role as any).permissions || {};
      }

      return {
        permissions: rolePermissions,
        isSuperAdmin: false,
        userRoles: [],
        primaryRole: null
      };
    },
    enabled: !!userProfile && !authLoading,
    staleTime: 2 * 60 * 1000, // 2 minutes cache (reduced from 10 to reflect permission changes faster)
    gcTime: 10 * 60 * 1000,   // 10 minutes garbage collection
    retry: 1,
    // Respect global default (false). The old per-query override caused PermissionGuard
    // to re-render the entire page tree on every window focus event.
    // Permissions are cached for 2 minutes and refresh on mount — that's sufficient.
    refetchOnWindowFocus: false,
    // Only re-render when actual data/error/loading state changes.
    // Exclude isFetching: background refetches should not cascade re-renders
    // through PermissionGuard → ContentLayout → entire page.
    notifyOnChangeProps: ['data', 'error', 'isLoading'],
  });

  const permissions = permissionData?.permissions ?? EMPTY_PERMISSIONS;
  const isSuperAdmin = permissionData?.isSuperAdmin ?? false;
  const userRoles = permissionData?.userRoles ?? EMPTY_ROLES;
  const primaryRole = permissionData?.primaryRole ?? null;
  
  // Overall loading state
  const isLoading = authLoading || (!!userProfile && queryLoading);
  const error = authError ? new Error(authError) : (queryError as Error | null);

  // Student-specific properties
  const isStudent = useMemo(
    () => userProfile?.role === 'student',
    [userProfile?.role]
  );
  const studentStatus = useMemo(
    () => userProfile?.student_status || null,
    [userProfile?.student_status]
  );
  const studentId = useMemo(
    () => userProfile?.student_id || null,
    [userProfile?.student_id]
  );
  const isStudentProfileComplete = useMemo(
    () => userProfile?.student_profile_complete || false,
    [userProfile?.student_profile_complete]
  );

  // Enhanced permissions that consider student status (Task 3: Fine-grained access control)
  const enhancedPermissions = useMemo(() => {
    // If not a student or super admin, return permissions as-is
    if (isSuperAdmin || !isStudent || !studentStatus) {
      return permissions;
    }

    // Apply student status-based restrictions
    switch (studentStatus) {
      case 'inactive':
        // Inactive students have no access to permission-based modules
        return {};

      case 'graduated':
        // Graduated students can only access specific modules
        const filteredPermissions: Record<string, boolean> = {};
        Object.entries(permissions).forEach(([permission, hasAccess]) => {
          if (hasAccess && isPermissionAllowedForGraduated(permission)) {
            filteredPermissions[permission] = true;
          }
        });
        return filteredPermissions;

      case 'active':
        // Active students get full permissions based on their role
        return permissions;

      case 'pending':
        // Pending students should be redirected by middleware, but if they get here,
        // they only have access to profile completion
        return {
          'profile.view': permissions['profile.view'] || false,
          'profile.edit': permissions['profile.edit'] || false
        };

      case 'exited':
        // Exited students should be logged out by middleware, but if they get here,
        // they have no access
        return {};

      default:
        // Unknown status - no access for safety
        console.warn(`Unknown student status in permissions: ${studentStatus}`);
        return {};
    }
  }, [permissions, isStudent, studentStatus, isSuperAdmin]);

  // Load permissions from role - REPLACED BY REACT QUERY ABOVE
  // useEffect removed in favor of useQuery
  
  // Check if user has all required permissions (using enhanced permissions)
  const hasAllPermissions = useMemo(() => {
    if (isLoading && waitForLoad) return false;
    // Super admins always have all permissions
    if (isSuperAdmin) return true;
    return (
      !error && requiredPermissions.every((perm) => enhancedPermissions[perm])
    );
  }, [
    isLoading,
    error,
    requiredPermissions,
    enhancedPermissions,
    waitForLoad,
    isSuperAdmin
  ]);

  // Check if user has any of the required permissions (using enhanced permissions)
  const hasAnyPermission = useMemo(() => {
    if (isLoading && waitForLoad) return false;
    // Super admins always have all permissions
    if (isSuperAdmin) return true;
    return (
      !error && requiredPermissions.some((perm) => enhancedPermissions[perm])
    );
  }, [
    isLoading,
    error,
    requiredPermissions,
    enhancedPermissions,
    waitForLoad,
    isSuperAdmin
  ]);

  // Check if user has specific permission for a module and action (using enhanced permissions)
  const canAccess = useCallback(
    (module: string, action: string) => {
      // Super admins can access everything
      if (isSuperAdmin) {
        return true;
      }

      // Block access for ALL users while permissions are loading
      // This prevents content flash for unauthorized pages
      if (isLoading) {
        return false;
      }

      const permKey = `${module}.${action}`;

      return enhancedPermissions[permKey] || false;
    },
    [enhancedPermissions, isSuperAdmin, isLoading, isStudent]
  );

  // Check if user has all specified actions for a module
  const canPerformAll = useCallback(
    (module: string, actions: string[]) => {
      // Super admins can perform all actions
      if (isSuperAdmin) return true;
      return actions.every((action) => canAccess(module, action));
    },
    [canAccess, isSuperAdmin]
  );

  // Check if user has any of the specified actions for a module
  const canPerformAny = useCallback(
    (module: string, actions: string[]) => {
      // Super admins can perform all actions
      if (isSuperAdmin) return true;
      return actions.some((action) => canAccess(module, action));
    },
    [canAccess, isSuperAdmin]
  );

  // Get all permissions for a specific module (using enhanced permissions)
  const getModulePermissions = useCallback(
    (module: string) => {
      // If super admin, return all actions as true
      if (isSuperAdmin) {
        // Create a mock permissions object with all actions set to true
        const actions = ['view', 'create', 'edit', 'delete', 'assign'];
        return actions.reduce((acc, action) => {
          acc[action] = true;
          return acc;
        }, {} as Record<string, boolean>);
      }

      return Object.entries(enhancedPermissions)
        .filter(([key]) => key.startsWith(`${module}.`))
        .reduce((acc, [key, value]) => {
          // Extract the action part after the module prefix
          const action = key.substring(module.length + 1);
          acc[action] = value;
          return acc;
        }, {} as Record<string, boolean>);
    },
    [enhancedPermissions, isSuperAdmin]
  );

  return {
    permissions: enhancedPermissions, // Return enhanced permissions instead of raw permissions
    isLoading,
    error,
    hasAllPermissions,
    hasAnyPermission,
    isSuperAdmin,
    userProfile,

    // Multi-role properties
    userRoles,          // All roles assigned to the user
    primaryRole,        // The user's primary role
    hasMultipleRoles: userRoles.length > 1,

    // Student-specific properties
    isStudent,
    studentStatus,
    studentId,
    isStudentProfileComplete,

    // Generic permission check (legacy support) - using enhanced permissions
    can: (permission: string) =>
      isLoading ? false : isSuperAdmin ? true : enhancedPermissions[permission] || false,
    // New module-based permission checks
    canAccess,
    canPerformAll,
    canPerformAny,
    getModulePermissions
  };
}
