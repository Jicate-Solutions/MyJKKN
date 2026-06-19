// ============================================================================
// /users subtree — canonical permission enforcement.
// Created: 2026-06-19.
//
// The User Management module (All Users, user detail/edit, roles, permissions
// audit, activity) is back-office admin surface. Several of its pages shipped
// with no page-layer guard, so they rendered to any authenticated user by
// direct URL even though the sidebar correctly hid the links.
//
// Rather than hand-add a guard to each page, this layout enforces — for the
// whole subtree — the SAME permission each route already declares in
// MENU_PERMISSIONS, using the same isPageAccessible() rule the sidebar uses.
// Page-access now equals sidebar-visibility. See RoutePermissionGuard.
// ============================================================================

import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function UsersLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
