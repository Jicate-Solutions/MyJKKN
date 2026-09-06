// CDC admin subtree — canonical permission enforcement.
// Created 2026-06-19. /cdc/admin/* config pages (drive/offer/recruiter types,
// recruiters, sectors) were unguarded. Gated here by each route's declared
// MENU_PERMISSIONS permission. Placed at /cdc/admin (NOT /cdc) so student-facing
// /cdc pages are untouched.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function CdcAdminLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
