import { useState, useEffect, useMemo, useCallback } from 'react';
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

export function usePermissions(
  requiredPermissions: string[] = [],
  options: UsePermissionsOptions = {}
) {
  const {
    profile: userProfile,
    isLoading: authLoading,
    error: authError
  } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRoles, setUserRoles] = useState<UserRoleAssignment[]>([]);
  const [primaryRole, setPrimaryRole] = useState<UserRoleAssignment | null>(null);
  const { waitForLoad = false } = options;

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

  // Load permissions from role
  useEffect(() => {
    let mounted = true;

    const fetchPermissions = async () => {
      // If there's no user profile, reset states and finish loading.
      if (!userProfile) {
        if (mounted) {
          setPermissions({});
          setIsSuperAdmin(false);
          setUserRoles([]);
          setPrimaryRole(null);
          setError(authError ? new Error(authError) : null);
          setIsLoading(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Check if user is a super admin (either by role or is_super_admin flag)
        const isSuperAdminUser =
          userProfile.role === SYSTEM_ROLES.SUPER_ADMIN ||
          userProfile.is_super_admin === true;
        if (mounted) {
          setIsSuperAdmin(isSuperAdminUser);
        }

        // Super admins have all permissions, no need to fetch.
        if (isSuperAdminUser) {
          if (mounted) {
            setPermissions({}); // No specific permissions needed, isSuperAdmin flag is enough
            setUserRoles([]);
            setPrimaryRole(null);
            setIsLoading(false);
          }
          return;
        }

        // Try multi-role approach first (fetches merged permissions from all roles)
        try {
          const roles = await UserRolesService.getUserRoles(userProfile.id);

          if (roles && roles.length > 0) {
            // User has roles in the junction table - use multi-role permissions
            if (mounted) {
              setUserRoles(roles);
              setPrimaryRole(roles.find((r) => r.is_primary) || roles[0]);
            }

            // Get merged permissions (Union/OR logic)
            const mergedPermissions = await UserRolesService.getMergedPermissions(
              userProfile.id
            );

            if (mounted) {
              setPermissions(mergedPermissions);
            }

            return;
          }
        } catch (multiRoleError) {
          // Multi-role not available or failed, fall back to legacy
          console.warn(
            '[permissions] Multi-role fetch failed, falling back to legacy:',
            multiRoleError
          );
        }

        // Fall back to legacy single-role approach
        if (mounted) {
          setUserRoles([]);
          setPrimaryRole(null);
        }

        // Get role permissions from legacy single-role
        const role = await RoleService.getRoleByKey(userProfile.role);

        if (!role || typeof role !== 'object' || !('permissions' in role)) {
          console.warn(
            `Role ${userProfile.role} not found, using empty permissions`
          );
          if (mounted) {
            setPermissions({});
          }
        } else {
          if (mounted) {
            setPermissions((role as any).permissions || {});
          }
        }
      } catch (err) {
        console.error('Error fetching permissions:', err);
        if (mounted) {
          setError(
            err instanceof Error
              ? err
              : new Error('Unknown error fetching permissions')
          );
          setPermissions({});
          setUserRoles([]);
          setPrimaryRole(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // Only fetch permissions once authentication is complete.
    if (!authLoading) {
      fetchPermissions();
    }

    return () => {
      mounted = false;
    };
  }, [userProfile, authLoading, authError]);

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
