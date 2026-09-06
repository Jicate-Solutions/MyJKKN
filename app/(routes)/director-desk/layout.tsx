// Director's Desk — canonical permission enforcement.
//
// Gated by the route's declared MENU_PERMISSIONS key
// ('/director-desk' -> 'director.handover.view_all'), the same source the
// sidebar reads, so page access and nav visibility cannot disagree.
//
// The page also gates its own body: a guard that only hides the nav link would
// leave the URL typeable, which is exactly how ~90 sensitive pages leaked to
// learners before RoutePermissionGuard existed (2026-06-19).
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function DirectorDeskLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
