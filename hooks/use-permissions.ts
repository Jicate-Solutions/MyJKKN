import { useState, useEffect, useMemo, useCallback } from 'react';
import { UserService } from '@/lib/services/users/user-service';
import { RoleService } from '@/lib/services/roles/role-service';
import { SYSTEM_ROLES } from '@/types/auth';

interface UsePermissionsOptions {
  /**
   * If true, will only return after permissions are loaded
   * If false (default), will initially return with no permissions
   */
  waitForLoad?: boolean;
}

export function usePermissions(
  requiredPermissions: string[] = [],
  options: UsePermissionsOptions = {}
) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const { waitForLoad = false } = options;

  // Load permissions from role
  useEffect(() => {
    let mounted = true;
    const fetchPermissions = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get current user profile
        const { data: profile, error: profileError } =
          await UserService.getCurrentUserProfile();

        if (profileError) throw profileError;
        if (!profile) throw new Error('User profile not found');

        // Check if user is a super admin
        const isSuperAdminUser = profile.role === SYSTEM_ROLES.SUPER_ADMIN;
        if (mounted) {
          setIsSuperAdmin(isSuperAdminUser);
        }

        // Get role permissions
        const role = await RoleService.getRoleByKey(profile.role);

        if (!role) throw new Error(`Role ${profile.role} not found`);

        if (mounted) {
          setPermissions(role.permissions || {});
        }
      } catch (err) {
        console.error('Error fetching permissions:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPermissions();
    return () => {
      mounted = false;
    };
  }, []);

  // Check if user has all required permissions
  const hasAllPermissions = useMemo(() => {
    if (isLoading && waitForLoad) return false;
    // Super admins always have all permissions
    if (isSuperAdmin) return true;
    return !error && requiredPermissions.every((perm) => permissions[perm]);
  }, [
    isLoading,
    error,
    requiredPermissions,
    permissions,
    waitForLoad,
    isSuperAdmin
  ]);

  // Check if user has any of the required permissions
  const hasAnyPermission = useMemo(() => {
    if (isLoading && waitForLoad) return false;
    // Super admins always have all permissions
    if (isSuperAdmin) return true;
    return !error && requiredPermissions.some((perm) => permissions[perm]);
  }, [
    isLoading,
    error,
    requiredPermissions,
    permissions,
    waitForLoad,
    isSuperAdmin
  ]);

  // Check if user has specific permission for a module and action
  const canAccess = useCallback(
    (module: string, action: string) => {
      // Super admins can access everything
      if (isSuperAdmin) {
        return true;
      }

      // If permissions are still loading, log and return false to prevent premature redirects
      if (isLoading) {
        return false;
      }

      const permKey = `${module}.${action}`;

      return permissions[permKey] || false;
    },
    [permissions, isSuperAdmin, isLoading]
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

  // Get all permissions for a specific module
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

      return Object.entries(permissions)
        .filter(([key]) => key.startsWith(`${module}.`))
        .reduce((acc, [key, value]) => {
          // Extract the action part after the module prefix
          const action = key.substring(module.length + 1);
          acc[action] = value;
          return acc;
        }, {} as Record<string, boolean>);
    },
    [permissions, isSuperAdmin]
  );

  return {
    permissions,
    isLoading,
    error,
    hasAllPermissions,
    hasAnyPermission,
    isSuperAdmin,
    // Generic permission check (legacy support)
    can: (permission: string) =>
      isSuperAdmin ? true : permissions[permission] || false,
    // New module-based permission checks
    canAccess,
    canPerformAll,
    canPerformAny,
    getModulePermissions
  };
}
