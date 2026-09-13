export const dynamic = 'force-dynamic';

// ============================================================================
// /api/events/[eventId]/waitlist — the organiser's view of who is queuing for
// a full event, in order.
//
//   GET  → the queue, the places taken, and whether any offer is outstanding.
//   POST → re-issue one guest's one-time claim code (action: 'reissue_code').
//
// Nobody is added or promoted from here, on purpose: people join the queue
// through the public registration door (/api/events/[eventId]/public-register),
// and the head of the queue is offered a freed place by a database trigger, not
// by anything an organiser has to remember to press. The one thing an organiser
// DOES have to do is read a guest their claim code down the phone — so the one
// write here is issuing a fresh one when that call goes wrong.
//
// ---------------------------------------------------------------------------
// Failure is explicit (house rule #27)
// ---------------------------------------------------------------------------
// A denial returns { success:false, error } with a sentence the organiser can
// act on. Never a redirect, never a silently empty queue — an empty queue and
// "you may not see this queue" must not look the same.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  MODULE,
  deliverPendingOffers,
  getWaitlistPanel,
  isMissingObject,
  reissueClaimCode,
} from '@/lib/services/events/waitlist-service';
import { logger } from '@/lib/utils/enhanced-logger';

const NO_ACCESS =
  "You do not have access to this event's waiting list. Only the event's creator, its in-charge, or an administrator can see it — it lists named people and their phone numbers. Ask an event coordinator to add you as in-charge.";

/**
 * POST /api/events/[eventId]/waitlist — re-issue a guest's one-time claim code.
 *
 * The whole claim mechanism travels through a telephone call, and telephone
 * calls go wrong: a character misheard, nobody answering, a note thrown away.
 * Without this, one bad call costs that person their place AND holds the seat
 * for good, because an offer has no deadline and cannot be withdrawn. Issuing a
 * new code invalidates the previous one, which is the same operation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Please sign in to manage this event's waiting list." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    waitlist_id?: string;
  };
  if (body.action !== 'reissue_code' || !body.waitlist_id) {
    return NextResponse.json(
      { success: false, error: 'Unsupported request.' },
      { status: 400 }
    );
  }

  const db = await createServerSupabaseClient();
  const { data: allowed, error: gateError } = await (db as any).rpc(
    'fn_can_manage_event_waitlist',
    { p_event_id: eventId }
  );

  if (gateError) {
    if (isMissingObject(gateError)) {
      return NextResponse.json(
        { success: false, error: 'The waiting list is not available on this environment yet.' },
        { status: 503 }
      );
    }
    logger.error(MODULE, 'waitlist gate failed on re-issue', gateError);
    return NextResponse.json(
      { success: false, error: 'Could not check your access to this waiting list. Please try again.' },
      { status: 500 }
    );
  }
  if (allowed !== true) {
    return NextResponse.json({ success: false, error: NO_ACCESS, code: 'no_access' }, { status: 403 });
  }

  const service = createServiceRoleClient();

  // The gate above is for the EVENT; this confirms the row belongs to it, so a
  // coordinator of one event cannot re-issue a code on another event's queue by
  // naming its row id.
  const { data: row } = await (service as any)
    .from('event_registration_waitlist')
    .select('id')
    .eq('id', body.waitlist_id)
    .eq('event_id', eventId)
    .maybeSingle();
  if (!row) {
    return NextResponse.json(
      { success: false, error: 'That waiting-list entry does not belong to this event.' },
      { status: 404 }
    );
  }

  const code = await reissueClaimCode(service, body.waitlist_id);
  if (!code) {
    return NextResponse.json(
      {
        success: false,
        error:
          'A new code could not be issued. This only works while a place is being held for somebody who has no MyJKKN account.',
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ success: true, claim_code: code }, { status: 200 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Please sign in to see this event's waiting list." },
      { status: 401 }
    );
  }

  const db = await createServerSupabaseClient();

  // The gate is the DB's, not the page's: the console has no client-side access
  // gate, and the event in-charge named in events.config->incharges is not the
  // creator. Same four branches as the feedback and messages gates.
  const { data: allowed, error: gateError } = await (db as any).rpc(
    'fn_can_manage_event_waitlist',
    { p_event_id: eventId }
  );

  if (gateError) {
    // The gate function ships in the same migration as the table. Until that is
    // applied the honest answer is "not available yet", not "access denied".
    //
    // `cap_behavior: null` means NOT READ, and it is null rather than
    // 'waitlist' deliberately. This branch has not been able to check the
    // caller's authority — the function that does that is the one that is
    // missing — so it must not report an event value it never queried. It said
    // 'waitlist' before, which was a panel stating a fact nobody looked up.
    if (isMissingObject(gateError)) {
      return NextResponse.json(
        {
          success: true,
          panel: {
            cap_behavior: null,
            max_registrations: null,
            taken: 0,
            entries: [],
            waiting_count: 0,
            offered_count: 0,
            not_yet_available: true,
          },
        },
        { status: 200 }
      );
    }
    logger.error(MODULE, 'waitlist gate failed', gateError);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not check your access to this waiting list. Please try again.',
      },
      { status: 500 }
    );
  }

  if (allowed !== true) {
    return NextResponse.json(
      { success: false, error: NO_ACCESS, code: 'no_access' },
      { status: 403 }
    );
  }

  const service = createServiceRoleClient();

  // Opening the queue is also the moment to announce any offer the database has
  // already made. Best effort — a failed announcement must not blank the card.
  try {
    await deliverPendingOffers(service, eventId);
  } catch (err) {
    logger.warn(MODULE, 'offer announcement pass failed', err);
  }

  try {
    const panel = await getWaitlistPanel(service, eventId);
    return NextResponse.json({ success: true, panel }, { status: 200 });
  } catch (err) {
    logger.error(MODULE, 'waitlist read failed', err);
    return NextResponse.json(
      { success: false, error: 'Could not load the waiting list. Please try again.' },
      { status: 500 }
    );
  }
}
