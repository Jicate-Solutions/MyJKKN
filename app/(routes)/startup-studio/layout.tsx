// Startup-studio module; leaderboard exempted (own committee-membership layout).
// Created 2026-06-19. Canonical permission enforcement via RoutePermissionGuard
// (enforces each route's declared MENU_PERMISSIONS permission; see PR #1512).
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function StartupStudioLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard exemptPrefixes={{['/startup-studio/solve-for-100/leaderboard']}}>{children}</RoutePermissionGuard>;
}
