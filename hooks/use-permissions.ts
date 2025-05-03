import { useState, useEffect, useMemo, useCallback } from 'react';
import { UserService } from '@/lib/services/users/user-service';
import { RoleService } from '@/lib/services/roles/role-service';

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
    return !error && requiredPermissions.every((perm) => permissions[perm]);
  }, [isLoading, error, requiredPermissions, permissions, waitForLoad]);

  // Check if user has any of the required permissions
  const hasAnyPermission = useMemo(() => {
    if (isLoading && waitForLoad) return false;
    return !error && requiredPermissions.some((perm) => permissions[perm]);
  }, [isLoading, error, requiredPermissions, permissions, waitForLoad]);

  // Check if user has specific permission for a module and action
  const canAccess = useCallback(
    (module: string, action: string) => {
      const permKey = `${module}.${action}`;
      return permissions[permKey] || false;
    },
    [permissions]
  );

  // Check if user has all specified actions for a module
  const canPerformAll = useCallback(
    (module: string, actions: string[]) => {
      return actions.every((action) => canAccess(module, action));
    },
    [canAccess]
  );

  // Check if user has any of the specified actions for a module
  const canPerformAny = useCallback(
    (module: string, actions: string[]) => {
      return actions.some((action) => canAccess(module, action));
    },
    [canAccess]
  );

  // Get all permissions for a specific module
  const getModulePermissions = useCallback(
    (module: string) => {
      return Object.entries(permissions)
        .filter(([key]) => key.startsWith(`${module}.`))
        .reduce((acc, [key, value]) => {
          // Extract the action part after the module prefix
          const action = key.substring(module.length + 1);
          acc[action] = value;
          return acc;
        }, {} as Record<string, boolean>);
    },
    [permissions]
  );

  return {
    permissions,
    isLoading,
    error,
    hasAllPermissions,
    hasAnyPermission,
    // Generic permission check (legacy support)
    can: (permission: string) => permissions[permission] || false,
    // New module-based permission checks
    canAccess,
    canPerformAll,
    canPerformAny,
    getModulePermissions
  };
}
