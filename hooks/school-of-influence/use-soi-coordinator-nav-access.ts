'use client';

// hooks/school-of-influence/use-soi-coordinator-nav-access.ts
//
// The one appointment lookup the navigation makes, and the one rule for what it
// means. Sidebar (components/Navbar/menu.tsx), in-page chips
// (components/navigation/auto-tab-nav.tsx) and Ctrl+K search
// (hooks/use-page-search.ts) all read it, so they cannot disagree about whether
// an appointed School of Influence coordinator may SEE their own review queue.
//
// ── PERFORMANCE ─────────────────────────────────────────────────────────────
// ONE fetch per session, never per render, and never for somebody who does not
// need it:
//   • `enabled` is false while permissions load, for super admins, and for
//     anyone who already holds the key — those users are already shown
//     everything this would reveal, so the query never runs at all.
//   • The three surfaces share one React Query key, so they de-duplicate into a
//     single request no matter how many of them mount.
//   • staleTime/gcTime are Infinity: the appointment cannot change under a
//     signed-in user without an admin acting, and a stale `false` is exactly
//     today's behaviour.
//   • Nothing blocks rendering. While the query is in flight the verdict is
//     false, so the menu paints at its current speed for the ~7,000 users who
//     are not coordinators and gains one link when the answer arrives.
//
// ── WHAT IT GRANTS ──────────────────────────────────────────────────────────
// VISIBILITY ONLY, and only over `cohort.manage`, which in MENU_PERMISSIONS
// maps to exactly the four School of Influence admin screens (applications,
// coordinators, attendance, lifecycle) and nothing else in the platform. The
// programme's Settings screen is deliberately NOT among them: it carries
// startup_studio.school_of_influence.configure, which no appointment satisfies.
//
// The enriched map is used by nav filters only. It is never fed back into
// usePermissions(), so RoutePermissionGuard still evaluates the real key and
// still falls through to the subtree's own fallbackCheck — the database remains
// the thing that decides, exactly as before.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { hasActiveSoiCoordinatorAppointment } from '@/lib/services/school-of-influence/coordinator-appointment';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * The permission key an active School of Influence appointment stands in for,
 * in the navigation only. Chosen because it is the key those screens already
 * declare, so the chip a coordinator sees and the screen they open are gated on
 * the same word.
 */
export const SOI_COORDINATOR_NAV_KEY = 'cohort.manage';

/**
 * True when the signed-in user's School of Influence access comes from an
 * appointment rather than a permission key.
 */
export function useIsSoiCoordinator(): boolean {
  const { permissions, isSuperAdmin, userProfile, isLoading } = usePermissions();
  const userId = userProfile?.id ?? null;

  // Skip the lookup entirely for everyone the nav already opens these screens
  // to. Only a signed-in user WITHOUT the key can change their nav by asking.
  const enabled =
    !isLoading &&
    !isSuperAdmin &&
    !!userId &&
    permissions[SOI_COORDINATOR_NAV_KEY] !== true;

  const { data } = useQuery({
    queryKey: ['soi-coordinator-appointment', userId],
    queryFn: () => hasActiveSoiCoordinatorAppointment(userId as string),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return data === true;
}

/**
 * The caller's permission map as the NAVIGATION should read it.
 *
 * Returns the very same object when there is nothing to add, so the memo chains
 * downstream (the sidebar's roleData, the search registry) keep their identity
 * and do not rebuild.
 */
export function withSoiCoordinatorNavAccess(
  permissions: Record<string, boolean>,
  isSoiCoordinator: boolean
): Record<string, boolean> {
  if (!isSoiCoordinator) return permissions;
  if (permissions[SOI_COORDINATOR_NAV_KEY] === true) return permissions;
  return { ...permissions, [SOI_COORDINATOR_NAV_KEY]: true };
}

/**
 * Convenience for surfaces that only want the finished map.
 */
export function useSoiCoordinatorNavPermissions(
  permissions: Record<string, boolean>
): Record<string, boolean> {
  const isSoiCoordinator = useIsSoiCoordinator();
  return useMemo(
    () => withSoiCoordinatorNavAccess(permissions, isSoiCoordinator),
    [permissions, isSoiCoordinator]
  );
}
