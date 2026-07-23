'use client';

// Induction module — permission gate. Gated by the route's MENU_PERMISSIONS entry
// ('/events/induction' -> 'induction.view'), PLUS a coordinator carve-out: an appointed
// induction event-coordinator (authorized by every induction RPC via is_event_coordinator,
// but who may hold no induction.view permission — e.g. a staff/HOD-role coordinator) is
// still let into the module UI. Per-event authorization stays enforced server-side by
// can_manage_training on every RPC, so entering the module leaks nothing.
// 'use client' is required to pass the fallbackCheck function to the client guard.
// (Hardening audit 2026-07-06 #3.)
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
import { InductionVolunteerService } from '@/lib/services/induction/induction-volunteer-service';

// Module scope keeps the reference stable across renders (the guard requires it).
const coordinatorFallback = () => InductionVolunteerService.isAnyEventCoordinator();

export default function InductionLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard fallbackCheck={coordinatorFallback}>{children}</RoutePermissionGuard>;
}
