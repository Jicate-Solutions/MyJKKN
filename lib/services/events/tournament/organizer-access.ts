// lib/services/events/tournament/organizer-access.ts
// Server-side access checks for tournament API routes (Tournament In-charge, 2026-07).
//
// A tournament can be operated by:
//   - holders of sports.tournaments.manage (role permission — global organizers), OR
//   - the event's IN-CHARGE users (events.config->'incharges', per-event full control).
// Read access additionally extends to committee members of the event (view all
// details; they may only WRITE tasks, which the committees API handles separately).
//
// All checks run on the caller's SESSION client so auth.uid() resolves inside the
// user_has_permission / fn_is_event_incharge / fn_is_event_committee_member RPCs.

type SessionClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
};

export async function isEventIncharge(auth: SessionClient, eventId: string): Promise<boolean> {
  const { data } = await auth.rpc('fn_is_event_incharge', { p_event_id: eventId });
  return data === true;
}

/** manage permission OR per-event in-charge — gates every tournament write. */
export async function canManageTournament(auth: SessionClient, eventId: string): Promise<boolean> {
  const { data: perm } = await auth.rpc('user_has_permission', {
    permission_name: 'sports.tournaments.manage',
  });
  if (perm === true) return true;
  return isEventIncharge(auth, eventId);
}

/**
 * view permission OR manager/in-charge OR committee member OR checked-in volunteer.
 * Gates every tournament read. Committee members and volunteers see the tournament
 * but hold no write rights — those go through canManageTournament().
 */
export async function canViewTournament(auth: SessionClient, eventId: string): Promise<boolean> {
  const { data: perm } = await auth.rpc('user_has_permission', {
    permission_name: 'sports.tournaments.view',
  });
  if (perm === true) return true;
  if (await canManageTournament(auth, eventId)) return true;

  const { data: member } = await auth.rpc('fn_is_event_committee_member', {
    p_event_id: eventId,
  });
  if (member === true) return true;

  const { data: volunteer } = await auth.rpc('fn_is_event_volunteer', { p_event_id: eventId });
  return volunteer === true;
}
