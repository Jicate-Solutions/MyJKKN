'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';

interface PermissionGuardProps {
  /**
   * The module key to check permissions against (e.g., 'users', 'applications')
   */
  module: string;

  /**
   * The action to check (e.g., 'view', 'create', 'edit', 'delete')
   */
  action: string | string[];

  /**
   * If true, component will render when user has ANY of the specified actions (default: false)
   * If false, user must have ALL specified actions
   */
  anyAction?: boolean;

  /**
   * Content to render when permission check passes
   */
  children: ReactNode;

  /**
   * Optional fallback content for when permission check fails
   * If not provided, renders nothing when check fails
   */
  fallback?: ReactNode;

  /**
   * Optional loading content
   */
  loading?: ReactNode;
}

/**
 * Component that conditionally renders children based on user permissions for a module-action pair
 */
export function PermissionGuard({
  module,
  action,
  anyAction = false,
  children,
  fallback = null,
  loading = null
}: PermissionGuardProps) {
  const { isLoading, canPerformAll, canPerformAny } = usePermissions([], {
    waitForLoad: true
  });

  // Handle loading state
  if (isLoading) {
    return <>{loading}</>;
  }

  // Check permissions
  const actions = Array.isArray(action) ? action : [action];
  const hasPermission = anyAction
    ? canPerformAny(module, actions)
    : canPerformAll(module, actions);

  // Render based on permission check
  return <>{hasPermission ? children : fallback}</>;
}

/**
 * Shorthand component for permission-based render with specific common actions
 */
export function CanView({
  module,
  children,
  fallback
}: Omit<PermissionGuardProps, 'action'>) {
  return (
    <PermissionGuard module={module} action='view' fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function CanCreate({
  module,
  children,
  fallback
}: Omit<PermissionGuardProps, 'action'>) {
  return (
    <PermissionGuard module={module} action='create' fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function CanEdit({
  module,
  children,
  fallback
}: Omit<PermissionGuardProps, 'action'>) {
  return (
    <PermissionGuard module={module} action='edit' fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function CanDelete({
  module,
  children,
  fallback
}: Omit<PermissionGuardProps, 'action'>) {
  return (
    <PermissionGuard module={module} action='delete' fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function CanManage({
  module,
  children,
  fallback
}: Omit<PermissionGuardProps, 'action'>) {
  return (
    <PermissionGuard
      module={module}
      action={['view', 'edit']}
      anyAction={false}
      fallback={fallback}
    >
      {children}
    </PermissionGuard>
  );
}

export function CanContribute({
  module,
  children,
  fallback
}: Omit<PermissionGuardProps, 'action'>) {
  return (
    <PermissionGuard
      module={module}
      action={['view', 'create', 'edit']}
      anyAction={false}
      fallback={fallback}
    >
      {children}
    </PermissionGuard>
  );
}

export function HasFullAccess({
  module,
  children,
  fallback
}: Omit<PermissionGuardProps, 'action'>) {
  return (
    <PermissionGuard
      module={module}
      action={['view', 'create', 'edit', 'delete']}
      anyAction={false}
      fallback={fallback}
    >
      {children}
    </PermissionGuard>
  );
}
