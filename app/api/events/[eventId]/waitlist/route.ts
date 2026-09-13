export const dynamic = 'force-dynamic';

// ============================================================================
// /api/events/[eventId]/waitlist — the organiser's view of who is queuing for
// a full event, in order.
//
//   GET → the queue, the places taken, and whether any offer is outstanding.
//
// There is no POST here on purpose. People join the queue through the public
// registration door (/api/events/[eventId]/public-register), and the head of
// the queue is offered a freed place by a database trigger — not by anything an
// organiser has to remember to press.
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
} from '@/lib/services/events/waitlist-service';
import { logger } from '@/lib/utils/enhanced-logger';

const NO_ACCESS =
  "You do not have access to this event's waiting list. Only the event's creator, its in-charge, or an administrator can see it — it lists named people and their phone numbers. Ask an event coordinator to add you as in-charge.";

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
    if (isMissingObject(gateError)) {
      return NextResponse.json(
        {
          success: true,
          panel: {
            cap_behavior: 'waitlist',
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
