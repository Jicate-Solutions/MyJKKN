export const dynamic = 'force-dynamic';

// POST /api/events/tournament/[eventId]/award
// Finalize a division and write verified achievements to the athlete profiles of
// JKKN learners on the placed (gold/silver/bronze) entries, via fn_award_achievements
// (which also sets tournament_entries.final_rank). Called with the user's SESSION
// client so the RPC's sports.tournaments.manage guard passes. Idempotent.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    // manage permission OR per-event in-charge (Tournament In-charge, 2026-07)
    const canManage = await canManageTournament(auth, eventId);
    if (canManage !== true) {
      return NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { division_id?: string };
    if (!body.division_id) {
      return NextResponse.json({ error: 'division_id is required' }, { status: 400 });
    }

    // Guard division belongs to this tournament.
    const { data: division } = await auth
      .from('tournament_divisions')
      .select('id')
      .eq('id', body.division_id)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!division) {
      return NextResponse.json({ error: 'Division not found for this tournament' }, { status: 404 });
    }

    const { data, error } = await auth.rpc('fn_award_achievements', {
      p_division_id: body.division_id,
    });
    if (error) {
      // function messages e.g. "final not completed yet — cannot award"
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return NextResponse.json({ achievements_written: data ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to award achievements' },
      { status: 500 }
    );
  }
}
