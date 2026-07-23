// Global Calendar module — route guard for the whole subtree.
// Enforces, per route, the SAME permission declared in MENU_PERMISSIONS via the
// shared isPageAccessible() rule the sidebar uses. Mirrors app/(routes)/hr/layout.tsx.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
