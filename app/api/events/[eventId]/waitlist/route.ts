export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/events/[eventId]/waitlist — the organiser's view of who is queuing
// for a full event, in order, and any place currently being held.
//
// Nobody is added, promoted or removed from here, on purpose: people join the
// queue through the public registration door, a freed place is offered by the
// database, a held place is taken up through that same door or lapses after
// 24 hours. Opening this view is one of the moments the queue is settled and
// pending offers are announced.
//
// Failure is explicit (house rule #27): a denial returns { success:false,
// error } with a sentence the organiser can act on. Never a redirect, never a
// silently empty queue.
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
  settleQueue,
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

  // The gate is the DB's, not the page's: the console has no client-side
  // access gate, and the event in-charge named in events.config->incharges is
  // not the creator.
  const { data: allowed, error: gateError } = await (db as any).rpc(
    'fn_can_manage_event_waitlist',
    { p_event_id: eventId }
  );

  if (gateError) {
    // The gate ships in the same migration as the table. Until it is applied
    // the honest answer is "not available yet", and cap_behavior is null —
    // NOT READ — because this branch could not check the caller's authority.
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
      { success: false, error: 'Could not check your access to this waiting list. Please try again.' },
      { status: 500 }
    );
  }

  if (allowed !== true) {
    return NextResponse.json({ success: false, error: NO_ACCESS, code: 'no_access' }, { status: 403 });
  }

  const service = createServiceRoleClient();

  // Opening the queue is also a moment to lapse stale holds, offer free places
  // and announce them. Best effort — a failed pass must not blank the card.
  const settled = await settleQueue(service, eventId);
  if (settled.error) logger.warn(MODULE, 'settle pass failed', settled.error);
  await deliverPendingOffers(service, eventId);

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
