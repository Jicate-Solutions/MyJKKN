// POST   /api/events/tournament/[eventId]/manual-matches            — add a match
// (PATCH / DELETE live in manual-matches-match.ts)
// PATCH  /api/events/tournament/[eventId]/manual-matches/[matchId]  — edit a match
// DELETE /api/events/tournament/[eventId]/manual-matches/[matchId]  — delete a match
// For a division in manual fixture mode (migration 20271007170000). The DB
// functions hold every rule (manual mode, no result yet, both sides active and
// different, one match per entry per round, sides unchanged since the
// organiser looked); these routes check access, shape and that the match /
// division is in this tournament. SESSION client, so the RPC guards run.

import { NextRequest, NextResponse } from 'next/server';
import { guard, readBody, invalidMatch } from '../manual-matches-shared';
import type { ManualMatchDto } from '@/types/tournament';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const g = await guard(eventId);
    if ('res' in g) return g.res;
    const body = await readBody(request);
    if (!body) return NextResponse.json({ error: 'A JSON object body is required' }, { status: 400 });
    const dto = body as Partial<ManualMatchDto>;
    const bad = invalidMatch(dto);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    const { data: division } = await g.auth
      .from('tournament_divisions')
      .select('id')
      .eq('id', dto.division_id as string)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!division) return NextResponse.json({ error: 'Division not found for this tournament' }, { status: 404 });

    const { data, error } = await (g.auth as any).rpc('fn_tournament_manual_match_save', {
      p_division_id: dto.division_id,
      p_match_id: null,
      p_round_no: dto.round_no,
      p_round_label: dto.round_label ?? null,
      p_side_a: dto.side_a_entry_id,
      p_side_b: dto.side_b_entry_id,
      p_expected_side_a: null,
      p_expected_side_b: null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ match: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to add the match' }, { status: 500 });
  }
}

