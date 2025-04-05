import { useState, useEffect } from 'react';
import { UserService } from '@/lib/services/users/user-service';
import { RoleService } from '@/lib/services/roles/role-service';

export function usePermissions(requiredPermissions: string[] = []) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
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

        setPermissions(role.permissions || {});
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  // Check if user has all required permissions
  const hasAllPermissions =
    !isLoading &&
    !error &&
    requiredPermissions.every((perm) => permissions[perm]);

  // Check if user has any of the required permissions
  const hasAnyPermission =
    !isLoading &&
    !error &&
    requiredPermissions.some((perm) => permissions[perm]);

  return {
    permissions,
    isLoading,
    error,
    hasAllPermissions,
    hasAnyPermission,
    // Helper to check a specific permission
    can: (permission: string) => permissions[permission] || false
  };
}
