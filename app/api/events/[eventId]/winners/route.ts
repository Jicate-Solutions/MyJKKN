export const dynamic = 'force-dynamic';

// ============================================================================
// /api/events/[eventId]/winners — 1st / 2nd / 3rd place for a CULTURAL event
// (BUG-006273). The cultural counterpart of the tournament "Record winners"
// (#4222): a cultural event's participants are events_registrations rows, so
// the place is events_registrations.final_rank.
//
//   GET  — the recorded winners, for anyone who can read the event. Managers
//          also get every registration to choose from.
//   POST — { changes: [{ registrationId, final_rank: 1|2|3|null }] }. Written by
//          fn_set_event_registration_ranks on the CALLER's session, so the
//          database checks creator / in-charge / admin itself, applies the
//          whole list in one transaction, and the column guard trigger sees the
//          real caller. Nothing here writes with the service role.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import type { EventWinnersPayload, WinnerRegistration } from '@/hooks/events/use-event-winners';

const NO_ACCESS =
  "Only the event's creator, its in-charge or an administrator can record winners.";

const EMPTY: EventWinnersPayload = { canManage: false, forms: [], registrations: [] };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const { user } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to see the winners.' }, { status: 401 });
  }

  // Readable to the caller? Asked on THEIR session, so RLS on events decides.
  const db = await createServerSupabaseClient();
  const { data: event } = await (db as any)
    .from('events')
    .select('id, event_type')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (event.event_type !== 'cultural') return NextResponse.json(EMPTY);

  const { data: allowed } = await (db as any).rpc('fn_can_record_event_winners', {
    p_event_id: eventId,
  });
  const canManage = allowed === true;

  // Participant rows are read with the service role: a viewer cannot read other
  // people's registrations, but the winners of an event they can see are public
  // to them — only the placed rows are returned to a non-manager.
  const svc = createServiceRoleClient();
  let regQuery = (svc as any)
    .from('events_registrations')
    .select('id, form_id, participant_name, institution_name, department, status, final_rank')
    .eq('event_id', eventId)
    .order('participant_name', { ascending: true });
  if (!canManage) regQuery = regQuery.not('final_rank', 'is', null);
  const [{ data: regs, error: regErr }, { data: forms }] = await Promise.all([
    regQuery,
    (svc as any).from('event_registration_forms').select('id, name').eq('event_id', eventId),
  ]);
  if (regErr) {
    return NextResponse.json({ error: 'Could not load the winners. Please try again.' }, { status: 500 });
  }

  const payload: EventWinnersPayload = {
    canManage,
    forms: (forms ?? []) as { id: string; name: string }[],
    registrations: (regs ?? []) as WinnerRegistration[],
  };
  return NextResponse.json(payload);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const { user } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to record winners.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { changes?: unknown };
  const raw = Array.isArray(body.changes) ? body.changes : null;
  const changes = raw?.map((c: any) => ({
    registration_id: typeof c?.registrationId === 'string' ? c.registrationId : null,
    final_rank: c?.final_rank ?? null,
  }));
  if (
    !changes ||
    changes.length === 0 ||
    changes.some(
      (c) => !c.registration_id || !(c.final_rank === null || [1, 2, 3].includes(c.final_rank)),
    )
  ) {
    return NextResponse.json(
      { error: 'Each change needs a registration and a place of 1, 2, 3 or none.' },
      { status: 400 },
    );
  }

  const db = await createServerSupabaseClient();
  const { data, error } = await (db as any).rpc('fn_set_event_registration_ranks', {
    p_event_id: eventId,
    p_changes: changes,
  });
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: 'Could not save the winners. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: data ?? 0 });
}
