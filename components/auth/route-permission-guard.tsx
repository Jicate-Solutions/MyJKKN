'use client';

// ============================================================================
// RoutePermissionGuard — page-layer enforcement of a route's DECLARED permission
// Created: 2026-06-19.
//
// THE PROBLEM IT CLOSES
//   The sidebar already hides nav links a user can't access, using the
//   route->permission map in MENU_PERMISSIONS (lib/sidebarMenuLink) and the
//   access rule in isPageAccessible (lib/navigation/permission-filter). But a
//   *hidden link's page still rendered if the user typed the URL* — there was no
//   page-layer enforcement (no middleware, route-matcher was never wired up).
//   That is how /hr/admin and ~90 other sensitive pages leaked to learners.
//
// THE CANONICAL FIX (extend the pattern, don't invent per-file guards)
//   This guard reuses the SAME three canonical sources the nav already trusts —
//   no raw custom_roles queries, no hand-picked per-page keys:
//     1. routeMatcher.match(pathname).permission  -> the route's declared
//        permission from MENU_PERMISSIONS (wildcard-aware for [id] segments).
//     2. isPageAccessible(...)                     -> the exact access rule the
//        sidebar uses (super-admin bypass, student-portal carve-outs, etc.).
//     3. usePermissions()                          -> the user's resolved,
//        multi-role-merged permission map (NOT the raw role table).
//   Result: page-access == sidebar-visibility. The page and the nav can no
//   longer disagree, because they read the same source of truth.
//
// HOW TO USE
//   Wrap a module subtree by adding `app/(routes)/<module>/layout.tsx`:
//       export default function ModuleLayout({ children }) {
//         return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
//       }
//   Every current and future page in that module is then enforced by its
//   declared permission. A route with NO MENU_PERMISSIONS entry is allowed
//   (same as the nav: "no permission field = visible to all authenticated
//   users") — so an admin route that must be gated needs a MENU_PERMISSIONS
//   entry. Extend the map; do not special-case the page.
//
// SCOPE NOTE
//   Apply per-module to the admin/back-office modules. The root layout is
//   intentionally NOT wrapped: a few modules (admission marketing expos,
//   marathon ops, campus-living my-hostel) rely on dynamic permission
//   *enrichment* in components/Navbar/menu.tsx that this guard does not
//   replicate, so a blanket root guard could over-deny those edge cases.
// ============================================================================

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { usePermissions } from '@/hooks/use-permissions';
import { routeMatcher } from '@/lib/auth/route-matcher';
import { isPageAccessible } from '@/lib/navigation/permission-filter';
import { isExemptPath } from '@/lib/auth/route-exempt';
import { PermissionError } from '@/components/errors/permission-error';

interface RoutePermissionGuardProps {
  children: ReactNode;
  /** Optional content while permissions resolve. Defaults to null (no flash). */
  loading?: ReactNode;
  /**
   * Path prefixes that are intentionally public/auth-by-other-means and must
   * NOT be gated, even though the matcher would inherit a parent's permission
   * for them. Use for payment callbacks, token-validated pages, etc. that live
   * under an otherwise-admin module (e.g. ['/billing/payment']). Matched as a
   * prefix on the current pathname.
   */
  exemptPrefixes?: string[];
}

export function RoutePermissionGuard({
  children,
  loading = null,
  exemptPrefixes,
}: RoutePermissionGuardProps) {
  // Hooks first, unconditionally (Rules of Hooks — no early return above these).
  const pathname = usePathname() ?? '';
  const { permissions, isSuperAdmin, userProfile, isLoading } = usePermissions([], {
    waitForLoad: true,
  });

  // Intentionally-public subpaths (payment callbacks, token pages) opt out of
  // permission gating — they enforce access by their own means. See isExemptPath.
  if (isExemptPath(pathname, exemptPrefixes)) {
    return <>{children}</>;
  }

  // Never flash gated content (or a denial) before permissions are known.
  if (isLoading) {
    return <>{loading}</>;
  }

  // Resolve the route's declared permission from the canonical map. Wildcard
  // ([id]) segments are handled by the matcher. `undefined` => no declared
  // permission => isPageAccessible allows it (parity with the sidebar).
  const permission = routeMatcher.match(pathname)?.permission;
  const userRole = userProfile?.role ?? '';

  const allowed = isPageAccessible(
    pathname,
    permission,
    permissions,
    isSuperAdmin,
    userRole,
  );

  if (!allowed) {
    return (
      <PermissionError
        message="You do not have permission to access this page."
        requiredPermission={permission}
      />
    );
  }

  return <>{children}</>;
}
