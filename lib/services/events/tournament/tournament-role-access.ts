// lib/services/events/tournament/tournament-role-access.ts
// Client-side check backing RoutePermissionGuard's fallbackCheck for the
// /events/tournament subtree (2026-07-10).
//
// Returns true when the signed-in user holds ANY per-event role on ANY sports
// tournament — appointed in-charge, committee lead/member, or checked-in
// volunteer. Those users are authorized per event by RLS and the API gates but
// may hold no sports.tournaments.* permission key, so without this they were
// bounced by the route guard before reaching the page.
//
// Entering the module leaks nothing: every page reads through useTournamentAccess
// and every API route through canManageTournament/canViewTournament.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function hasAnyTournamentRole(): Promise<boolean> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_has_any_tournament_role');
    if (error) {
      logger.error('events/tournament', 'fn_has_any_tournament_role failed', error);
      return false;
    }
    return data === true;
  } catch (error) {
    logger.error('events/tournament', 'Unexpected error in hasAnyTournamentRole', error);
    return false;
  }
}
