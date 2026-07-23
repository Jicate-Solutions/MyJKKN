export const dynamic = 'force-dynamic';

// POST /api/events/tournament/[eventId]/fixtures
// Generate the bracket/schedule for a division by calling fn_generate_fixtures.
// IMPORTANT: the RPC is called via the user's SESSION client (not service-role) so
// the function's internal user_has_permission(auth.uid()) guard passes. Requires
// sports.tournaments.manage.

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

    const body = (await request.json().catch(() => ({}))) as {
      division_id?: string;
      regenerate?: boolean;
      mode?: 'fixtures' | 'pool_knockout';
    };
    if (!body.division_id) {
      return NextResponse.json({ error: 'division_id is required' }, { status: 400 });
    }

    // Sanity: division belongs to this tournament (defends against cross-event IDs).
    const { data: division } = await auth
      .from('tournament_divisions')
      .select('id')
      .eq('id', body.division_id)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!division) {
      return NextResponse.json({ error: 'Division not found for this tournament' }, { status: 404 });
    }

    // mode='pool_knockout' (v2): build the knockout stage from finished pool standings.
    // Otherwise: generate the initial fixtures (group/round-robin/knockout).
    const { data, error } =
      body.mode === 'pool_knockout'
        ? await auth.rpc('fn_generate_pool_knockout', {
            p_division_id: body.division_id,
            p_regenerate: !!body.regenerate,
          })
        : await auth.rpc('fn_generate_fixtures', {
            p_division_id: body.division_id,
            p_regenerate: !!body.regenerate,
          });
    if (error) {
      // Surface the function's own messages (e.g. "need at least 2 entries",
      // "fixtures already exist") as a 422 the UI can show verbatim.
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return NextResponse.json({ matches_created: data ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate fixtures' },
      { status: 500 }
    );
  }
}
