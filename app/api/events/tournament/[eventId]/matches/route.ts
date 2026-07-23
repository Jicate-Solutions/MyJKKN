export const dynamic = 'force-dynamic';

// GET /api/events/tournament/[eventId]/matches
// Organizer list of matches for a tournament (joined with entry + winner names).
// Requires sports.tournaments.view. (Public scoreboard read is PR4, via a separate
// anon-readable path — NOT this authenticated route.)

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { canViewTournament } from '@/lib/services/events/tournament/organizer-access';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    // view permission OR in-charge OR committee member (Tournament In-charge, 2026-07)
    const canView = await canViewTournament(auth, eventId);
    if (canView !== true) {
      return NextResponse.json({ error: 'Forbidden — sports tournament access only' }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const { data: matches, error } = await (svc as any)
      .from('tournament_matches')
      .select(`
        *,
        side_a:tournament_entries!tournament_matches_side_a_entry_id_fkey ( entry_name ),
        side_b:tournament_entries!tournament_matches_side_b_entry_id_fkey ( entry_name ),
        winner:tournament_entries!tournament_matches_winner_entry_id_fkey ( entry_name )
      `)
      .eq('event_id', eventId)
      .order('division_id', { ascending: true })
      .order('round_no', { ascending: true })
      .order('match_no', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const flat = (matches ?? []).map((m: any) => ({
      ...m,
      side_a_name: m.side_a?.entry_name ?? null,
      side_b_name: m.side_b?.entry_name ?? null,
      winner_name: m.winner?.entry_name ?? null,
      side_a: undefined,
      side_b: undefined,
      winner: undefined,
    }));

    return NextResponse.json({ matches: flat });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load matches' },
      { status: 500 }
    );
  }
}
