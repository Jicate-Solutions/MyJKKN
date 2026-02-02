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

      // Try multi-role approach first (fetches merged permissions from all roles)
      try {
        const roles = await UserRolesService.getUserRoles(userProfile.id);

        if (roles && roles.length > 0) {
          // Get merged permissions (Union/OR logic)
          const mergedPermissions = await UserRolesService.getMergedPermissions(
            userProfile.id
          );

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
    staleTime: 10 * 60 * 1000, // 10 minutes cache
    gcTime: 30 * 60 * 1000,    // 30 minutes garbage collection
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const permissions = permissionData?.permissions || {};
  const isSuperAdmin = permissionData?.isSuperAdmin || false;
  const userRoles = permissionData?.userRoles || [];
  const primaryRole = permissionData?.primaryRole || null;
  
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

      // CRITICAL FIX: Don't block access while permissions are loading for non-students
      // This prevents the race condition that causes unauthorized redirects
      if (isLoading) {
        // For students, we need to be more restrictive during loading
        if (isStudent) {
          return false;
        }
        // For staff/admin users, allow temporary access during loading to prevent redirects
        // The actual permissions will be checked once loading completes
        return true;
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
      isSuperAdmin ? true : enhancedPermissions[permission] || false,
    // New module-based permission checks
    canAccess,
    canPerformAll,
    canPerformAny,
    getModulePermissions
  };
}
