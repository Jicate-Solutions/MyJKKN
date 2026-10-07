// POST /api/events/tournament/[eventId]/matches/[matchId]/side
// Put a different entry into one side of an unplayed knockout match, or fill
// the empty side of a bye, via fn_tournament_set_match_side (migration
// 20271007120000). The function holds every rule — knockout only, slot not fed
// by an earlier match, no result yet, entry active and not already placed — so
// this route only checks access and that the match is in this tournament.
// Called with the user's SESSION client so the RPC's own permission guard runs.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import type { SetMatchSideDto } from '@/types/tournament';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> }
) {
  try {
    const { eventId, matchId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const canManage = await canManageTournament(auth, eventId);
    if (canManage !== true) {
      return NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 });
    }

    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'A JSON object body is required' }, { status: 400 });
    }
    const dto = raw as Partial<SetMatchSideDto>;
    if (dto.slot !== 'a' && dto.slot !== 'b') {
      return NextResponse.json({ error: 'slot must be a | b' }, { status: 400 });
    }
    if (typeof dto.entry_id !== 'string' || !UUID_RE.test(dto.entry_id)) {
      return NextResponse.json({ error: 'entry_id must be a uuid' }, { status: 400 });
    }
    // Required, may be null (the side was empty): guards against overwriting a
    // placement someone else made after this organiser opened the dialog.
    if (!('expected_entry_id' in dto)
        || (dto.expected_entry_id !== null
            && (typeof dto.expected_entry_id !== 'string' || !UUID_RE.test(dto.expected_entry_id)))) {
      return NextResponse.json({ error: 'expected_entry_id must be a uuid or null' }, { status: 400 });
    }

    const { data: match } = await auth
      .from('tournament_matches')
      .select('id')
      .eq('id', matchId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!match) return NextResponse.json({ error: 'Match not found for this tournament' }, { status: 404 });

    const { data, error } = await (auth as any).rpc('fn_tournament_set_match_side', {
      p_match_id: matchId,
      p_slot: dto.slot,
      p_entry_id: dto.entry_id,
      p_expected_entry_id: dto.expected_entry_id,
    });
    if (error) {
      // The function's own messages ("already in this bracket", "next match
      // already has a result", …) are written for the organiser; show them as is.
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ match: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to change the fixture' },
      { status: 500 }
    );
  }
}
