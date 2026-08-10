'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
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
  // The AuthProvider already holds the viewer's profiles row (fetched once,
  // app-wide). Until 2026-08-02 this guard ALSO fired its own
  // refreshSession() + getUser() + profiles select on every mount — three
  // redundant network calls per guarded page — only to read profile.role,
  // the exact field the shared context carries.
  const { profile, isLoading: authLoading } = useAuth();
  const userRole = profile?.role ?? null;

  // The permissions hook gives us admin status directly
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  // Handle loading state
  if (authLoading || permissionsLoading) {
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
