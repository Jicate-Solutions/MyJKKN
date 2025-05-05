'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { UserService } from '@/lib/services/users/user-service';
import { SYSTEM_ROLES } from '@/types/auth';

interface AdminPermissionGuardProps {
  /**
   * Content to render when the user is an administrator
   */
  children: ReactNode;

  /**
   * Optional fallback content for when user is not an admin
   * If not provided, renders nothing when check fails
   */
  fallback?: ReactNode;

  /**
   * Optional loading content
   */
  loading?: ReactNode;

  /**
   * Roles that should be considered administrators
   * By default, only super_admin is considered an admin
   */
  adminRoles?: string[];
}

/**
 * Component that conditionally renders children based on whether the user
 * has an administrator role. This is independent of permissions.
 */
export function AdminPermissionGuard({
  children,
  fallback = null,
  loading = null,
  adminRoles = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR]
}: AdminPermissionGuardProps) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The permissions hook gives us admin status directly
  const { isSuperAdmin } = usePermissions();

  // Check user role for admin status
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        setIsLoading(true);
        const { data: profile } = await UserService.getCurrentUserProfile();
        if (profile) {
          setUserRole(profile.role);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserRole();
  }, []);

  // Handle loading state
  if (isLoading) {
    return <>{loading}</>;
  }

  // Check if user has admin role
  const isAdmin = isSuperAdmin || (userRole && adminRoles.includes(userRole));

  // Render based on admin status
  return <>{isAdmin ? children : fallback}</>;
}

/**
 * Use this component to conditionally render content only for super admins
 */
export function SuperAdminOnly({
  children,
  fallback = null,
  loading = null
}: Omit<AdminPermissionGuardProps, 'adminRoles'>) {
  const { isSuperAdmin, isLoading } = usePermissions();

  // Handle loading state
  if (isLoading) {
    return <>{loading}</>;
  }

  return <>{isSuperAdmin ? children : fallback}</>;
}
