// Learner-side vacate request form — gated by its declared MENU_PERMISSIONS
// permission (campus_living.vacate_requests.submit) via RoutePermissionGuard.
//
// This layout exists because the route had NO page-layer guard: the permission
// was declared in lib/sidebarMenuLink.ts, which hid the nav link, but a typed
// URL still rendered the form. The 2026-08-10 migration revoked that key from
// the student + parent roles to withdraw the feature from learners, and a
// revoke that only hides a link is not a revoke.
//
// Scoped to this leaf route, not to /campus-living/my-hostel: the hub relies on
// dynamic permission enrichment that RoutePermissionGuard does not replicate
// (see the SCOPE NOTE in components/auth/route-permission-guard.tsx), so
// wrapping the parent would over-deny residents their own hostel page.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function VacateRequestLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
