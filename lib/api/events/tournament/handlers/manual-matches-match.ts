// POST   /api/events/tournament/[eventId]/manual-matches            — add a match
// PATCH  /api/events/tournament/[eventId]/manual-matches/[matchId]  — edit a match
// DELETE /api/events/tournament/[eventId]/manual-matches/[matchId]  — delete a match
// For a division in manual fixture mode (migration 20271007170000). The DB
// functions hold every rule (manual mode, no result yet, both sides active and
// different, one match per entry per round, sides unchanged since the
// organiser looked); these routes check access, shape and that the match /
// division is in this tournament. SESSION client, so the RPC guards run.

import { NextRequest, NextResponse } from 'next/server';
import { guard, readBody, invalidMatch, isUuidOrNull, matchInEvent } from '../manual-matches-shared';
import type { ManualMatchDto } from '@/types/tournament';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> }
) {
  try {
    const { eventId, matchId } = await params;
    const g = await guard(eventId);
    if ('res' in g) return g.res;
    const body = await readBody(request);
    if (!body) return NextResponse.json({ error: 'A JSON object body is required' }, { status: 400 });
    const dto = body as Partial<ManualMatchDto>;
    const bad = invalidMatch(dto);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    if (!('expected_side_a' in dto) || !('expected_side_b' in dto)
        || !isUuidOrNull(dto.expected_side_a) || !isUuidOrNull(dto.expected_side_b)) {
      return NextResponse.json({ error: 'expected_side_a and expected_side_b must be uuids or null' }, { status: 400 });
    }

    const match = await matchInEvent(g.auth, eventId, matchId);
    if (!match || match.division_id !== dto.division_id) {
      return NextResponse.json({ error: 'Match not found for this tournament' }, { status: 404 });
    }

    const { data, error } = await (g.auth as any).rpc('fn_tournament_manual_match_save', {
      p_division_id: dto.division_id,
      p_match_id: matchId,
      p_round_no: dto.round_no,
      p_round_label: dto.round_label ?? null,
      p_side_a: dto.side_a_entry_id,
      p_side_b: dto.side_b_entry_id,
      p_expected_side_a: dto.expected_side_a,
      p_expected_side_b: dto.expected_side_b,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ match: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save the match' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> }
) {
  try {
    const { eventId, matchId } = await params;
    const g = await guard(eventId);
    if ('res' in g) return g.res;
    const body = await readBody(request);
    if (!body || !isUuidOrNull(body.expected_side_a) || !isUuidOrNull(body.expected_side_b)
        || !('expected_side_a' in body) || !('expected_side_b' in body)) {
      return NextResponse.json({ error: 'expected_side_a and expected_side_b must be uuids or null' }, { status: 400 });
    }

    const match = await matchInEvent(g.auth, eventId, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found for this tournament' }, { status: 404 });

    const { error } = await (g.auth as any).rpc('fn_tournament_manual_match_delete', {
      p_match_id: matchId,
      p_expected_side_a: body.expected_side_a,
      p_expected_side_b: body.expected_side_b,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete the match' }, { status: 500 });
  }
}
