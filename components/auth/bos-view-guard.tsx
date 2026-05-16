'use client';

import { ReactNode } from 'react';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { PermissionGuard } from './permission-guard';

interface BosViewGuardProps {
  /** Permission module (e.g. 'academic.bos-courses'). The view action is implied. */
  module: string;
  children: ReactNode;
  /** Rendered when neither role-permission nor composition membership grants access. Defaults to null (blank page). */
  fallback?: ReactNode;
}

/**
 * View-gate for BoS pages. Renders children if EITHER:
 *   (a) the caller has `<module>.view` in their role's permissions JSONB, OR
 *   (b) the caller is on any active bos_members row (composition membership).
 *
 * Why both: faculty/coordinator users frequently appear on BoS compositions
 * as internal_member without their *role* carrying the page-view permission
 * (e.g. faculty seed config in lib/services/bos/bos-role-permissions.ts is
 * view-only and historically wasn't backfilled into custom_roles.permissions
 * with the dot-format key the canAccess() lookup requires). Globally granting
 * the role would over-broaden access — every faculty would see the page even
 * if they have no BoS responsibility. The membership escape hatch ties access
 * to actual board participation, which is the product intent.
 *
 * The hook useBosBoardScope().hasAnyAccess returns true for super_admin,
 * principal, or anyone with ≥1 active bos_members row on an active composition.
 * That set matches the people who SHOULD be able to land on a BoS page.
 *
 * Write actions (create / edit / delete) are NOT covered by this guard.
 * Those should continue to use either:
 *   - PermissionGuard for role-only gates, or
 *   - canEditComposition / canWriteCompositionData helpers in
 *     hooks/bos/use-bos-board-scope.ts for composition-scoped writes.
 */
export function BosViewGuard({ module, children, fallback = null }: BosViewGuardProps) {
  const scope = useBosBoardScope();

  // While scope is loading, defer to PermissionGuard so its own loading state
  // applies — avoids a render flash where everyone briefly sees the page.
  if (scope.isLoading) {
    return (
      <PermissionGuard module={module} action='view' fallback={fallback}>
        {children}
      </PermissionGuard>
    );
  }

  // Composition member, principal, or super-admin: grant access regardless
  // of whether the role-permission key exists in custom_roles.permissions.
  if (scope.hasAnyAccess) return <>{children}</>;

  // Fall back to the standard role-permission check so non-members who
  // legitimately hold the permission (e.g. administrator) still pass.
  return (
    <PermissionGuard module={module} action='view' fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}
