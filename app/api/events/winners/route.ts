export const dynamic = 'force-dynamic';

// ============================================================================
// /api/events/winners?eventId=<id> — 1st / 2nd / 3rd place for a CULTURAL event
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One save changes at most three places per competition; 100 is generous. */
const MAX_CHANGES = 100;

// A fixed path with ?eventId= (not /api/events/[eventId]/winners): a dynamic segment
// costs 2 of Vercel's 2048-route budget, and main sits at the 2000 gate.
function eventIdOf(request: Request): string {
  return new URL(request.url).searchParams.get('eventId') ?? '';
}

/** PostgREST returns at most 1000 rows a request; read the list in pages. */
const PAGE = 1000;

export async function GET(request: NextRequest) {
  const eventId = eventIdOf(request);
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'Event not found' }, { status: 400 });
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
  const registrations: WinnerRegistration[] = [];
  // Keyset pages on id (#4311 r7/r10): offset pages ordered by name skipped or
  // repeated a registration when a row was added, removed or renamed between
  // requests. Sorted by name once everything is in.
  for (let after: string | null = null; ; ) {
    let page = (svc as any)
      .from('events_registrations')
      .select('id, form_id, participant_name, institution_name, department, status, final_rank')
      .eq('event_id', eventId);
    if (!canManage) page = page.not('final_rank', 'is', null);
    if (after) page = page.gt('id', after);
    const { data, error } = await page.order('id', { ascending: true }).limit(PAGE);
    if (error) {
      return NextResponse.json({ error: 'Could not load the winners. Please try again.' }, { status: 500 });
    }
    // Stop only on an empty page: a server whose max-rows is below PAGE
    // returns short pages that are not the end.
    if (!data || data.length === 0) break;
    registrations.push(...(data as WinnerRegistration[]));
    after = (data[data.length - 1] as WinnerRegistration).id;
  }
  registrations.sort(
    (a, b) =>
      (a.participant_name ?? '').localeCompare(b.participant_name ?? '') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const { data: forms } = await (svc as any)
    .from('event_registration_forms')
    .select('id, name')
    .eq('event_id', eventId);

  const payload: EventWinnersPayload = {
    canManage,
    forms: (forms ?? []) as { id: string; name: string }[],
    registrations,
  };
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const eventId = eventIdOf(request);
  const invalid = () =>
    NextResponse.json(
      { error: 'Each change needs a registration and a place of 1, 2, 3 or none.' },
      { status: 400 },
    );
  if (!UUID.test(eventId)) return invalid();
  const { user } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to record winners.' }, { status: 401 });
  }

  // `?? {}`: a literal JSON null body parses fine and must still be a 400.
  const body = ((await request.json().catch(() => null)) ?? {}) as { changes?: unknown };
  const raw = Array.isArray(body.changes) ? body.changes : null;
  // Both keys must be present: a missing final_rank is NOT a clear.
  const complete = (c: any) =>
    c !== null && typeof c === 'object' && 'registrationId' in c && 'final_rank' in c;
  if (raw && !raw.every(complete)) return invalid();
  // expectedRank is optional (an older open tab does not send it); when sent
  // it must be a place or null, and the database refuses a stale one (40001).
  const changes = raw?.map((c: any) => ({
    registration_id: typeof c.registrationId === 'string' ? c.registrationId : null,
    final_rank: c.final_rank,
    ...('expectedRank' in c ? { expected_rank: c.expectedRank } : {}),
  }));
  if (
    !changes ||
    changes.length === 0 ||
    changes.length > MAX_CHANGES ||
    changes.some(
      (c) =>
        !c.registration_id ||
        !UUID.test(c.registration_id) ||
        !(c.final_rank === null || [1, 2, 3].includes(c.final_rank)) ||
        ('expected_rank' in c && !(c.expected_rank === null || [1, 2, 3].includes(c.expected_rank as number))),
    )
  ) {
    return invalid();
  }

  const db = await createServerSupabaseClient();
  const { data, error } = await (db as any).rpc('fn_set_event_registration_ranks', {
    p_event_id: eventId,
    p_changes: changes,
  });
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    // No ties: someone else saved that place first (or the screen was stale).
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Another participant already holds one of those places. Reload to see the latest winners, then try again.' },
        { status: 409 },
      );
    }
    // Two saves on the same rows at once: one waited for, or lost to, the other.
    if (error.code === '40P01' || error.code === '40001') {
      return NextResponse.json(
        { error: 'Someone else saved winners for this event at the same moment. Reload and try again.' },
        { status: 409 },
      );
    }
    if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === '22P02') return invalid();
    return NextResponse.json({ error: 'Could not save the winners. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: data ?? 0 });
}
