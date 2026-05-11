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
  const { isLoading, canPerformAll, canPerformAny, isSuperAdmin, isAdmissionGlobalUser, isCounselorUser } =
    usePermissions([], {
      waitForLoad: true
    });

  // Handle loading state
  if (isLoading) {
    return <>{loading}</>;
  }

  // Super admins always have access to everything
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // 2026-05-11: carve out admin-only admission sub-modules from the
  // counselor/global bypass below. Counselor roles legitimately bypass for
  // their core working surface (leads, applications, dashboard, daily-view,
  // etc.), but they must NOT bypass for admin functions like settings,
  // marketing, consultants, the counselors manage tab, or GD-PI.
  //
  // The permission key under test = `${module}.${first action}`. If it falls
  // under one of these restricted prefixes, skip the broad bypass and fall
  // through to the explicit canAccess check below — which will deny for
  // counselor roles (their perms were revoked in the matching DB migration).
  const firstAction = Array.isArray(action) ? action[0] : action;
  const permKey = `${module}.${firstAction}`;
  const COUNSELOR_RESTRICTED_PREFIXES = [
    'admission.settings',
    'admission.marketing',
    'admission.consultants',
    'admission.counselors',
    'admission.gd_pi',
  ];
  const isRestrictedSubModule = COUNSELOR_RESTRICTED_PREFIXES.some((p) =>
    permKey.startsWith(p),
  );

  // Admission global users have full access to admission module pages,
  // EXCEPT the admin-only sub-modules listed above.
  if (
    isAdmissionGlobalUser
    && (module === 'admission' || module.startsWith('admission.'))
    && !isRestrictedSubModule
  ) {
    return <>{children}</>;
  }

  // Counselor users (in ANY of their assigned roles) can access admission
  // module pages, EXCEPT the admin-only sub-modules.
  if (
    isCounselorUser
    && (module === 'admission' || module.startsWith('admission.'))
    && !isRestrictedSubModule
  ) {
    return <>{children}</>;
  }

  // Check permissions for regular users
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
