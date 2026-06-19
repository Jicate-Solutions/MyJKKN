// HR module — canonical permission enforcement for the whole subtree.
// Created 2026-06-19. HR pages (workforce, leave, recruitment, performance,
// compensation) shipped without page guards and rendered to any authenticated
// user — including learners — by direct URL. This layout enforces, for every
// HR route, the SAME permission it already declares in MENU_PERMISSIONS, via
// the same isPageAccessible() rule the sidebar uses (see RoutePermissionGuard).
// No public/token pages live under /hr, so the whole module is gated.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function HrLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
