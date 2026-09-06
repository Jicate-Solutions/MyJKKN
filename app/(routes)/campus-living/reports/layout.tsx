// Campus-living reports (admin); placed off the student dashboard root.
// Created 2026-06-19. Canonical permission enforcement via RoutePermissionGuard
// (enforces each route's declared MENU_PERMISSIONS permission; see PR #1512).
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function CampusReportsLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
