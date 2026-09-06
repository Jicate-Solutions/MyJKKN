'use client';

import { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
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
   * Optional content to render when the permission check does NOT pass.
   *
   * OMIT it and the guard renders a short built-in explanation of what access
   * is missing (see PermissionNotice below). That is the default because a
   * silent empty area is indistinguishable from a broken page or a slow load.
   *
   * Pass `fallback={null}` to opt into deliberate silence. That is the right
   * choice when the guard wraps a single inline control — a toolbar button, a
   * dropdown item, a link in a table row — where the correct behaviour on a
   * miss is to hide the control, not to print a paragraph in its place.
   */
  fallback?: ReactNode;

  /**
   * Optional loading content
   */
  loading?: ReactNode;
}

/**
 * The built-in explanation rendered when a guard denies and the caller did not
 * pass its own `fallback`.
 *
 * Two states, because they are two different facts and only one of them is the
 * viewer's problem:
 *
 *   'denied'  — we checked, and the permission is genuinely not granted.
 *   'unknown' — the permission lookup itself failed (offline, RPC timeout), so
 *               we do NOT know. `usePermissions` collapses both outcomes to
 *               `false`, so without this split a network blip would tell people
 *               to go request a permission they may already hold.
 *
 * Deliberately quiet: this is an inline state that can appear anywhere in a
 * page, not a full-page error screen.
 */
export function PermissionNotice({
  permissionKey,
  state
}: {
  permissionKey: string;
  state: 'denied' | 'unknown';
}) {
  return (
    <div
      role='note'
      className='my-4 flex max-w-2xl items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm'
    >
      <ShieldAlert
        aria-hidden='true'
        className='mt-0.5 h-4 w-4 shrink-0 text-muted-foreground'
      />
      <div className='space-y-1.5'>
        {state === 'unknown' ? (
          <>
            <p className='font-medium text-foreground'>
              We could not check your access just now
            </p>
            <p className='text-muted-foreground'>
              This looks like a connection problem, not a permission problem, so
              we have hidden this content instead of guessing. Reload the page to
              try again.
            </p>
            <p className='text-muted-foreground'>
              If it keeps happening, tap the red bug button at the bottom right
              of this screen and report it.
            </p>
          </>
        ) : (
          <>
            <p className='font-medium text-foreground'>
              This part of the page is not open to you
            </p>
            <p className='text-muted-foreground'>
              Nothing is broken. None of your roles include the permission{' '}
              <code className='rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground'>
                {permissionKey}
              </code>
              , so this content stays hidden.
            </p>
            <p className='text-muted-foreground'>
              To get it, ask whoever manages roles for your institution to add
              that permission under Users, then Role Management. If you think you
              should already have it, tap the red bug button at the bottom right
              of this screen and report it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Component that conditionally renders children based on user permissions for a module-action pair
 */
export function PermissionGuard({
  module,
  action,
  anyAction = false,
  children,
  fallback: callerFallback,
  loading = null
}: PermissionGuardProps) {
  const { isLoading, error, canPerformAll, canPerformAny, isSuperAdmin, isAdmissionGlobalUser, isCounselorUser } =
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
    // Convert-to-Admitted creates a learner_profiles row and is a privileged
    // operation reserved for admission officers/registrar/exec — counselors
    // (admission_counselor, expo_counselor, health_counselor, learner_counselor,
    // staff_counselor) must NOT bypass this key via the broad admission-module
    // carve-out below.
    'admission.leads.convert_to_admitted',
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

  // The denial view is only defaulted when the caller omitted the prop
  // entirely. An explicit `fallback={null}` still renders nothing, which is how
  // a call site opts into deliberate silence for a single inline control.
  const fallback =
    callerFallback === undefined ? (
      <PermissionNotice
        permissionKey={actions
          .map((a) => `${module}.${a}`)
          .join(anyAction ? ' or ' : ' and ')}
        state={error ? 'unknown' : 'denied'}
      />
    ) : (
      callerFallback
    );

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
