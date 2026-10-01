// Gated by campus_living.damage_types.manage (declared in MENU_PERMISSIONS)
// via RoutePermissionGuard. The table's RLS write policies enforce the same key.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function DamageTypesSettingsLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
