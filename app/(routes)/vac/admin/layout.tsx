// VAC admin subtree — canonical permission enforcement.
// Created 2026-06-19. /vac/admin/* (course/lesson/case-track editors) were
// unguarded. Gated by declared MENU_PERMISSIONS permission. Placed at /vac/admin
// (NOT /vac) so student-facing /vac/courses learning pages are untouched.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function VacAdminLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
