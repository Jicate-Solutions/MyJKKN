// Startup-studio module; two subtrees exempted because each carries its OWN
// layout guard. Created 2026-06-19. Canonical permission enforcement via
// RoutePermissionGuard (enforces each route's declared MENU_PERMISSIONS
// permission; see PR #1512).
//
// EXEMPT ≠ UNGATED. Both exempted subtrees re-enforce the very same declared
// permission in their own RoutePermissionGuard, and each adds the fallbackCheck
// this outer guard cannot express:
//   • /solve-for-100/leaderboard — committee membership.
//   • /school-of-influence       — programme membership (decision 6) and, since
//     2026-08-13, an active coordinator appointment.
//
// The School of Influence exemption is a BUG FIX, not a widening (BUG-005799 /
// BUG-005800). Nesting meant this outer guard ran FIRST and resolved the route's
// permission by ancestor match to '/startup-studio' ->
// startup_studio.analytics.view. It has no fallbackCheck, so it denied every
// member and every appointed coordinator before the subtree's own guard — the
// one written to admit them — was ever reached. The subtree's decision-6 gate
// has therefore been decorative since this layout shipped. Nothing gets looser:
// the inner guard runs the identical isPageAccessible() check on the identical
// declared key, and the programme's Settings screen keeps its own
// startup_studio.school_of_influence.configure gate on top, which no appointment
// satisfies.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function StartupStudioLayout({ children }: { children: ReactNode }) {
  return (
    <RoutePermissionGuard
      exemptPrefixes={[
        '/startup-studio/solve-for-100/leaderboard',
        '/startup-studio/school-of-influence',
      ]}
    >
      {children}
    </RoutePermissionGuard>
  );
}
