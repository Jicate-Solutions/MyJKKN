// On-behalf vacate entry — gated by its declared MENU_PERMISSIONS permission
// (campus_living.vacate_requests.submit_on_behalf) via RoutePermissionGuard.
// The RPC (fn_cl_vacate_create) re-checks the key and the block/institution
// scope; this guard only keeps the form itself from rendering for everyone else.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function RaiseVacateOnBehalfLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
