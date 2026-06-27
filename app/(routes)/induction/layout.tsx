// Induction module — permission gate. Gated by the route's MENU_PERMISSIONS
// entry ('/induction' -> 'induction.view'). Mirrors the cdc/admin guard pattern.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function InductionLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
