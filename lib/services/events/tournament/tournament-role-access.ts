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

/** PostgREST hands back either its parsed error body or a PostgrestError, and
 *  PostgrestError extends Error — so `message` and `stack` are NON-ENUMERABLE and
 *  vanish the moment a console renderer stringifies the object. That is why this
 *  module used to report a literal `{}` and tell you nothing. Spell the fields
 *  out instead of passing the object through. */
function describeError(error: any): Record<string, unknown> {
  if (!error || typeof error !== 'object') return { message: String(error) };
  return {
    message: error.message ?? String(error),
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

export async function hasAnyTournamentRole(): Promise<boolean> {
  try {
    const supabase = createClientSupabaseClient();

    // Signed out => no per-event role, which is a legitimate answer rather than a
    // failure. `authenticated` holds the only EXECUTE grant on this SECURITY
    // DEFINER function, so calling it without a session returns 42501 "permission
    // denied" — and the old code logged that expected 401 at error level on every
    // signed-out (or not-yet-hydrated) visit to the tournament subtree.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data, error } = await (supabase as any).rpc('fn_has_any_tournament_role');
    if (error) {
      logger.error('events/tournament', 'fn_has_any_tournament_role failed', describeError(error));
      return false;
    }
    return data === true;
  } catch (error) {
    logger.error('events/tournament', 'Unexpected error in hasAnyTournamentRole', describeError(error));
    return false;
  }
}
