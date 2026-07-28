'use client';

// hooks/events/use-has-any-tournament-role.ts
// Sidebar visibility for per-event tournament organizers (2026-07-21).
//
// RoutePermissionGuard already lets an appointed in-charge / committee member /
// checked-in volunteer INTO the /events/tournament subtree via its fallbackCheck
// (app/(routes)/events/tournament/layout.tsx -> hasAnyTournamentRole). The sidebar
// had no equivalent seam: filterByPermissions() can only answer "does the user hold
// this permission key?", so the nav link stayed hidden for exactly the people the
// in-charge feature exists for. They could reach the module only by typing the URL.
//
// This hook restores the invariant RoutePermissionGuard's own header states —
// "page-access == sidebar-visibility" — by feeding menu.tsx's permission
// enrichment, the same way expo teams and marathon committees already do.
// It grants NO access the route guard doesn't already grant.

import { useQuery } from '@tanstack/react-query';
import { hasAnyTournamentRole } from '@/lib/services/events/tournament/tournament-role-access';

/**
 * True when the signed-in user holds a per-event role (in-charge, committee
 * lead/member, volunteer) on ANY sports tournament.
 *
 * @param enabled Skip the RPC for users who already hold sports.tournaments.view
 *                (or are super admin) — the menu is visible to them regardless.
 */
export function useHasAnyTournamentRole(enabled = true) {
  const { data } = useQuery({
    queryKey: ['has-any-tournament-role'],
    queryFn: hasAnyTournamentRole,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data === true;
}
