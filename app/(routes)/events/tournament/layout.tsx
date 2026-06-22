// Sports Tournament module — canonical permission enforcement for the subtree.
// Created 2026-06-22 (Sports Tournament PR1). Every /events/tournament route is
// gated by the SAME permission it declares in MENU_PERMISSIONS, via the same
// isPageAccessible() rule the sidebar uses (see RoutePermissionGuard, PR #1512).
// No public/token pages live under /events/tournament in PR1, so the whole
// subtree is gated. (The public no-login scoreboard arrives in PR4 under /p/*.)
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function TournamentLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
