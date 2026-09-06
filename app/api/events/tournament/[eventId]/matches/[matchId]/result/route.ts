export const dynamic = 'force-dynamic';

// POST /api/events/tournament/[eventId]/matches/[matchId]/result
// Record a match result via fn_record_result (which also advances the knockout
// winner into the next match). Called with the user's SESSION client so the RPC's
// internal sports.tournaments.manage guard passes. Requires sports.tournaments.manage.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import type { RecordResultDto } from '@/types/tournament';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> }
) {
  try {
    const { eventId, matchId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    // manage permission OR per-event in-charge (Tournament In-charge, 2026-07)
    const canManage = await canManageTournament(auth, eventId);
    if (canManage !== true) {
      return NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 });
    }

    const dto = (await request.json().catch(() => ({}))) as RecordResultDto;
    if (!dto.status || !['completed', 'walkover', 'disqualified'].includes(dto.status)) {
      return NextResponse.json({ error: 'status must be completed | walkover | disqualified' }, { status: 400 });
    }

    // Guard the match belongs to this tournament.
    const { data: match } = await auth
      .from('tournament_matches')
      .select('id')
      .eq('id', matchId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!match) return NextResponse.json({ error: 'Match not found for this tournament' }, { status: 404 });

    const { data, error } = await auth.rpc('fn_record_result', {
      p_match_id: matchId,
      p_status: dto.status,
      p_winner_entry_id: dto.winner_entry_id ?? null,
      p_score_a: dto.score_a ?? null,
      p_score_b: dto.score_b ?? null,
      p_sets: dto.sets ?? null,
      p_notes: dto.notes ?? null,
    });
    if (error) {
      // function-raised messages (e.g. "winner required for a completed match")
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return NextResponse.json({ match: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record result' },
      { status: 500 }
    );
  }
}
