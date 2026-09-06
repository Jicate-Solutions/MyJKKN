export const dynamic = 'force-dynamic';

// /api/events/tournament/[eventId]/entries
//   GET — organizer list of entries for a tournament (joined with payment + roster).
//
// There is deliberately NO POST here. Tournament entries are created ONLY by
// students self-registering through /api/events/tournament/[eventId]/public-register
// (single registration path, 2026-07); organizers configure the form and manage
// existing entries, but cannot register anyone. Removing the handler makes POST
// return 405.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { canViewTournament } from '@/lib/services/events/tournament/organizer-access';

// ---------------------------------------------------------------------------
// GET — list entries for the organizer view
// ---------------------------------------------------------------------------
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
    const { data: entries, error } = await (svc as any)
      .from('tournament_entries')
      .select(`
        *,
        registration:events_registrations!tournament_entries_registration_id_fkey (
          payment_status, payment_amount, participant_phone, participant_email
        ),
        members:tournament_team_members ( * )
      `)
      .eq('event_id', eventId)
      .order('division_id', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the joined registration's payment fields onto the entry for the UI.
    const flattened = (entries ?? []).map((e: any) => ({
      ...e,
      payment_status: e.registration?.payment_status ?? null,
      payment_amount: e.registration?.payment_amount ?? null,
      registration: undefined,
    }));

    return NextResponse.json({ entries: flattened });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load entries' },
      { status: 500 }
    );
  }
}
