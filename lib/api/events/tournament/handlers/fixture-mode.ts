// POST /api/events/tournament/[eventId]/fixture-mode
// Switch a division between auto-generated and manual fixtures
// (fn_tournament_set_fixture_mode, migration 20271007170000).
//   { division_id, mode: 'manual' }  — refused once any result is recorded;
//                                      the drawn matches stay, unlinked.
//   { division_id, mode: 'auto' }    — clears manual mode and regenerates the
//                                      bracket (deletes this division's matches).
// Called with the user's SESSION client so the RPCs' own permission guards run.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import type { SetFixtureModeDto } from '@/types/tournament';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

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
    const dto = raw as Partial<SetFixtureModeDto>;
    if (typeof dto.division_id !== 'string' || !UUID_RE.test(dto.division_id)) {
      return NextResponse.json({ error: 'division_id must be a uuid' }, { status: 400 });
    }
    if (dto.mode !== 'manual' && dto.mode !== 'auto') {
      return NextResponse.json({ error: 'mode must be manual | auto' }, { status: 400 });
    }

    const { data: division } = await auth
      .from('tournament_divisions')
      .select('id')
      .eq('id', dto.division_id)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!division) return NextResponse.json({ error: 'Division not found for this tournament' }, { status: 404 });

    const { error } = await (auth as any).rpc('fn_tournament_set_fixture_mode', {
      p_division_id: dto.division_id,
      p_mode: dto.mode,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 422 });

    if (dto.mode === 'auto') {
      const { data: created, error: genErr } = await auth.rpc('fn_generate_fixtures', {
        p_division_id: dto.division_id,
        p_regenerate: true,
      });
      if (genErr) {
        // The mode is already auto; say why the draw itself failed (e.g. < 2 entries).
        return NextResponse.json({ error: genErr.message, mode: 'auto' }, { status: 422 });
      }
      return NextResponse.json({ mode: 'auto', matches_created: created ?? 0 });
    }
    return NextResponse.json({ mode: 'manual' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to change the fixture mode' },
      { status: 500 }
    );
  }
}
